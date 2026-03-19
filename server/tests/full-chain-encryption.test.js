/**
 * 全链路加密测试
 * =================
 *
 * 验证 door+tool 数据加密后，选手服务的各模块是否正常工作。
 *
 * 测试覆盖：
 * 1. 加密工具单元测试（door端）
 * 2. Records Mapper 加密/解密测试
 * 3. Lottery Lists Mapper 加密/解密测试
 * 4. Tool 端加密兼容性测试
 *
 * 注意：数据库相关测试需要运行 PostgreSQL
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 确保加密密钥存在
if (!process.env.PII_ENCRYPTION_KEY_V1) {
    process.env.PII_ACTIVE_KEY_VERSION = 'v1';
    process.env.PII_ENCRYPTION_KEY_V1 = '97f5fd449ebd7955839c088e8e215f1c8ca101ac7f9b16986d20196750913b66';
    process.env.PII_HMAC_KEY_V1 = '71011154c6e018580b26b54ea57322814ec639aee73ceb54b5bf4a5f413e44d5';
}

// 导入 door 端依赖
const {
    encryptField,
    decryptField,
    normalizePhone,
    normalizeIdNumber,
    phoneBlindIndex,
    idNumberBlindIndex,
    isEncrypted,
    encryptRecord,
    decryptRecord,
} = await import('../src/utils/crypto.js');
const { recordMapper } = await import('../src/db/mappers/records.js');
const { lotteryListMapper } = await import('../src/db/mappers/lottery.js');

// ═══════════════════════════════════════════════════════════════════════
// 测试数据
// ═══════════════════════════════════════════════════════════════════════

const TEST_ORG_ID = 'test-org-123';
const TEST_RACE_ID = 1;

const TEST_RECORDS = [
    {
        name: '张三',
        namePinyin: 'ZHANGSAN',
        phone: '138-1234-5678',
        idNumber: '110101199001011234',
        gender: 'M',
        event: '马拉松',
        source: '官方报名',
    },
    {
        name: '李四',
        namePinyin: 'LISI',
        phone: '139-8765-4321',
        idNumber: '310101198512121234',
        gender: 'F',
        event: '半程马拉松',
        source: '合作渠道',
    },
    {
        name: '王五',
        namePinyin: 'WANGWU',
        phone: '13611112222',
        idNumber: '440101199203031234',
        gender: 'M',
        event: '马拉松',
        source: '官方报名',
        emergencyPhone: '138-0000-1111',
    },
];

// ═══════════════════════════════════════════════════════════════════════
// 主测试套件
// ═══════════════════════════════════════════════════════════════════════

describe('全链路加密测试', () => {

    // ═══════════════════════════════════════════════════════════════════════
    // 1. 加密工具单元测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('1. 加密工具单元测试', () => {
        it('应正确规范化手机号', () => {
            assert.equal(normalizePhone('138-1234-5678'), '13812345678');
            assert.equal(normalizePhone('13812345678'), '13812345678');
            assert.equal(normalizePhone(' 13812345678 '), '13812345678');
            assert.equal(normalizePhone('+86-138-1234-5678'), '+8613812345678');
        });

        it('应正确规范化身份证号', () => {
            assert.equal(normalizeIdNumber('110101199001011234'), '110101199001011234');
            assert.equal(normalizeIdNumber(' 110101199001011234 '), '110101199001011234');
            assert.equal(normalizeIdNumber('a123456789'), 'A123456789');
        });

        it('应正确加密和解密手机号', () => {
            const phone = '13812345678';
            const encrypted = encryptField(phone, { tableName: 'records', columnName: 'phone' });

            assert.ok(encrypted.startsWith('enc:v1:'), '密文应有正确前缀');
            assert.notEqual(encrypted, phone, '密文应与明文不同');
            assert.ok(isEncrypted(encrypted), 'isEncrypted 应返回 true');

            const decrypted = decryptField(encrypted, { tableName: 'records', columnName: 'phone' });
            assert.equal(decrypted, phone, '解密后应还原明文');
        });

        it('应正确加密和解密身份证号', () => {
            const idNumber = '110101199001011234';
            const encrypted = encryptField(idNumber, { tableName: 'records', columnName: 'id_number' });

            assert.ok(encrypted.startsWith('enc:v1:'));
            const decrypted = decryptField(encrypted, { tableName: 'records', columnName: 'id_number' });
            assert.equal(decrypted, idNumber);
        });

        it('应为相同手机号生成一致的盲索引', () => {
            const phone = '13812345678';
            const index1 = phoneBlindIndex(phone);
            const index2 = phoneBlindIndex('138-1234-5678'); // 不同格式

            assert.ok(index1, '应生成盲索引');
            assert.equal(index1, index2, '相同号码应生成相同盲索引');
            assert.equal(index1.length, 64, '盲索引应为 64 字符 hex');
        });

        it('应为相同身份证号生成一致的盲索引', () => {
            const idNumber = '110101199001011234';
            const index1 = idNumberBlindIndex(idNumber);
            const index2 = idNumberBlindIndex(' 110101199001011234 '); // 带空格

            assert.ok(index1);
            assert.equal(index1, index2);
        });

        it('应支持双读（明文直接返回）', () => {
            const plaintext = '13800000000';
            const result = decryptField(plaintext, { tableName: 'records', columnName: 'phone' });
            assert.equal(result, plaintext, '明文应原样返回');
        });

        it('相同明文应产生不同密文（随机IV）', () => {
            const phone = '13812345678';
            const encrypted1 = encryptField(phone, { tableName: 'records', columnName: 'phone' });
            const encrypted2 = encryptField(phone, { tableName: 'records', columnName: 'phone' });

            assert.notEqual(encrypted1, encrypted2, '相同明文应产生不同密文');

            // 但两者都应能正确解密
            assert.equal(decryptField(encrypted1, { tableName: 'records', columnName: 'phone' }), phone);
            assert.equal(decryptField(encrypted2, { tableName: 'records', columnName: 'phone' }), phone);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Records Mapper 加密测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('2. Records Mapper 加密测试', () => {
        it('应正确加密插入数据', () => {
            const record = { ...TEST_RECORDS[0], orgId: TEST_ORG_ID, raceId: TEST_RACE_ID };
            const dbRow = recordMapper.toDbInsert(record);

            // 验证加密
            assert.ok(dbRow.phone.startsWith('enc:v1:'), 'phone 应被加密');
            assert.ok(dbRow.id_number.startsWith('enc:v1:'), 'id_number 应被加密');

            // 验证盲索引
            assert.ok(dbRow.phone_hash, 'phone_hash 应存在');
            assert.ok(dbRow.id_number_hash, 'id_number_hash 应存在');

            // 验证盲索引正确性
            assert.equal(dbRow.phone_hash, phoneBlindIndex('13812345678'));
            assert.equal(dbRow.id_number_hash, idNumberBlindIndex('110101199001011234'));

            console.log(`[OK] Mapper 插入加密正确: phone_hash=${dbRow.phone_hash.substring(0, 16)}...`);
        });

        it('应正确解密读取数据', () => {
            const record = { ...TEST_RECORDS[0], orgId: TEST_ORG_ID, raceId: TEST_RACE_ID };
            const dbRow = recordMapper.toDbInsert(record);

            // 模拟从数据库读取
            const decrypted = recordMapper.fromDbRow({
                id: 1,
                org_id: TEST_ORG_ID,
                race_id: TEST_RACE_ID,
                ...dbRow,
                created_at: new Date(),
                updated_at: new Date(),
            });

            assert.equal(decrypted.phone, '13812345678', 'phone 应正确解密');
            assert.equal(decrypted.idNumber, '110101199001011234', 'idNumber 应正确解密');
            assert.equal(decrypted.name, '张三', 'name 应正确');

            console.log(`[OK] Mapper 读取解密正确: phone=${decrypted.phone}`);
        });

        it('应正确处理更新数据', () => {
            const updateData = { phone: '137-9999-8888' };
            const dbRow = recordMapper.toDbUpdate(updateData);

            assert.ok(dbRow.phone.startsWith('enc:v1:'), '新 phone 应被加密');
            assert.ok(dbRow.phone_hash, 'phone_hash 应存在');
            assert.equal(dbRow.phone_hash, phoneBlindIndex('13799998888'));

            console.log(`[OK] Mapper 更新加密正确`);
        });

        it('应正确处理紧急联系人电话', () => {
            const record = { ...TEST_RECORDS[2], orgId: TEST_ORG_ID, raceId: TEST_RACE_ID };
            const dbRow = recordMapper.toDbInsert(record);

            assert.ok(dbRow.emergency_phone.startsWith('enc:v1:'), 'emergency_phone 应被加密');

            const decrypted = recordMapper.fromDbRow({
                id: 3,
                org_id: TEST_ORG_ID,
                race_id: TEST_RACE_ID,
                ...dbRow,
                created_at: new Date(),
                updated_at: new Date(),
            });

            assert.equal(decrypted.emergencyPhone, '13800001111', 'emergencyPhone 应正确解密');

            console.log(`[OK] emergencyPhone 加密解密正确: ${decrypted.emergencyPhone}`);
        });

        it('应支持双读旧数据', () => {
            // 模拟数据库中未加密的旧数据
            const decrypted = recordMapper.fromDbRow({
                id: 1,
                org_id: TEST_ORG_ID,
                race_id: TEST_RACE_ID,
                name: '旧数据选手',
                phone: '13800000000', // 明文
                id_number: '110101199001011111', // 明文
                created_at: new Date(),
                updated_at: new Date(),
            });

            assert.equal(decrypted.phone, '13800000000', '明文 phone 应原样返回');
            assert.equal(decrypted.idNumber, '110101199001011111', '明文 idNumber 应原样返回');

            console.log(`[OK] 双读旧数据支持正确`);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. Lottery Lists Mapper 加密测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('3. Lottery Lists Mapper 加密测试', () => {
        it('应正确加密插入数据', () => {
            const item = {
                name: '白名单选手',
                idNumber: '110101199001011234',
                listType: 'whitelist',
                raceId: TEST_RACE_ID,
            };
            const dbRow = lotteryListMapper.toDbInsert(item, TEST_ORG_ID);

            assert.ok(dbRow.id_number.startsWith('enc:v1:'), 'id_number 应被加密');
            assert.ok(dbRow.id_number_hash, 'id_number_hash 应存在');

            console.log(`[OK] Lottery List 插入加密正确`);
        });

        it('应正确解密读取数据', () => {
            const item = {
                name: '白名单选手',
                idNumber: '110101199001011234',
                listType: 'whitelist',
                raceId: TEST_RACE_ID,
            };
            const dbRow = lotteryListMapper.toDbInsert(item, TEST_ORG_ID);

            const decrypted = lotteryListMapper.fromDbRow({
                id: 1,
                ...dbRow,
                created_at: new Date(),
            });

            assert.equal(decrypted.idNumber, '110101199001011234', 'idNumber 应正确解密');

            console.log(`[OK] Lottery List 读取解密正确: ${decrypted.idNumber}`);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 4. 批量加密/解密测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('4. 批量加密/解密测试', () => {
        it('应正确批量加密记录', () => {
            const records = TEST_RECORDS.map(r => ({ ...r, orgId: TEST_ORG_ID, raceId: TEST_RACE_ID }));

            for (const record of records) {
                const dbRow = recordMapper.toDbInsert(record);

                assert.ok(dbRow.phone.startsWith('enc:v1:'), `${record.name} phone 应被加密`);
                assert.ok(dbRow.id_number.startsWith('enc:v1:'), `${record.name} id_number 应被加密`);
            }

            console.log(`[OK] 批量加密 ${records.length} 条记录成功`);
        });

        it('应正确批量解密记录', () => {
            const records = TEST_RECORDS.map(r => ({ ...r, orgId: TEST_ORG_ID, raceId: TEST_RACE_ID }));
            const dbRows = records.map(r => recordMapper.toDbInsert(r));

            for (let i = 0; i < dbRows.length; i++) {
                const decrypted = recordMapper.fromDbRow({
                    id: i + 1,
                    ...dbRows[i],
                    created_at: new Date(),
                    updated_at: new Date(),
                });

                assert.equal(decrypted.phone, normalizePhone(TEST_RECORDS[i].phone));
                assert.equal(decrypted.idNumber, normalizeIdNumber(TEST_RECORDS[i].idNumber));
            }

            console.log(`[OK] 批量解密 ${dbRows.length} 条记录成功`);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 5. 边界情况测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('5. 边界情况测试', () => {
        it('应正确处理空值', () => {
            assert.equal(encryptField('', {}), '');
            assert.equal(decryptField('', {}), '');
        });

        it('应正确处理 null/undefined', () => {
            assert.equal(normalizePhone(null), '');
            assert.equal(normalizePhone(undefined), '');
            assert.equal(normalizeIdNumber(null), '');
        });

        it('不应重复加密', () => {
            const phone = '13812345678';
            const encrypted1 = encryptField(phone, { tableName: 'records', columnName: 'phone' });
            const encrypted2 = encryptField(encrypted1, { tableName: 'records', columnName: 'phone' });

            assert.equal(encrypted1, encrypted2, '不应重复加密');
        });

        it('应正确处理非中国手机号', () => {
            const phone = '+1-555-123-4567';
            const normalized = normalizePhone(phone);
            assert.equal(normalized, '+15551234567', '国际号码应保留 + 号');

            const encrypted = encryptField(normalized, { tableName: 'records', columnName: 'phone' });
            const decrypted = decryptField(encrypted, { tableName: 'records', columnName: 'phone' });
            assert.equal(decrypted, normalized);
        });

        it('密文格式应有正确的组成部分', () => {
            const phone = '13812345678';
            const encrypted = encryptField(phone, { tableName: 'records', columnName: 'phone' });
            const parts = encrypted.split(':');

            assert.equal(parts.length, 6, '密文应有 6 个部分');
            assert.equal(parts[0], 'enc', '第一部分应为 enc');
            assert.equal(parts[1], 'v1', '第二部分应为 v1');
            assert.ok(parts[2].match(/^v\d+$/), '第三部分应为版本号');
            // parts[3] = IV (base64url)
            // parts[4] = auth tag (base64url)
            // parts[5] = cipher (base64url)
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════
// 运行测试
// ═══════════════════════════════════════════════════════════════════════

console.log('\n========================================');
console.log('全链路加密测试 (不依赖数据库)');
console.log('========================================\n');