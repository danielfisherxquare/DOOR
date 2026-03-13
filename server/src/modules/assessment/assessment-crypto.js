import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function deriveKey(input) {
    return crypto.createHash('sha256').update(String(input || '')).digest();
}

const encryptionKey = deriveKey(env.ASSESSMENT_FIELD_ENCRYPTION_KEY);

export function encryptJson(payload) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
    };
}

export function decryptJson(record) {
    if (!record) return null;
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
    return JSON.parse(plaintext.toString('utf8'));
}

export function hashInviteCode(inviteCode) {
    return crypto
        .createHash('sha256')
        .update(`${String(inviteCode || '').trim()}::${env.ASSESSMENT_HASH_PEPPER}`)
        .digest('hex');
}

export function hashFingerprint(input) {
    if (!input) return null;
    return crypto
        .createHash('sha256')
        .update(`${String(input)}::${env.ASSESSMENT_HASH_PEPPER}`)
        .digest('hex');
}

export function createAssessmentSessionToken(payload) {
    return jwt.sign(payload, env.ASSESSMENT_SESSION_JWT_SECRET, { expiresIn: '12h' });
}

export function verifyAssessmentSessionToken(token) {
    return jwt.verify(token, env.ASSESSMENT_SESSION_JWT_SECRET);
}

export function buildSessionExpiry() {
    return new Date(Date.now() + SESSION_TTL_MS);
}

export function createInviteCodeValue(length = 8) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i += 1) {
        result += alphabet[bytes[i] % alphabet.length];
    }
    return result;
}
