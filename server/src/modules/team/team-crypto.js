import crypto from 'node:crypto';
import { env } from '../../config/env.js';

function deriveKey(input) {
    return crypto.createHash('sha256').update(String(input || '')).digest();
}

const encryptionKey = deriveKey(env.ASSESSMENT_FIELD_ENCRYPTION_KEY);

export function encryptField(value) {
    const normalized = String(value || '').trim();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const plaintext = Buffer.from(normalized, 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        last4: normalized.slice(-4),
    };
}

export function decryptField(record) {
    if (!record) return '';
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        encryptionKey,
        Buffer.from(record.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.isBuffer(record.ciphertext) ? record.ciphertext : Buffer.from(record.ciphertext)),
        decipher.final(),
    ]);
    return plaintext.toString('utf8');
}
