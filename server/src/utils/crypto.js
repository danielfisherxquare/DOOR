/**
 * PII 字段级加密工具
 * =====================
 *
 * 基于 AES-256-GCM 的应用层加密，支持：
 * - 字段级加密/解密
 * - 盲索引生成（用于精确匹配查询）
 * - 密钥版本化（支持密钥轮换）
 * - 双读能力（兼容明文旧数据）
 *
 * 密文格式：enc:v1:<keyVersion>:<iv_b64url>:<tag_b64url>:<cipher_b64url>
 */

import crypto from 'crypto';

// ============================================================================
// 配置与常量
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // GCM 推荐 12 字节
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;  // 256 bits

// 密文前缀，用于快速识别
const CIPHERTEXT_PREFIX = 'enc:v1:';

// ============================================================================
// 密钥管理
// ============================================================================

/**
 * 从环境变量获取加密密钥
 * 必须在调用加密函数前完成初始化
 */
function getEncryptionKey(version = 'v1') {
    const keyEnv = `PII_ENCRYPTION_KEY_${version.toUpperCase()}`;
    const keyHex = process.env[keyEnv];

    if (!keyHex) {
        // 开发环境使用默认密钥（生产环境必须设置）
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[crypto] 警告: ${keyEnv} 未设置，使用开发默认密钥`);
            return crypto.createHash('sha256').update(`dev-key-${version}`).digest();
        }
        throw new Error(`[crypto] 环境变量 ${keyEnv} 未设置，生产环境必须配置`);
    }

    if (keyHex.length !== 64) {
        throw new Error(`[crypto] ${keyEnv} 必须是 32 字节的 hex 字符串 (64 字符)`);
    }

    return Buffer.from(keyHex, 'hex');
}

/**
 * 从环境变量获取 HMAC 密钥（用于盲索引）
 */
function getHmacKey(version = 'v1') {
    const keyEnv = `PII_HMAC_KEY_${version.toUpperCase()}`;
    const keyHex = process.env[keyEnv];

    if (!keyHex) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[crypto] 警告: ${keyEnv} 未设置，使用开发默认密钥`);
            return crypto.createHash('sha256').update(`dev-hmac-${version}`).digest();
        }
        throw new Error(`[crypto] 环境变量 ${keyEnv} 未设置，生产环境必须配置`);
    }

    if (keyHex.length !== 64) {
        throw new Error(`[crypto] ${keyEnv} 必须是 32 字节的 hex 字符串 (64 字符)`);
    }

    return Buffer.from(keyHex, 'hex');
}

/**
 * 获取当前活跃的密钥版本
 */
function getActiveKeyVersion() {
    return process.env.PII_ACTIVE_KEY_VERSION || 'v1';
}

// ============================================================================
// 规范化函数
// ============================================================================

/**
 * 规范化身份证号
 * - 去除首尾空格
 * - 英文字母统一大写
 * - 去除无意义空格
 *
 * @param {string} value - 原始身份证号
 * @returns {string} 规范化后的身份证号
 */
export function normalizeIdNumber(value) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * 规范化手机号
 * - 去除首尾空格
 * - 去除展示符号（空格、短横线等）
 * - 中国手机号保持 11 位数字
 *
 * @param {string} value - 原始手机号
 * @returns {string} 规范化后的手机号
 */
export function normalizePhone(value) {
    if (!value || typeof value !== 'string') return '';
    // 去除所有非数字字符（保留国际号码前缀 +）
    const cleaned = value.trim().replace(/[\s\-()]/g, '');
    // 如果是纯数字且长度为 11，认为是中国手机号
    if (/^\d{11}$/.test(cleaned)) {
        return cleaned;
    }
    // 国际号码或其他格式，保持原样
    return cleaned;
}

// ============================================================================
// 加密/解密
// ============================================================================

/**
 * 判断一个值是否已经是加密密文
 *
 * @param {string} value - 待判断的值
 * @returns {boolean} 是否为密文
 */
export function isEncrypted(value) {
    if (!value || typeof value !== 'string') return false;
    return value.startsWith(CIPHERTEXT_PREFIX);
}

/**
 * 加密字段
 *
 * @param {string} plaintext - 明文
 * @param {object} context - 可选的 AAD 上下文（表名、列名等）
 * @returns {string} 密文 (enc:v1:<version>:<iv>:<tag>:<cipher>)
 */
export function encryptField(plaintext, context = {}) {
    // 空值不加密
    if (!plaintext || typeof plaintext !== 'string') return plaintext;
    if (isEncrypted(plaintext)) return plaintext; // 防止重复加密

    const keyVersion = getActiveKeyVersion();
    const key = getEncryptionKey(keyVersion);

    // 生成随机 IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // 创建 cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // 可选：添加 AAD（附加认证数据）
    if (context.tableName || context.columnName || context.orgId || context.raceId) {
        const aadData = JSON.stringify({
            t: context.tableName,
            c: context.columnName,
            o: context.orgId,
            r: context.raceId,
        });
        cipher.setAAD(Buffer.from(aadData, 'utf8'));
    }

    // 加密
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    // 获取 Auth Tag
    const authTag = cipher.getAuthTag();

    // 组装密文：enc:v1:<version>:<iv>:<tag>:<cipher>
    const parts = [
        'enc:v1',
        keyVersion,
        iv.toString('base64url'),
        authTag.toString('base64url'),
        encrypted.toString('base64url'),
    ];

    return parts.join(':');
}

/**
 * 解密字段
 * 支持双读：如果值不是密文，原样返回（兼容旧数据）
 *
 * @param {string} ciphertext - 密文
 * @param {object} context - 可选的 AAD 上下文（必须与加密时一致）
 * @returns {string} 明文
 */
export function decryptField(ciphertext, context = {}) {
    // 空值不解密
    if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;

    // 双读：如果不是密文，原样返回
    if (!isEncrypted(ciphertext)) {
        return ciphertext;
    }

    try {
        // 解析密文格式
        const parts = ciphertext.split(':');
        // 格式: enc:v1:<version>:<iv>:<tag>:<cipher> = 6 parts
        if (parts.length !== 6) {
            console.warn(`[crypto] 无效的密文格式 (expected 6 parts, got ${parts.length})`);
            return '***解密失败***';
        }

        const [, , keyVersion, ivB64, tagB64, cipherB64] = parts;

        // 获取对应版本的密钥
        const key = getEncryptionKey(keyVersion);

        // 解码
        const iv = Buffer.from(ivB64, 'base64url');
        const authTag = Buffer.from(tagB64, 'base64url');
        const encrypted = Buffer.from(cipherB64, 'base64url');

        // 创建 decipher
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        // 可选：验证 AAD
        if (context.tableName || context.columnName || context.orgId || context.raceId) {
            const aadData = JSON.stringify({
                t: context.tableName,
                c: context.columnName,
                o: context.orgId,
                r: context.raceId,
            });
            decipher.setAAD(Buffer.from(aadData, 'utf8'));
        }

        // 解密
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    } catch (err) {
        // 捕获所有解密相关的错误（包括密钥缺失、AAD 不匹配或密文被篡改）
        console.error(`[crypto] 解密失败: ${err.message}`);
        return '***解密失败***';
    }
}

// ============================================================================
// 盲索引
// ============================================================================

/**
 * 生成盲索引（用于等值查询）
 *
 * @param {string} normalizedValue - 规范化后的值
 * @param {string} keyVersion - 密钥版本
 * @returns {string} HMAC-SHA256 hex 字符串
 */
export function blindIndex(normalizedValue, keyVersion) {
    if (!normalizedValue || typeof normalizedValue !== 'string') return null;

    const version = keyVersion || getActiveKeyVersion();
    const hmacKey = getHmacKey(version);

    const hmac = crypto.createHmac('sha256', hmacKey);
    hmac.update(normalizedValue);
    return hmac.digest('hex');
}

/**
 * 为手机号生成盲索引
 *
 * @param {string} phone - 原始手机号
 * @returns {string|null} 盲索引 hex 字符串
 */
export function phoneBlindIndex(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    return blindIndex(normalized);
}

/**
 * 为身份证号生成盲索引
 *
 * @param {string} idNumber - 原始身份证号
 * @returns {string|null} 盲索引 hex 字符串
 */
export function idNumberBlindIndex(idNumber) {
    const normalized = normalizeIdNumber(idNumber);
    if (!normalized) return null;
    return blindIndex(normalized);
}

// ============================================================================
// 批量处理工具
// ============================================================================

/**
 * 加密记录对象中的敏感字段
 *
 * @param {object} record - 记录对象
 * @param {object} context - AAD 上下文
 * @returns {object} 加密后的记录（含 hash 字段）
 */
export function encryptRecord(record, context = {}) {
    if (!record) return record;

    const encrypted = { ...record };
    const ctx = { ...context, tableName: context.tableName || 'records' };

    // 加密敏感字段
    if (record.phone) {
        encrypted.phone = encryptField(record.phone, { ...ctx, columnName: 'phone' });
        encrypted.phone_hash = phoneBlindIndex(record.phone);
    }
    if (record.emergency_phone) {
        encrypted.emergency_phone = encryptField(record.emergency_phone, { ...ctx, columnName: 'emergency_phone' });
    }
    if (record.id_number) {
        encrypted.id_number = encryptField(record.id_number, { ...ctx, columnName: 'id_number' });
        encrypted.id_number_hash = idNumberBlindIndex(record.id_number);
    }

    return encrypted;
}

/**
 * 解密记录对象中的敏感字段
 *
 * @param {object} record - 加密的记录对象
 * @param {object} context - AAD 上下文
 * @returns {object} 解密后的记录
 */
export function decryptRecord(record, context = {}) {
    if (!record) return record;

    const decrypted = { ...record };
    const ctx = { ...context, tableName: context.tableName || 'records' };

    // 解密敏感字段（支持双读）
    if (record.phone) {
        decrypted.phone = decryptField(record.phone, { ...ctx, columnName: 'phone' });
    }
    if (record.emergency_phone) {
        decrypted.emergency_phone = decryptField(record.emergency_phone, { ...ctx, columnName: 'emergency_phone' });
    }
    if (record.id_number) {
        decrypted.id_number = decryptField(record.id_number, { ...ctx, columnName: 'id_number' });
    }

    return decrypted;
}

// ============================================================================
// 密钥生成工具（仅用于初始化）
// ============================================================================

/**
 * 生成新的加密密钥（用于首次设置）
 * 返回 32 字节的 hex 字符串
 */
export function generateKey() {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * 打印所有需要的环境变量配置
 */
export function printEnvConfig() {
    const keyV1 = generateKey();
    const hmacV1 = generateKey();

    console.log('\n# PII 加密配置（添加到 .env）\n');
    console.log(`PII_ACTIVE_KEY_VERSION=v1`);
    console.log(`PII_ENCRYPTION_KEY_V1=${keyV1}`);
    console.log(`PII_HMAC_KEY_V1=${hmacV1}`);
    console.log('\n# 重要：请妥善保管这些密钥，不要提交到 Git！\n');
}