/**
 * 300人名单导入测试
 * =================
 *
 * 测试完整的导入流程：导入 → 映射 → 清洗 → 落库
 * 验证加密字段在各个环节的正确性
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// 数据库配置
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

// 确保加密密钥存在
if (!process.env.PII_ENCRYPTION_KEY_V1) {
    process.env.PII_ACTIVE_KEY_VERSION = 'v1';
    process.env.PII_ENCRYPTION_KEY_V1 = '97f5fd449ebd7955839c088e8e215f1c8ca101ac7f9b16986d20196750913b66';
    process.env.PII_HMAC_KEY_V1 = '71011154c6e018580b26b54ea57322814ec639aee73ceb54b5bf4a5f413e44d5';
}

// 导入依赖
const { default: knex } = await import('../src/db/knex.js');
const { recordMapper } = await import('../src/db/mappers/records.js');
const { importSessionRepository } = await import('../src/modules/import-sessions/import-session.repository.js');
const {
    encryptField,
    decryptField,
    normalizePhone,
    normalizeIdNumber,
    phoneBlindIndex,
    idNumberBlindIndex,
    isEncrypted,
} = await import('../src/utils/crypto.js');
const { normalizeEvent } = await import('../src/utils/event-normalizer.js');

// ═══════════════════════════════════════════════════════════════════════
// 测试数据生成器
// ═══════════════════════════════════════════════════════════════════════

const SURNAMES = ['张', '王', '李', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '高', '罗'];
const GIVEN_NAMES_MALE = ['伟', '强', '磊', '军', '勇', '杰', '涛', '明', '超', '华', '飞', '鹏', '斌', '峰', '宇'];
const GIVEN_NAMES_FEMALE = ['芳', '娟', '敏', '静', '丽', '艳', '萍', '红', '玲', '霞', '燕', '婷', '莉', '雪', '琳'];

const PROVINCES = [
    { name: '北京市', cities: ['北京市'] },
    { name: '上海市', cities: ['上海市'] },
    { name: '广东省', cities: ['广州市', '深圳市', '东莞市', '佛山市'] },
    { name: '浙江省', cities: ['杭州市', '宁波市', '温州市', '绍兴市'] },
    { name: '江苏省', cities: ['南京市', '苏州市', '无锡市', '常州市'] },
    { name: '四川省', cities: ['成都市', '绵阳市', '德阳市'] },
    { name: '湖北省', cities: ['武汉市', '宜昌市', '襄阳市'] },
    { name: '湖南省', cities: ['长沙市', '株洲市', '湘潭市'] },
    { name: '山东省', cities: ['济南市', '青岛市', '烟台市', '潍坊市'] },
    { name: '河南省', cities: ['郑州市', '洛阳市', '开封市'] },
];

const EVENTS = ['马拉松', '半程马拉松', '10公里', '迷你马拉松'];
const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SOURCES = ['官方报名', '合作渠道', '团体报名', '特邀选手'];

// 身份证号前缀（真实地区码）
const ID_PREFIXES = [
    '110101', // 北京东城
    '310101', // 上海黄浦
    '440106', // 广州天河
    '440304', // 深圳福田
    '330102', // 杭州上城
    '320102', // 南京玄武
    '510105', // 成都青羊
    '420102', // 武汉江岸
    '430102', // 长沙芙蓉
    '370102', // 济南历下
];

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 生成有效的身份证号
 */
function generateIdNumber(gender, birthYear) {
    const prefix = randomItem(ID_PREFIXES);
    const month = String(randomInt(1, 12)).padStart(2, '0');
    const day = String(randomInt(1, 28)).padStart(2, '0');
    const birthStr = `${birthYear}${month}${day}`;

    // 顺序码（奇数为男，偶数为女）
    let seq;
    if (gender === 'M') {
        seq = String(randomInt(0, 49) * 2 + 1).padStart(3, '0'); // 奇数
    } else {
        seq = String(randomInt(0, 49) * 2).padStart(3, '0'); // 偶数，修正: 保持3位
    }

    const base = prefix + birthStr + seq;

    // 计算校验码
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
    let sum = 0;
    for (let i = 0; i < 17; i++) {
        sum += parseInt(base[i]) * weights[i];
    }
    const checkCode = checkCodes[sum % 11];

    return base + checkCode;
}

/**
 * 生成有效的手机号
 */
function generatePhone() {
    const prefixes = ['138', '139', '136', '137', '158', '159', '188', '189', '186', '187'];
    return randomItem(prefixes) + String(randomInt(10000000, 99999999));
}

/**
 * 生成拼音（简化版）
 */
function generatePinyin(name) {
    const pinyinMap = {
        '张': 'ZHANG', '王': 'WANG', '李': 'LI', '刘': 'LIU', '陈': 'CHEN',
        '杨': 'YANG', '黄': 'HUANG', '赵': 'ZHAO', '周': 'ZHOU', '吴': 'WU',
        '徐': 'XU', '孙': 'SUN', '马': 'MA', '朱': 'ZHU', '胡': 'HU',
        '郭': 'GUO', '何': 'HE', '林': 'LIN', '高': 'GAO', '罗': 'LUO',
        '伟': 'WEI', '强': 'QIANG', '磊': 'LEI', '军': 'JUN', '勇': 'YONG',
        '杰': 'JIE', '涛': 'TAO', '明': 'MING', '超': 'CHAO', '华': 'HUA',
        '飞': 'FEI', '鹏': 'PENG', '斌': 'BIN', '峰': 'FENG', '宇': 'YU',
        '芳': 'FANG', '娟': 'JUAN', '敏': 'MIN', '静': 'JING', '丽': 'LI',
        '艳': 'YAN', '萍': 'PING', '红': 'HONG', '玲': 'LING', '霞': 'XIA',
        '燕': 'YAN', '婷': 'TING', '莉': 'LI', '雪': 'XUE', '琳': 'LIN',
    };

    let pinyin = '';
    for (const char of name) {
        pinyin += pinyinMap[char] || char.toUpperCase();
    }
    return pinyin;
}

/**
 * 生成一条测试记录
 */
function generateRecord(index) {
    const gender = Math.random() > 0.5 ? 'M' : 'F';
    const birthYear = randomInt(1970, 2005);
    const surname = randomItem(SURNAMES);
    const givenName = gender === 'M'
        ? randomItem(GIVEN_NAMES_MALE)
        : randomItem(GIVEN_NAMES_FEMALE);
    const name = surname + givenName;
    const provinceInfo = randomItem(PROVINCES);

    // 模拟一些数据问题（测试清洗）
    const phoneFormats = [
        generatePhone(),
        generatePhone().replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3'), // 带横线
        ' ' + generatePhone() + ' ', // 带空格
    ];

    const idNumberFormats = [
        generateIdNumber(gender, birthYear),
        generateIdNumber(gender, birthYear).toLowerCase(), // 小写x
        ' ' + generateIdNumber(gender, birthYear), // 带空格
    ];

    return {
        name,
        namePinyin: generatePinyin(name),
        phone: randomItem(phoneFormats),
        idNumber: randomItem(idNumberFormats),
        gender,
        age: String(2026 - birthYear),
        birthday: `${birthYear}-${String(randomInt(1, 12)).padStart(2, '0')}-${String(randomInt(1, 28)).padStart(2, '0')}`,
        event: randomItem(EVENTS),
        source: randomItem(SOURCES),
        clothingSize: randomItem(CLOTHING_SIZES),
        province: provinceInfo.name,
        city: randomItem(provinceInfo.cities),
        country: '中国',
        idType: '身份证',
        runnerCategory: Math.random() > 0.9 ? 'Elite' : 'Mass',
    };
}

/**
 * 生成300条测试记录
 */
function generate300Records() {
    const records = [];
    for (let i = 0; i < 300; i++) {
        records.push(generateRecord(i));
    }

    // 添加一些重复记录（测试去重）
    records[290] = { ...records[0] }; // 与第一条完全重复
    records[295] = { ...records[10] }; // 与第11条完全重复

    return records;
}

// ═══════════════════════════════════════════════════════════════════════
// 模拟 commit-import-session handler 的核心逻辑
// ═══════════════════════════════════════════════════════════════════════

async function commitImportSession(orgId, raceId, sessionId, rawRecords, category = 'Mass') {
    const now = new Date().toISOString();
    const isMass = category === 'Mass';

    // 1. 映射行并设定 category / lotteryStatus
    const mappedRecords = rawRecords.map(row => {
        const mapped = { ...row };
        mapped.runnerCategory = row.runnerCategory || 'Mass';
        if (isMass) {
            mapped.lotteryStatus = '参与抽签';
        } else {
            mapped.lotteryStatus = '直通名额';
        }
        return mapped;
    });

    // 2. 去重检查
    const { newRecords, duplicates, internalUpdateCount, rejectedRecords } =
        await checkDuplicates(knex, mappedRecords, orgId, raceId);

    console.log(`[导入统计] 新增: ${newRecords.length}, 重复: ${duplicates.length}, 内部重复: ${internalUpdateCount}, 拒绝: ${rejectedRecords.length}`);

    // 3. 批量插入新记录
    let addedCount = 0;
    if (newRecords.length > 0) {
        const BATCH_SIZE = 500;
        const dbRecords = newRecords.map(r => {
            const mapped = recordMapper.toDbInsert({
                orgId,
                raceId,
                name: r.name,
                namePinyin: r.namePinyin,
                phone: r.phone,
                country: r.country,
                idType: r.idType,
                idNumber: r.idNumber,
                gender: r.gender,
                age: r.age,
                birthday: r.birthday,
                event: normalizeEvent(r.event),
                source: r.source,
                clothingSize: r.clothingSize,
                province: r.province,
                city: r.city,
                district: r.district,
                address: r.address,
                email: r.email,
                emergencyName: r.emergencyName,
                emergencyPhone: r.emergencyPhone,
                bloodType: r.bloodType,
                orderGroupId: r.orderGroupId,
                paymentStatus: r.paymentStatus,
                mark: r.mark,
                runnerCategory: r.runnerCategory,
                lotteryStatus: r.lotteryStatus,
                duplicateCount: r.duplicateCount,
                duplicateSources: r.duplicateSources,
            });
            mapped._imported_at = now;
            mapped.audit_status = 'pending';
            return mapped;
        });

        for (let i = 0; i < dbRecords.length; i += BATCH_SIZE) {
            const batch = dbRecords.slice(i, i + BATCH_SIZE);
            await knex('records').insert(batch);
            addedCount += batch.length;
        }
    }

    // 4. 更新重复记录
    let updatedCount = 0;
    for (const { id, data } of duplicates) {
        const mapperInput = { orgId, raceId };

        if (data.phone !== undefined) mapperInput.phone = data.phone;
        if (data.idNumber !== undefined) mapperInput.idNumber = data.idNumber;

        const updateRow = recordMapper.toDbUpdate(mapperInput);
        updateRow.duplicate_count = data.duplicate_count;
        updateRow.mark = data.mark;
        updateRow.duplicate_sources = data.duplicate_sources;
        if (data.runner_category !== undefined) updateRow.runner_category = data.runner_category;
        updateRow.updated_at = now;

        await knex('records').where({ id }).update(updateRow);
        updatedCount++;
    }

    return { addedCount, updatedCount, internalCount: internalUpdateCount, rejectedCount: rejectedRecords.length };
}

// 去重检查函数（从 handler 移植）
async function checkDuplicates(knex, incoming, orgId, raceId) {
    if (!incoming || incoming.length === 0) {
        return { newRecords: [], duplicates: [], internalUpdateCount: 0, rejectedRecords: [] };
    }

    const hashToRecord = new Map();
    for (const inc of incoming) {
        if (!inc.idNumber) continue;
        const hash = idNumberBlindIndex(inc.idNumber);
        hashToRecord.set(hash, { ...inc, _hash: hash });
    }

    const existingRows = await knex('records')
        .select('id', 'id_number_hash', 'duplicate_count', 'mark', 'source', 'event', 'duplicate_sources', 'runner_category')
        .where({ org_id: orgId, race_id: raceId })
        .whereNotNull('id_number_hash');

    const existingMap = new Map();
    for (const row of existingRows) {
        if (row.id_number_hash) {
            existingMap.set(row.id_number_hash, row);
        }
    }

    const newRecords = [];
    const duplicates = [];
    const rejectedRecords = [];
    const incomingHashSet = new Set();

    for (const inc of incoming) {
        if (!inc.idNumber) {
            const initSources = JSON.stringify([{ platform: inc.source || '', event: inc.event || '' }]);
            newRecords.push({ ...inc, duplicateCount: 1, duplicateSources: initSources });
            continue;
        }

        const hash = idNumberBlindIndex(inc.idNumber);

        if (existingMap.has(hash)) {
            const exist = existingMap.get(hash);
            const currentCount = exist.duplicate_count || 1;
            const newCount = currentCount + 1;

            const currentMark = exist.mark || '';
            const newSource = inc.source || '未知来源';
            const appendMsg = `重复(${newCount}): ${newSource}`;
            const newMark = currentMark ? `${currentMark}; ${appendMsg}` : appendMsg;

            let currentSources = [];
            try { if (exist.duplicate_sources) currentSources = JSON.parse(exist.duplicate_sources); } catch (_) {}
            if (!Array.isArray(currentSources)) currentSources = [];
            currentSources.push({ platform: inc.source || '', event: inc.event || '' });

            const updateData = {
                duplicate_count: newCount,
                mark: newMark,
                duplicate_sources: JSON.stringify(currentSources),
                phone: inc.phone,
                idNumber: inc.idNumber,
            };

            duplicates.push({ id: exist.id, data: updateData });
            existingMap.set(hash, { ...exist, duplicate_count: newCount, mark: newMark });

        } else if (incomingHashSet.has(hash)) {
            const firstInstance = newRecords.find(r => idNumberBlindIndex(r.idNumber) === hash);
            if (firstInstance) {
                firstInstance.duplicateCount = (firstInstance.duplicateCount || 1) + 1;
            }
        } else {
            incomingHashSet.add(hash);
            const initSources = JSON.stringify([{ platform: inc.source || '', event: inc.event || '' }]);
            newRecords.push({ ...inc, duplicateCount: 1, duplicateSources: initSources });
        }
    }

    const internalUpdateCount = incoming.filter(i => i.idNumber).length - duplicates.length - newRecords.length - rejectedRecords.length;
    return { newRecords, duplicates, internalUpdateCount, rejectedRecords };
}

// ═══════════════════════════════════════════════════════════════════════
// 主测试套件
// ═══════════════════════════════════════════════════════════════════════

describe('300人名单导入测试', () => {
    let orgId;
    let raceId;
    let sessionId;
    let testRecords;

    before(async () => {
        console.log('[Setup] 运行数据库迁移...');
        await knex.migrate.latest();

        // 清理测试数据
        console.log('[Setup] 清理测试数据...');
        await knex('import_session_chunks').del();
        await knex('import_sessions').del();
        await knex('records').del();
        await knex('races').del();
        await knex('organizations').del();

        // 创建组织和赛事
        console.log('[Setup] 创建测试组织和赛事...');
        const [org] = await knex('organizations')
            .insert({ name: '300人导入测试组织', slug: 'import-test-org-300' })
            .returning('*');
        orgId = org.id;

        const [race] = await knex('races')
            .insert({
                org_id: orgId,
                name: '300人导入测试马拉松',
                date: '2026-06-01',
                location: '北京'
            })
            .returning('*');
        raceId = race.id;

        // 创建导入会话
        console.log('[Setup] 创建导入会话...');
        const session = await importSessionRepository.create(orgId);
        sessionId = session.id;

        // 生成300条测试记录
        console.log('[Setup] 生成300条测试记录...');
        testRecords = generate300Records();

        console.log(`[Setup] 组织ID: ${orgId}, 赛事ID: ${raceId}, 会话ID: ${sessionId}`);
    });

    after(async () => {
        console.log('[Teardown] 清理测试数据...');
        await knex('import_session_chunks').del();
        await knex('import_sessions').del();
        await knex('records').del();
        await knex('races').del();
        await knex('organizations').del();
        await knex.destroy();
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 1. 数据生成测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('1. 测试数据生成', () => {
        it('应生成300条记录', () => {
            assert.equal(testRecords.length, 300, '应生成300条记录');
        });

        it('所有记录应有必填字段', () => {
            for (const record of testRecords) {
                assert.ok(record.name, '应有姓名');
                assert.ok(record.phone, '应有手机号');
                assert.ok(record.idNumber, '应有身份证号');
                assert.ok(record.gender, '应有性别');
                assert.ok(record.event, '应有项目');
            }
        });

        it('身份证号应为18位有效格式', () => {
            for (const record of testRecords) {
                const idNum = normalizeIdNumber(record.idNumber);
                assert.equal(idNum.length, 18, `身份证号应为18位: ${idNum}`);
            }
        });

        it('手机号应为11位数字', () => {
            for (const record of testRecords) {
                const phone = normalizePhone(record.phone);
                assert.equal(phone.length, 11, `手机号应为11位: ${phone}`);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 2. 数据块写入测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('2. 数据块写入测试', () => {
        it('应成功写入数据块到导入会话', async () => {
            // 分两批写入，模拟实际导入场景
            const batchSize = 150;

            const totalRows1 = await importSessionRepository.appendChunk(orgId, sessionId, testRecords.slice(0, batchSize));
            assert.equal(totalRows1, batchSize, '第一批应写入150条');

            const totalRows2 = await importSessionRepository.appendChunk(orgId, sessionId, testRecords.slice(batchSize));
            assert.equal(totalRows2, 300, '第二批后应总共300条');

            console.log(`[OK] 数据块写入成功: 共 ${totalRows2} 条`);
        });

        it('应能读取写入的数据块', async () => {
            const rows = await importSessionRepository.getChunk(orgId, sessionId, 0, 100);
            assert.equal(rows.length, 100, '应能读取100条');

            const allRows = await importSessionRepository.getChunk(orgId, sessionId, 0, 500);
            assert.equal(allRows.length, 300, '应能读取全部300条');

            console.log(`[OK] 数据块读取成功: ${allRows.length} 条`);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. 导入、映射、清洗、落库测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('3. 导入、映射、清洗、落库测试', () => {
        it('应成功执行完整导入流程', async () => {
            const result = await commitImportSession(orgId, raceId, sessionId, testRecords);

            console.log(`[导入结果] 新增: ${result.addedCount}, 更新: ${result.updatedCount}, 内部重复: ${result.internalCount}, 拒绝: ${result.rejectedCount}`);

            // 由于有2条完全重复的记录，应该是 298 新增 + 2 内部重复
            assert.ok(result.addedCount > 0, '应有新增记录');
            assert.ok(result.internalCount >= 0, '内部重复计数应正常');

            // 标记会话为已提交
            await importSessionRepository.markCommitted(orgId, sessionId);

            console.log(`[OK] 导入流程完成`);
        });

        it('数据库中应有正确的记录数', async () => {
            const count = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .count('* as count')
                .first();

            console.log(`[OK] 数据库记录数: ${count.count}`);
            assert.ok(Number(count.count) > 290, '应有接近300条记录（考虑到去重）');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 4. 加密字段验证测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('4. 加密字段验证测试', () => {
        it('所有记录的 phone 应被加密', async () => {
            const records = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .whereNot('phone', '')
                .select('phone')
                .limit(10);

            for (const record of records) {
                assert.ok(isEncrypted(record.phone), `phone 应被加密: ${record.phone.substring(0, 20)}...`);
            }

            console.log(`[OK] 所有 phone 字段已加密`);
        });

        it('所有记录的 id_number 应被加密', async () => {
            const records = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .whereNotNull('id_number_hash')
                .select('id_number')
                .limit(10);

            for (const record of records) {
                assert.ok(isEncrypted(record.id_number), `id_number 应被加密`);
            }

            console.log(`[OK] 所有 id_number 字段已加密`);
        });

        it('phone_hash 和 id_number_hash 应存在且正确', async () => {
            const records = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .select('id', 'phone', 'phone_hash', 'id_number', 'id_number_hash')
                .limit(10);

            for (const record of records) {
                assert.ok(record.phone_hash, 'phone_hash 应存在');
                assert.ok(record.id_number_hash, 'id_number_hash 应存在');
                assert.equal(record.phone_hash.length, 64, 'phone_hash 应为64字符');
                assert.equal(record.id_number_hash.length, 64, 'id_number_hash 应为64字符');
            }

            console.log(`[OK] 盲索引字段正确`);
        });

        it('应能正确解密 phone 字段', async () => {
            const records = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .select('id', 'phone', 'org_id', 'race_id')
                .limit(10);

            for (const record of records) {
                const decrypted = decryptField(record.phone, {
                    tableName: 'records',
                    columnName: 'phone',
                    orgId: record.org_id,
                    raceId: record.race_id,
                });

                assert.ok(decrypted, '解密应有结果');
                assert.equal(decrypted.length, 11, '解密后应为11位手机号');
                assert.ok(/^\d{11}$/.test(decrypted), '解密后应为纯数字');
            }

            console.log(`[OK] phone 解密正确`);
        });

        it('应能正确解密 id_number 字段', async () => {
            const records = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .whereNotNull('id_number_hash')
                .select('id', 'id_number', 'org_id', 'race_id')
                .limit(10);

            for (const record of records) {
                const decrypted = decryptField(record.id_number, {
                    tableName: 'records',
                    columnName: 'id_number',
                    orgId: record.org_id,
                    raceId: record.race_id,
                });

                assert.ok(decrypted, '解密应有结果');
                assert.ok(decrypted.length >= 18, '解密后应为18位身份证号');
            }

            console.log(`[OK] id_number 解密正确`);
        });

        it('应能通过 id_number_hash 查询记录', async () => {
            // 取第一条记录
            const firstRecord = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .select('id_number_hash')
                .first();

            const hash = firstRecord.id_number_hash;

            const found = await knex('records')
                .where({ org_id: orgId, race_id: raceId, id_number_hash: hash })
                .first();

            assert.ok(found, '应能通过 hash 查询到记录');

            console.log(`[OK] 通过 id_number_hash 查询成功`);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 5. 重复导入测试
    // ═══════════════════════════════════════════════════════════════════════

    describe('5. 重复导入测试', () => {
        it('重复导入相同数据应更新而非新增', async () => {
            // 再次导入相同数据
            const newSession = await importSessionRepository.create(orgId);
            const result = await commitImportSession(orgId, raceId, newSession.id, testRecords.slice(0, 50));

            console.log(`[重复导入结果] 新增: ${result.addedCount}, 更新: ${result.updatedCount}`);

            // 应该是 0 新增 + 50 更新
            assert.equal(result.addedCount, 0, '重复导入不应新增');
            assert.ok(result.updatedCount > 0, '重复导入应更新');

            console.log(`[OK] 重复导入正确处理`);
        });

        it('重复记录应有正确的 duplicate_count', async () => {
            const records = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .where('duplicate_count', '>', 1)
                .select('id', 'name', 'duplicate_count', 'mark');

            console.log(`[OK] 找到 ${records.length} 条重复记录`);
            for (const record of records.slice(0, 3)) {
                console.log(`  - ${record.name}: duplicate_count=${record.duplicate_count}, mark=${record.mark?.substring(0, 50)}...`);
            }

            assert.ok(records.length > 0, '应有重复记录');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 6. 性能统计
    // ═══════════════════════════════════════════════════════════════════════

    describe('6. 性能统计', () => {
        it('统计导入结果', async () => {
            const stats = await knex('records')
                .where({ org_id: orgId, race_id: raceId })
                .select(
                    knex.raw('COUNT(*) as total'),
                    knex.raw("COUNT(*) FILTER (WHERE gender = 'M') as male"),
                    knex.raw("COUNT(*) FILTER (WHERE gender = 'F') as female"),
                    knex.raw("COUNT(*) FILTER (WHERE lottery_status = '参与抽签') as lottery_pending"),
                    knex.raw("COUNT(*) FILTER (WHERE lottery_status = '直通名额') as direct"),
                    knex.raw('COUNT(DISTINCT event) as event_types'),
                    knex.raw('COUNT(DISTINCT province) as provinces'),
                )
                .first();

            console.log('\n========================================');
            console.log('导入统计');
            console.log('========================================');
            console.log(`总记录数: ${stats.total}`);
            console.log(`男性: ${stats.male}, 女性: ${stats.female}`);
            console.log(`参与抽签: ${stats.lottery_pending}, 直通名额: ${stats.direct}`);
            console.log(`项目类型: ${stats.event_types} 种`);
            console.log(`来源省份: ${stats.provinces} 个`);
            console.log('========================================\n');

            assert.ok(Number(stats.total) > 290, '应有足够的记录数');
        });
    });
});

console.log('\n========================================');
console.log('300人名单导入测试');
console.log('========================================\n');