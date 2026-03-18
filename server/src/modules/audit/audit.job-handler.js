/**
 * Audit Job Handlers — 5 个审核步骤
 *
 * 由 worker.js 通过 side-effect import 注册
 * payload: { raceId, runId, stepNumber, stepName, raceDate? }
 *
 * ⚠️ 关键业务逻辑（源自 sqliteService.cjs:4095~4650）：
 * - Step1 underage: 双数据源回退 (idNumber→birthday)，精确年龄计算
 * - Step2 blacklist: strict/permissive conflictRule, GLOB→LIKE 转换
 * - Step3 fake_elite: auditStatus='review' (不是 reject!)
 * - Step4 direct_lock: 4 步降级链库存扣减
 * - Step5 mass_pool: affected = 全部 pass+未锁定 数量
 *
 * 🔐 加密支持：
 * - id_number 字段已加密，使用 id_number_hash 进行精确匹配
 * - 需要解密 id_number 进行年龄提取和模糊匹配
 */
import { registerHandler } from '../jobs/job.handlers.js';
import * as auditRepo from './audit.repository.js';
import * as clothingRepo from '../clothing/clothing.repository.js';
import {
    decryptField,
    idNumberBlindIndex,
    normalizeIdNumber,
} from '../../utils/crypto.js';

const BATCH_SIZE = 1000;

// ═══════════════════════════════════════════════════════════════════════
//  Step 1: 年龄检查 (underage)
// ═══════════════════════════════════════════════════════════════════════

registerHandler('audit:underage', async (job, { knex, heartbeat }) => {
    const { raceId, runId, raceDate } = job.payload;
    const orgId = job.orgId;

    await heartbeat(5, '读取待审核选手');

    // 获取所有 pending 记录的 id, id_number (加密), birthday
    // birthday 不加密，id_number 需要解密后才能提取出生日期
    const records = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
        .select('id', 'id_number', 'birthday');

    const raceDateObj = raceDate ? new Date(raceDate) : new Date();
    const underageIds = [];

    await heartbeat(15, `正在检查 ${records.length} 名选手的年龄`);

    for (const r of records) {
        let age = null;

        // 数据源 1: 从 id_number (18 位中国身份证 [6:14]) 提取出生日期
        // 🔐 需要先解密 id_number
        if (r.id_number) {
            const decryptedIdNumber = decryptField(r.id_number, {
                tableName: 'records',
                columnName: 'id_number',
            });

            if (decryptedIdNumber && decryptedIdNumber.length === 18) {
                const birthStr = decryptedIdNumber.substring(6, 14);
                const year = parseInt(birthStr.substring(0, 4));
                const month = parseInt(birthStr.substring(4, 6)) - 1;
                const day = parseInt(birthStr.substring(6, 8));
                const birthDate = new Date(year, month, day);

                if (!isNaN(birthDate.getTime())) {
                    age = raceDateObj.getFullYear() - birthDate.getFullYear();
                    const m = raceDateObj.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && raceDateObj.getDate() < birthDate.getDate())) {
                        age--;
                    }
                }
            }
        }

        // 数据源 2: 回退到 birthday 字段 (未加密)
        if (age === null && r.birthday) {
            const bd = new Date(r.birthday);
            if (!isNaN(bd.getTime())) {
                age = raceDateObj.getFullYear() - bd.getFullYear();
                const m = raceDateObj.getMonth() - bd.getMonth();
                if (m < 0 || (m === 0 && raceDateObj.getDate() < bd.getDate())) {
                    age--;
                }
            }
        }

        if (age !== null && age < 18) {
            underageIds.push(r.id);
        }
    }

    await heartbeat(60, `发现 ${underageIds.length} 名未成年选手，正在更新状态`);

    // 批量更新为 reject
    if (underageIds.length > 0) {
        for (let i = 0; i < underageIds.length; i += BATCH_SIZE) {
            const chunk = underageIds.slice(i, i + BATCH_SIZE);
            await knex('records')
                .whereIn('id', chunk)
                .andWhere({ org_id: orgId })
                .update({
                    audit_status: 'reject',
                    reject_reason: 'underage',
                    lottery_status: '未成年剔除',
                });
        }
    }

    // 统计剩余 pending
    const { cnt } = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
        .count('* as cnt')
        .first();

    const result = { affected: underageIds.length, remaining: Number(cnt) };
    await auditRepo.completeRun(runId, result.affected, result.remaining);

    console.log(`[audit:underage] ✅ 未成年剔除: ${result.affected}, 剩余: ${result.remaining}`);
    return result;
});

// ═══════════════════════════════════════════════════════════════════════
//  Step 2: 黑名单碰撞 (blacklist)
// ═══════════════════════════════════════════════════════════════════════

registerHandler('audit:blacklist', async (job, { knex, heartbeat }) => {
    const { raceId, runId } = job.payload;
    const orgId = job.orgId;

    await heartbeat(5, '读取赛事冲突规则和黑名单');

    // 读取 conflict_rule
    const race = await knex('races')
        .where({ id: raceId, org_id: orgId })
        .select('conflict_rule')
        .first();
    const isPermissive = race?.conflict_rule === 'permissive';

    // 读取黑名单（id_number 已加密，同时读取 id_number_hash）
    const blacklist = await knex('lottery_lists')
        .where({ org_id: orgId, race_id: raceId, list_type: 'blacklist' })
        .select('id_number', 'id_number_hash');

    // 解密黑名单条目，同时保留 hash 用于精确匹配
    const decryptedBlacklist = blacklist.map(b => ({
        idNumber: decryptField(b.id_number, {
            tableName: 'lottery_lists',
            columnName: 'id_number',
        }) || '',
        idNumberHash: b.id_number_hash,
    }));

    // permissive 模式下读取白名单（使用 hash）
    let whitelistHashSet = new Set();
    if (isPermissive) {
        const whitelist = await knex('lottery_lists')
            .where({ org_id: orgId, race_id: raceId, list_type: 'whitelist' })
            .select('id_number_hash');
        whitelistHashSet = new Set(whitelist.map(w => w.id_number_hash).filter(Boolean));
    }

    // 分离精确匹配和模糊匹配（基于解密后的值）
    const exactHashes = [];
    const fuzzyPatterns = [];
    for (const b of decryptedBlacklist) {
        const idNum = (b.idNumber || '').trim();
        if (!idNum) continue;
        if (idNum.includes('*') || idNum.includes('?')) {
            fuzzyPatterns.push(idNum);
        } else if (b.idNumberHash) {
            exactHashes.push(b.idNumberHash);
        }
    }

    let totalAffected = 0;

    await heartbeat(20, `精确匹配 ${exactHashes.length} 条黑名单`);

    // ── 阶段 A: 精确匹配（使用 id_number_hash）──
    if (exactHashes.length > 0) {
        for (let i = 0; i < exactHashes.length; i += BATCH_SIZE) {
            const chunk = exactHashes.slice(i, i + BATCH_SIZE);

            let query = knex('records')
                .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
                .whereIn('id_number_hash', chunk);

            // permissive 模式：排除白名单保护的选手（使用 hash）
            if (isPermissive && whitelistHashSet.size > 0) {
                query = query.whereNotIn('id_number_hash', [...whitelistHashSet]);
            }

            const affected = await query.update({
                audit_status: 'reject',
                reject_reason: 'blacklist',
                lottery_status: '不予通过',
            });
            totalAffected += affected;
        }
    }

    await heartbeat(50, `模糊匹配 ${fuzzyPatterns.length} 条黑名单模式`);

    // ── 阶段 B: 模糊匹配 ──
    // 由于 id_number 已加密，无法在 SQL 中使用 LIKE
    // 方案：批量读取并解密 pending 记录的 id_number，在内存中匹配
    if (fuzzyPatterns.length > 0) {
        // 将 GLOB 模式转换为正则表达式
        const regexPatterns = fuzzyPatterns.map(globPattern => {
            // 转换: * → .*, ? → ., 转义正则特殊字符
            const escaped = globPattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            return new RegExp(`^${escaped}$`, 'i');
        });

        // 批量处理 pending 记录
        let offset = 0;
        const BATCH_READ_SIZE = 5000;

        while (true) {
            const records = await knex('records')
                .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
                .select('id', 'id_number', 'id_number_hash')
                .limit(BATCH_READ_SIZE)
                .offset(offset);

            if (records.length === 0) break;

            const idsToReject = [];

            for (const r of records) {
                // 解密 id_number
                const decryptedIdNumber = r.id_number ? decryptField(r.id_number, {
                    tableName: 'records',
                    columnName: 'id_number',
                }) : '';

                if (!decryptedIdNumber) continue;

                // 检查是否匹配任何模糊模式
                const matchesPattern = regexPatterns.some(regex => regex.test(decryptedIdNumber));

                if (matchesPattern) {
                    // permissive 模式：检查是否在白名单中
                    if (isPermissive && whitelistHashSet.has(r.id_number_hash)) {
                        continue;
                    }
                    idsToReject.push(r.id);
                }
            }

            // 批量更新匹配的记录
            if (idsToReject.length > 0) {
                for (let i = 0; i < idsToReject.length; i += BATCH_SIZE) {
                    const chunk = idsToReject.slice(i, i + BATCH_SIZE);
                    await knex('records')
                        .whereIn('id', chunk)
                        .andWhere({ org_id: orgId })
                        .update({
                            audit_status: 'reject',
                            reject_reason: 'blacklist_fuzzy',
                            lottery_status: '模糊剔除',
                        });
                }
                totalAffected += idsToReject.length;
            }

            offset += BATCH_READ_SIZE;

            // 进度更新
            const progress = 50 + Math.min(Math.round((offset / 100000) * 30), 30);
            await heartbeat(progress, `模糊匹配已处理 ${offset} 条记录`);
        }
    }

    // 统计剩余
    const { cnt } = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
        .count('* as cnt')
        .first();

    const result = { affected: totalAffected, remaining: Number(cnt) };
    await auditRepo.completeRun(runId, result.affected, result.remaining);

    console.log(`[audit:blacklist] ✅ mode=${race?.conflict_rule}, 碰撞: ${result.affected}, 剩余: ${result.remaining}`);
    return result;
});

// ═══════════════════════════════════════════════════════════════════════
//  Step 3: 精英伪造检查 (fake_elite)
// ═══════════════════════════════════════════════════════════════════════

registerHandler('audit:fake_elite', async (job, { knex, heartbeat }) => {
    const { raceId, runId } = job.payload;
    const orgId = job.orgId;

    await heartbeat(10, '读取白名单和精英选手');

    // 获取精英白名单（使用 id_number_hash）
    const whitelist = await knex('lottery_lists')
        .where({ org_id: orgId, race_id: raceId, list_type: 'whitelist' })
        .select('id_number_hash');
    const whitelistHashSet = new Set(
        whitelist.map(w => w.id_number_hash).filter(Boolean)
    );

    // 获取 runner_category='Elite' 且 audit_status='pending' 的选手
    // 同时读取 id_number_hash 用于匹配
    const elites = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pending', runner_category: 'Elite' })
        .select('id', 'id_number_hash');

    await heartbeat(30, `检查 ${elites.length} 名精英选手的资质`);

    // 筛选不在白名单中的（使用 hash 匹配）
    const fakeIds = elites
        .filter(e => !e.id_number_hash || !whitelistHashSet.has(e.id_number_hash))
        .map(e => e.id);

    await heartbeat(60, `发现 ${fakeIds.length} 名资质存疑，正在标记`);

    // ⚠️ 重要：设置 auditStatus='review'，不是 'reject'！
    if (fakeIds.length > 0) {
        for (let i = 0; i < fakeIds.length; i += BATCH_SIZE) {
            const chunk = fakeIds.slice(i, i + BATCH_SIZE);
            await knex('records')
                .whereIn('id', chunk)
                .andWhere({ org_id: orgId })
                .update({
                    audit_status: 'review',
                    reject_reason: 'fake_elite',
                    lottery_status: '精英资质存疑',
                });
        }
    }

    const { cnt } = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
        .count('* as cnt')
        .first();

    const result = { affected: fakeIds.length, remaining: Number(cnt) };
    await auditRepo.completeRun(runId, result.affected, result.remaining);

    console.log(`[audit:fake_elite] ✅ 资质存疑: ${result.affected}, 剩余: ${result.remaining}`);
    return result;
});

// ═══════════════════════════════════════════════════════════════════════
//  Step 4: 直通锁定 (direct_lock)
// ═══════════════════════════════════════════════════════════════════════

registerHandler('audit:direct_lock', async (job, { knex, heartbeat }) => {
    const { raceId, runId } = job.payload;
    const orgId = job.orgId;

    await heartbeat(5, '查找直通类别选手');

    // 直通类别: Elite(已通过精英检查的), Permanent, Pacer, Medic, Sponsor
    const directRunners = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
        .whereIn('runner_category', ['Elite', 'Permanent', 'Pacer', 'Medic', 'Sponsor'])
        .select('id', 'event', 'gender', 'clothing_size');

    const raceRow = await knex('races')
        .where({ id: raceId, org_id: orgId })
        .select('lottery_mode_default')
        .first();
    const raceDefaultMode = raceRow?.lottery_mode_default || 'lottery';
    const capacities = await knex('race_capacity')
        .where({ org_id: orgId, race_id: raceId })
        .select('event', 'lottery_mode_override');
    const effectiveModeByEvent = new Map(
        capacities.map(cap => [
            cap.event || '',
            (cap.lottery_mode_override === 'direct' || cap.lottery_mode_override === 'lottery')
                ? cap.lottery_mode_override
                : raceDefaultMode,
        ]),
    );
    const isDirectEvent = (event) => (effectiveModeByEvent.get(event || '') || raceDefaultMode) === 'direct';

    await heartbeat(20, `发现 ${directRunners.length} 名直通选手，正在锁定`);

    // 批量更新状态
    const directIds = directRunners.map(r => r.id);
    if (directIds.length > 0) {
        for (let i = 0; i < directIds.length; i += BATCH_SIZE) {
            const chunk = directIds.slice(i, i + BATCH_SIZE);
            await knex('records')
                .whereIn('id', chunk)
                .andWhere({ org_id: orgId })
                .update({
                    is_locked: 1,
                    audit_status: 'pass',
                    lottery_status: '直通名额',
                });
        }
    }

    await heartbeat(50, '正在进行服装库存批量扣减');

    // ── 库存扣减：先聚合，再批量 UPDATE（PG 优化）──
    // 按 (event, gender, clothingSize) 聚合直通人数
    const aggregated = {};
    const overstockWarnings = [];

    for (const runner of directRunners) {
        if (isDirectEvent(runner.event)) continue;
        const eventKey = runner.event || 'ALL';
        const genderKey = runner.gender || 'U';
        const sizeKey = runner.clothing_size || '';
        if (!sizeKey) continue; // 无衣服尺码则跳过

        const result = await clothingRepo.reserveClothingForRunner(
            orgId, raceId, eventKey, genderKey, sizeKey);

        if (result.overstock) {
            overstockWarnings.push({
                matchedKey: result.matchedKey,
                message: `⚠️ 超扣警告: ${result.matchedKey} used_count 已超过 total_inventory`,
            });
        }
    }

    if (overstockWarnings.length > 0) {
        console.warn(`[audit:direct_lock] 超扣警告 (${overstockWarnings.length} 条):`,
            overstockWarnings.slice(0, 5));
    }

    // 统计剩余
    const { cnt } = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
        .count('* as cnt')
        .first();

    const result = {
        affected: directRunners.length,
        remaining: Number(cnt),
        overstockWarnings: overstockWarnings.length,
    };
    await auditRepo.completeRun(runId, result.affected, result.remaining);

    console.log(`[audit:direct_lock] ✅ 直通锁定: ${result.affected}, 超扣: ${overstockWarnings.length}, 剩余: ${result.remaining}`);
    return result;
});

// ═══════════════════════════════════════════════════════════════════════
//  Step 5: 大众池标记 (mass_pool)
// ═══════════════════════════════════════════════════════════════════════

registerHandler('audit:mass_pool', async (job, { knex, heartbeat }) => {
    const { raceId, runId } = job.payload;
    const orgId = job.orgId;

    await heartbeat(10, '标记大众池选手');

    // 将 pending 的 Mass 选手标为 pass
    // lotteryStatus: 空/NULL → '参与抽签', 已有值保留
    const affected = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
        .update({
            audit_status: 'pass',
            lottery_status: knex.raw(`
                CASE 
                    WHEN lottery_status IS NULL OR lottery_status = '' THEN '参与抽签'
                    ELSE lottery_status 
                END
            `),
        });

    await heartbeat(70, '统计最终结果');

    // ⚠️ affected 返回的是全部 pass 且未锁定的数量（含先前步骤已 pass 的）
    const { cnt: passUnlocked } = await knex('records')
        .where({ org_id: orgId, race_id: raceId, audit_status: 'pass', is_locked: 0 })
        .count('* as cnt')
        .first();

    const result = { affected: Number(passUnlocked), remaining: 0 };
    await auditRepo.completeRun(runId, result.affected, result.remaining);

    console.log(`[audit:mass_pool] ✅ 大众池: ${result.affected} 人参与抽签`);
    return result;
});
