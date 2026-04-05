/**
 * 加密密钥启动验证器
 * ========================
 *
 * 防止 .env 文件中的 PII 加密密钥被意外替换导致数据不可读。
 *
 * 工作原理：
 * 1. 首次启动时，用当前密钥加密一个已知的 canary 值并存入 system_settings 表
 * 2. 后续每次启动时，取出 canary 并尝试解密
 * 3. 如果解密失败 → 密钥已改变 → 拒绝启动并告警
 * 4. 同时记录密钥指纹（SHA-256 前 8 位），便于比对
 */

import crypto from 'crypto';
import { encryptField, decryptField, isEncrypted } from '../utils/crypto.js';

const CANARY_PLAINTEXT = 'DOOR_KEY_CANARY_2026';
const SETTING_KEY_CANARY = 'pii_key_canary';
const SETTING_KEY_FINGERPRINT = 'pii_key_fingerprint';

/**
 * 计算密钥指纹（前 8 位 SHA-256，不暴露密钥本身）
 */
function computeKeyFingerprint(keyHex) {
  if (!keyHex) return 'UNSET';
  return crypto.createHash('sha256').update(keyHex).digest('hex').slice(0, 16);
}

/**
 * 获取当前环境的密钥指纹
 */
export function getCurrentKeyFingerprints() {
  const encKeyHex = process.env.PII_ENCRYPTION_KEY_V1 || '';
  const hmacKeyHex = process.env.PII_HMAC_KEY_V1 || '';
  return {
    version: process.env.PII_ACTIVE_KEY_VERSION || 'v1',
    encryptionKeyFingerprint: computeKeyFingerprint(encKeyHex),
    hmacKeyFingerprint: computeKeyFingerprint(hmacKeyHex),
  };
}

/**
 * 确保 system_settings 表存在
 */
async function ensureSystemSettingsTable(knex) {
  const exists = await knex.schema.hasTable('system_settings');
  if (!exists) {
    await knex.schema.createTable('system_settings', (table) => {
      table.string('key', 255).primary();
      table.text('value').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
}

/**
 * 读取系统设置
 */
async function getSetting(knex, key) {
  const row = await knex('system_settings').where('key', key).first();
  return row?.value ?? null;
}

/**
 * 写入/更新系统设置
 */
async function setSetting(knex, key, value) {
  const exists = await knex('system_settings').where('key', key).first();
  if (exists) {
    await knex('system_settings').where('key', key).update({
      value,
      updated_at: knex.fn.now(),
    });
  } else {
    await knex('system_settings').insert({
      key,
      value,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }
}

/**
 * 启动时验证加密密钥一致性
 *
 * @param {import('knex').Knex} knex - Knex 实例
 * @returns {{ status: 'ok'|'first_run'|'mismatch', details: object }}
 * @throws 如果密钥不匹配且存在加密数据，抛出致命错误
 */
export async function verifyEncryptionKeys(knex) {
  await ensureSystemSettingsTable(knex);

  const fingerprints = getCurrentKeyFingerprints();
  const storedCanary = await getSetting(knex, SETTING_KEY_CANARY);
  const storedFingerprint = await getSetting(knex, SETTING_KEY_FINGERPRINT);

  // ── 首次运行：写入 canary ──────────────────────────────────────
  if (!storedCanary) {
    const encryptedCanary = encryptField(CANARY_PLAINTEXT);
    await setSetting(knex, SETTING_KEY_CANARY, encryptedCanary);
    await setSetting(knex, SETTING_KEY_FINGERPRINT, JSON.stringify(fingerprints));

    console.log('[key-guard] ✅ 首次运行，密钥指纹已注册');
    console.log(`[key-guard]    版本: ${fingerprints.version}`);
    console.log(`[key-guard]    加密密钥指纹: ${fingerprints.encryptionKeyFingerprint}`);
    console.log(`[key-guard]    HMAC密钥指纹: ${fingerprints.hmacKeyFingerprint}`);

    return { status: 'first_run', details: fingerprints };
  }

  // ── 后续运行：验证 canary 可解密 ───────────────────────────────
  const decrypted = decryptField(storedCanary);
  const canaryValid = decrypted === CANARY_PLAINTEXT;

  if (canaryValid) {
    // 更新指纹记录（密钥正确但指纹可能因格式变化需要刷新）
    await setSetting(knex, SETTING_KEY_FINGERPRINT, JSON.stringify(fingerprints));

    console.log('[key-guard] ✅ 加密密钥验证通过');
    console.log(`[key-guard]    密钥指纹: ${fingerprints.encryptionKeyFingerprint}`);

    return { status: 'ok', details: fingerprints };
  }

  // ── 密钥不匹配！──────────────────────────────────────────────
  let storedFP = {};
  try {
    storedFP = JSON.parse(storedFingerprint || '{}');
  } catch { /* ignore */ }

  const errorMsg = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║  ⛔  加密密钥不匹配！数据库中的加密数据将无法解密              ║',
    '╠══════════════════════════════════════════════════════════════╣',
    `║  数据库记录的密钥指纹: ${storedFP.encryptionKeyFingerprint || 'UNKNOWN'}`,
    `║  当前 .env 的密钥指纹: ${fingerprints.encryptionKeyFingerprint}`,
    '║',
    '║  可能原因：',
    '║  1. .env 文件被意外替换或覆盖',
    '║  2. 恢复了不同环境的数据库备份',
    '║  3. 使用了错误的 .env 文件',
    '║',
    '║  解决方法：',
    '║  1. 从备份中恢复正确的 .env 文件',
    `║     (检查 backups/ 目录下的 door_backup_*.env 文件)`,
    '║  2. 确认 PII_ENCRYPTION_KEY_V1 与加密数据时使用的密钥一致',
    '║  3. 如果确认要使用新密钥（旧数据将丢失），删除 system_settings 表',
    '║     中 key=pii_key_canary 的记录后重启',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');

  console.error(errorMsg);

  // 生产环境：拒绝启动
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[key-guard] FATAL: 加密密钥不匹配，拒绝启动。请参照上方日志恢复正确的 .env 文件。');
  }

  // 开发环境：警告但继续
  console.warn('[key-guard] ⚠️ 开发环境继续运行，但加密数据可能无法正确解密');
  return {
    status: 'mismatch',
    details: {
      current: fingerprints,
      stored: storedFP,
    },
  };
}

/**
 * 健康检查：密钥状态
 */
export async function checkKeyHealth(knex) {
  try {
    const storedCanary = await getSetting(knex, SETTING_KEY_CANARY);
    if (!storedCanary) return { healthy: true, reason: 'no_canary_yet' };

    const decrypted = decryptField(storedCanary);
    if (decrypted === CANARY_PLAINTEXT) {
      return { healthy: true, fingerprint: getCurrentKeyFingerprints().encryptionKeyFingerprint };
    }

    return { healthy: false, reason: 'key_mismatch' };
  } catch (err) {
    return { healthy: false, reason: err.message };
  }
}
