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

const CANARY_PLAINTEXT = 'ARCSPRO_KEY_CANARY_2026';
const SETTING_KEY_CANARY = 'pii_key_canary';
const SETTING_KEY_FINGERPRINT = 'pii_key_fingerprint';

/**
 * 计算密钥指纹（前 8 位 SHA-256，不暴露密钥本身）
 */
function computeKeyFingerprint(keyHex) {
  if (!keyHex) return 'UNSET';
  return crypto.createHash('sha256').update(keyHex).digest('hex').slice(0, 16);
}

function getActiveKeyVersion() {
  return process.env.PII_ACTIVE_KEY_VERSION || 'v1';
}

function getVersionedKey(prefix, version) {
  return process.env[`${prefix}_${version.toUpperCase()}`] || '';
}

function getCiphertextKeyVersion(ciphertext) {
  if (!isEncrypted(ciphertext)) return null;
  const parts = ciphertext.split(':');
  return parts.length === 6 ? parts[2] : null;
}

function parseStoredFingerprints(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function getSameVersionFingerprintMismatch(stored, current) {
  if (!stored?.version || stored.version !== current.version) return null;
  if (
    stored.encryptionKeyFingerprint &&
    stored.encryptionKeyFingerprint !== current.encryptionKeyFingerprint
  ) {
    return 'encryption_key_mismatch';
  }
  if (stored.hmacKeyFingerprint && stored.hmacKeyFingerprint !== current.hmacKeyFingerprint) {
    return 'hmac_key_mismatch';
  }
  return null;
}

/**
 * 获取当前环境的密钥指纹
 */
export function getCurrentKeyFingerprints() {
  const version = getActiveKeyVersion();
  const encKeyHex = getVersionedKey('PII_ENCRYPTION_KEY', version);
  const hmacKeyHex = getVersionedKey('PII_HMAC_KEY', version);
  return {
    version,
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
  const storedFP = parseStoredFingerprints(storedFingerprint);

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
  const fingerprintMismatch = getSameVersionFingerprintMismatch(storedFP, fingerprints);

  if (canaryValid && !fingerprintMismatch) {
    const canaryVersion = getCiphertextKeyVersion(storedCanary);
    const canaryRotatedFrom =
      canaryVersion === fingerprints.version ? null : canaryVersion || 'plaintext';

    if (canaryRotatedFrom) {
      const rotatedCanary = encryptField(CANARY_PLAINTEXT);
      await setSetting(knex, SETTING_KEY_CANARY, rotatedCanary);
      console.log(
        `[key-guard] ✅ canary 已从 ${canaryRotatedFrom} 迁移到 ${fingerprints.version}`,
      );
    }

    // 更新当前活跃版本的指纹记录。
    await setSetting(knex, SETTING_KEY_FINGERPRINT, JSON.stringify(fingerprints));

    console.log('[key-guard] ✅ 加密密钥验证通过');
    console.log(`[key-guard]    密钥指纹: ${fingerprints.encryptionKeyFingerprint}`);

    return {
      status: 'ok',
      details: {
        ...fingerprints,
        ...(canaryRotatedFrom ? { canaryRotatedFrom } : {}),
      },
    };
  }

  // ── 密钥不匹配！──────────────────────────────────────────────
  const errorMsg = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║  ⛔  PII 密钥不匹配！加密数据或盲索引将不可用                  ║',
    '╠══════════════════════════════════════════════════════════════╣',
    `║  数据库记录的密钥指纹: ${storedFP.encryptionKeyFingerprint || 'UNKNOWN'}`,
    `║  当前 .env 的密钥指纹: ${fingerprints.encryptionKeyFingerprint}`,
    `║  不匹配类型: ${fingerprintMismatch || 'canary_decryption_failed'}`,
    '║',
    '║  可能原因：',
    '║  1. .env 文件被意外替换或覆盖',
    '║  2. 恢复了不同环境的数据库备份',
    '║  3. 使用了错误的 .env 文件',
    '║',
    '║  解决方法：',
    '║  1. 从备份中恢复正确的 .env 文件',
    `║     (检查 backups/ 目录下的 door_backup_*.env 文件)`,
    `║  2. 确认 ${fingerprintMismatch === 'hmac_key_mismatch' ? 'PII_HMAC_KEY' : 'PII_ENCRYPTION_KEY'}_${fingerprints.version.toUpperCase()} 与当前活跃版本一致`,
    '║  3. 不要删除 pii_key_canary；按密钥轮换手册恢复旧密钥或执行受控迁移',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');

  console.error(errorMsg);

  // 生产环境：拒绝启动
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[key-guard] FATAL: PII key mismatch (${fingerprintMismatch || 'canary_decryption_failed'}); refusing startup.`,
    );
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

    const storedFingerprint = parseStoredFingerprints(
      await getSetting(knex, SETTING_KEY_FINGERPRINT),
    );
    const fingerprints = getCurrentKeyFingerprints();
    const fingerprintMismatch = getSameVersionFingerprintMismatch(
      storedFingerprint,
      fingerprints,
    );
    if (fingerprintMismatch) {
      return { healthy: false, reason: fingerprintMismatch };
    }

    const decrypted = decryptField(storedCanary);
    if (decrypted === CANARY_PLAINTEXT) {
      return { healthy: true, fingerprint: fingerprints.encryptionKeyFingerprint };
    }

    return { healthy: false, reason: 'key_mismatch' };
  } catch (err) {
    return { healthy: false, reason: err.message };
  }
}
