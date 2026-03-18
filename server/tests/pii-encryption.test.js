/**
 * PII 加密端到端测试
 * ==================
 *
 * 验证 door 端和 tool 端的加密功能
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

// 确保加密密钥存在
if (!process.env.PII_ENCRYPTION_KEY_V1) {
    process.env.PII_ACTIVE_KEY_VERSION = 'v1';
    process.env.PII_ENCRYPTION_KEY_V1 = '97f5fd449ebd7955839c088e8e215f1c8ca101ac7f9b16986d20196750913b66';
    process.env.PII_HMAC_KEY_V1 = '71011154c6e018580b26b54ea57322814ec639aee73ceb54b5bf4a5f413e44d5';
}

const { default: knex } = await import('../src/db/knex.js');
const { encryptField, decryptField, normalizePhone, normalizeIdNumber, phoneBlindIndex, idNumberBlindIndex } = await import('../src/utils/crypto.js');
const { recordMapper } = await import('../src/db/mappers/records.js');

describe('PII Encryption E2E Tests', () => {
    let orgId;
    let raceId;
    let testRecordId;

    before(async () => {
        await knex.migrate.latest();

        // 清理测试数据
        await knex('records').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();

        // 创建组织和赛事
        const [org] = await knex('organizations')
            .insert({ name: '加密测试组织', slug: 'crypto-test-org' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: '加密测试马拉松',
                date: '2026-06-01',
                location: '北京'
            })
            .returning('*');
        raceId = race.id;
    });

    after(async () => {
        await knex('records').del();
        await knex('races').del();
        await knex('organizations').del();
        await knex.destroy();
    });

    describe('1. 加密工具单元测试', () => {
        it('should normalize phone numbers correctly', () => {
            assert.equal(normalizePhone('138-1234-5678'), '13812345678');
            assert.equal(normalizePhone('13812345678'), '13812345678');
            assert.equal(normalizePhone(' 13812345678 '), '13812345678');
        });

        it('should normalize ID numbers correctly', () => {
            assert.equal(normalizeIdNumber('110101199001011234'), '110101199001011234');
            assert.equal(normalizeIdNumber(' 110101199001011234 '), '110101199001011234');
            assert.equal(normalizeIdNumber('a123456789'), 'A123456789');
        });

        it('should encrypt and decrypt phone', () => {
            const phone = '13812345678';
            const encrypted = encryptField(phone, { tableName: 'records', columnName: 'phone' });

            // 验证密文格式
            assert.ok(encrypted.startsWith('enc:v1:'), '密文应有正确前缀');
            assert.notEqual(encrypted, phone, '密文应与明文不同');

            // 验证密文有 6 个部分 (enc, v1, version, iv, tag, cipher)
            const parts = encrypted.split(':');
            assert.equal(parts.length, 6, '密文应有 6 个部分');

            // 验证可以解密
            const decrypted = decryptField(encrypted, { tableName: 'records', columnName: 'phone' });
            assert.equal(decrypted, phone, '解密后应还原明文');
        });

        it('should encrypt and decrypt ID number', () => {
            const idNumber = '110101199001011234';
            const encrypted = encryptField(idNumber, { tableName: 'records', columnName: 'id_number' });

            assert.ok(encrypted.startsWith('enc:v1:'));
            const decrypted = decryptField(encrypted, { tableName: 'records', columnName: 'id_number' });
            assert.equal(decrypted, idNumber);
        });

        it('should generate consistent blind index for same phone', () => {
            const phone = '13812345678';
            const index1 = phoneBlindIndex(phone);
            const index2 = phoneBlindIndex('138-1234-5678'); // 不同格式，相同号码

            assert.ok(index1, '应生成盲索引');
            assert.equal(index1, index2, '相同号码应生成相同盲索引');
            assert.equal(index1.length, 64, '盲索引应为 64 字符 hex');
        });

        it('should generate consistent blind index for same ID number', () => {
            const idNumber = '110101199001011234';
            const index1 = idNumberBlindIndex(idNumber);
            const index2 = idNumberBlindIndex(' 110101199001011234 '); // 带空格

            assert.ok(index1);
            assert.equal(index1, index2);
        });

        it('should support double-read for plaintext', () => {
            const plaintext = '13800000000';
            // 对明文调用 decryptField 应该直接返回明文
            const result = decryptField(plaintext, { tableName: 'records', columnName: 'phone' });
            assert.equal(result, plaintext, '明文应原样返回');
        });
    });

    describe('2. 数据库加密存储测试', () => {
        it('should store encrypted phone and id_number in database', async () => {
            // 使用 mapper 进行插入，确保加密
            const data = {
                orgId: orgId,
                raceId: raceId,
                name: '测试选手',
                namePinyin: 'CESHIXUANSHOU',
                phone: '13900000001',
                idNumber: '110101199001011111',
                gender: 'M',
                event: '马拉松',
            };

            const dbRow = recordMapper.toDbInsert(data);

            const [inserted] = await knex('records')
                .insert(dbRow)
                .returning('*');

            testRecordId = inserted.id;

            // 验证数据库中存储的是加密值
            const [dbRecord] = await knex('records').where({ id: testRecordId });

            // phone 应该是加密的
            assert.ok(dbRecord.phone.startsWith('enc:v1:'), `phone 应被加密，实际值: ${dbRecord.phone.substring(0, 20)}...`);
            assert.ok(dbRecord.id_number.startsWith('enc:v1:'), 'id_number 应被加密');

            // phone_hash 应该存在
            assert.ok(dbRecord.phone_hash, 'phone_hash 应存在');
            assert.ok(dbRecord.id_number_hash, 'id_number_hash 应存在');

            // 验证 hash 可以用于查询
            const expectedHash = phoneBlindIndex('13900000001');
            assert.equal(dbRecord.phone_hash, expectedHash, 'phone_hash 应正确');
        });

        it('should query by phone_hash', async () => {
            const phoneHash = phoneBlindIndex('13900000001');

            const records = await knex('records')
                .where({ phone_hash: phoneHash })
                .select('*');

            assert.equal(records.length, 1, '应能通过 phone_hash 查询');
            assert.equal(records[0].id, testRecordId);
        });

        it('should query by id_number_hash', async () => {
            const idHash = idNumberBlindIndex('110101199001011111');

            const records = await knex('records')
                .where({ id_number_hash: idHash })
                .select('*');

            assert.equal(records.length, 1, '应能通过 id_number_hash 查询');
        });

        it('should decrypt stored data correctly', async () => {
            const [dbRecord] = await knex('records').where({ id: testRecordId });

            // 解密数据库中的值（需要相同的 AAD 上下文）
            const decryptCtx = {
                tableName: 'records',
                orgId: orgId,
                raceId: raceId,
            };

            const decryptedPhone = decryptField(dbRecord.phone, { ...decryptCtx, columnName: 'phone' });
            const decryptedIdNumber = decryptField(dbRecord.id_number, { ...decryptCtx, columnName: 'id_number' });

            assert.equal(decryptedPhone, '13900000001', '解密后的 phone 应正确');
            assert.equal(decryptedIdNumber, '110101199001011111', '解密后的 id_number 应正确');
        });
    });

    describe('3. 工具端加密兼容性测试', () => {
        it('should verify ciphertext format compatibility', () => {
            // 模拟 tool 端加密
            const phone = '13900000099';
            const doorEncrypted = encryptField(phone, { tableName: 'records', columnName: 'phone' });

            // 验证格式
            const parts = doorEncrypted.split(':');
            assert.equal(parts.length, 6, '密文应有 6 个部分');
            assert.equal(parts[0], 'enc', '第一部分应为 enc');
            assert.equal(parts[1], 'v1', '第二部分应为 v1');
            assert.equal(parts[2], 'v1', '第三部分应为版本号');

            // 验证可以解密
            const decrypted = decryptField(doorEncrypted, { tableName: 'records', columnName: 'phone' });
            assert.equal(decrypted, phone, '加密解密应可逆');
        });

        it('should verify blind index consistency', () => {
            // 相同的明文应产生相同的盲索引
            const phone = '13800138000';
            const index1 = phoneBlindIndex(phone);
            const index2 = phoneBlindIndex(phone);

            assert.equal(index1, index2, '相同明文应产生相同盲索引');
            assert.equal(index1.length, 64, '盲索引长度应为 64');
        });
    });

    describe('4. 边界情况测试', () => {
        it('should handle empty values', () => {
            assert.equal(encryptField('', {}), '');
            assert.equal(decryptField('', {}), '');
        });

        it('should handle null/undefined values', () => {
            assert.equal(normalizePhone(null), '');
            assert.equal(normalizePhone(undefined), '');
            assert.equal(normalizeIdNumber(null), '');
        });

        it('should not double encrypt', () => {
            const phone = '13812345678';
            const encrypted1 = encryptField(phone, { tableName: 'records', columnName: 'phone' });
            const encrypted2 = encryptField(encrypted1, { tableName: 'records', columnName: 'phone' });

            assert.equal(encrypted1, encrypted2, '不应重复加密');
        });

        it('should generate different ciphertext for same plaintext (random IV)', () => {
            const phone = '13812345678';
            const encrypted1 = encryptField(phone, { tableName: 'records', columnName: 'phone' });
            const encrypted2 = encryptField(phone, { tableName: 'records', columnName: 'phone' });

            // 由于随机 IV，相同明文应产生不同密文
            assert.notEqual(encrypted1, encrypted2, '相同明文应产生不同密文');

            // 但两者都应能正确解密
            assert.equal(decryptField(encrypted1, { tableName: 'records', columnName: 'phone' }), phone);
            assert.equal(decryptField(encrypted2, { tableName: 'records', columnName: 'phone' }), phone);
        });
    });
});