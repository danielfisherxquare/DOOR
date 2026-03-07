/**
 * commit-import-session Job Handler
 *
 * 从 import_session_chunks 读取所有行 → 去重(checkDuplicates)
 * → 批量 INSERT 新记录 + UPDATE 重复记录 → 标记会话 committed
 *
 * payload: { sessionId, raceId, category }
 */
import { registerHandler } from '../jobs/job.handlers.js';
import { importSessionRepository } from '../import-sessions/import-session.repository.js';
import { normalizeEvent } from '../../utils/event-normalizer.js';

// ── 辅助函数 ─────────────────────────────────────────────

function normalizeCategory(rawCategory) {
    if (rawCategory === null || rawCategory === undefined || rawCategory === '') return 'Mass';
    const value = String(rawCategory).trim();
    if (value === 'Emergency') return 'Medic';
    if (['Mass', 'Elite', 'Permanent', 'Pacer', 'Medic', 'Sponsor'].includes(value)) return value;
    return null;
}

function isSpecialCategory(category) {
    return ['Elite', 'Permanent', 'Pacer', 'Medic', 'Sponsor'].includes(category);
}

function canInsertWhenNotFound(incomingCategory) {
    return ['Mass', 'Elite', 'Sponsor'].includes(incomingCategory);
}

function resolveCategoryMerge(existingCategoryRaw, incomingCategoryRaw) {
    const existingCategory = normalizeCategory(existingCategoryRaw);
    const incomingCategory = normalizeCategory(incomingCategoryRaw);

    if (!existingCategory || !incomingCategory) {
        return { allowCategoryUpdate: false, nextCategory: existingCategory || 'Mass', actionReason: 'invalid_category' };
    }
    if (existingCategory === incomingCategory) {
        return { allowCategoryUpdate: false, nextCategory: existingCategory, actionReason: 'same_category' };
    }
    if (incomingCategory === 'Mass' && isSpecialCategory(existingCategory)) {
        return { allowCategoryUpdate: false, nextCategory: existingCategory, actionReason: 'mass_cannot_override_special' };
    }
    if (existingCategory === 'Mass' && isSpecialCategory(incomingCategory)) {
        return { allowCategoryUpdate: true, nextCategory: incomingCategory, actionReason: 'upgrade_mass_to_special' };
    }
    return { allowCategoryUpdate: false, nextCategory: existingCategory, actionReason: 'category_conflict' };
}

/**
 * 将清洗后的 camelCase 行映射为 records 表的 snake_case 列
 */
function mapRowToDbRecord(row, orgId, raceId, now) {
    return {
        org_id: orgId,
        race_id: raceId,
        name: row.name || '',
        name_pinyin: row.namePinyin || '',
        phone: row.phone || '',
        country: row.country || '',
        id_type: row.idType || '',
        id_number: row.idNumber || '',
        gender: row.gender || '',
        age: row.age || '',
        birthday: row.birthday || '',
        event: normalizeEvent(row.event),
        source: row.source || '',
        clothing_size: row.clothingSize || '',
        province: row.province || '',
        city: row.city || '',
        district: row.district || '',
        address: row.address || '',
        email: row.email || '',
        emergency_name: row.emergencyName || '',
        emergency_phone: row.emergencyPhone || '',
        blood_type: row.bloodType || '',
        order_group_id: row.orderGroupId || '',
        payment_status: row.paymentStatus || '',
        mark: row.mark || '',
        bag_window_no: row.bagWindowNo || '',
        bag_no: row.bagNo || '',
        expo_window_no: row.expoWindowNo || '',
        bib_number: row.bibNumber || '',
        bib_color: row.bibColor || '',
        _source: row._source || '',
        _imported_at: now,
        duplicate_sources: row.duplicateSources || '',
        runner_category: row.runnerCategory || null,
        lottery_status: row.lotteryStatus || null,
        duplicate_count: row.duplicateCount || 0,
    };
}

/**
 * 去重检查（从 sqliteService.cjs 移植）
 * 按 id_number 对比 DB 已有记录
 */
async function checkDuplicates(knex, incoming, orgId, raceId) {
    if (!incoming || incoming.length === 0) {
        return { newRecords: [], duplicates: [], internalUpdateCount: 0, rejectedRecords: [] };
    }

    // 1. 获取该赛事下所有有证件号的已有记录
    const existingRows = await knex('records')
        .select('id', 'id_number', 'duplicate_count', 'mark', 'source', 'event', 'duplicate_sources', 'runner_category')
        .where({ org_id: orgId, race_id: raceId })
        .whereNotNull('id_number')
        .where('id_number', '!=', '');

    const existingMap = new Map();
    for (const row of existingRows) {
        existingMap.set(row.id_number.trim(), row);
    }

    const newRecords = [];
    const duplicates = [];
    const rejectedRecords = [];
    const incomingIdSet = new Set();

    for (const inc of incoming) {
        if (!inc.idNumber) {
            // 无证件号也需要初始化 duplicateCount 和 duplicateSources
            const initSources = JSON.stringify([{ platform: inc.source || '', event: inc.event || '' }]);
            newRecords.push({ ...inc, duplicateCount: 1, duplicateSources: initSources });
            continue;
        }

        const key = inc.idNumber.trim();

        if (existingMap.has(key)) {
            // ── DB 重复 ──
            const exist = existingMap.get(key);
            const currentCount = exist.duplicate_count || 1;
            const newCount = currentCount + 1;

            const currentMark = exist.mark || '';
            const newSource = inc.source || '未知来源';
            const appendMsg = `重复(${newCount}): ${newSource}`;
            const newMark = currentMark ? `${currentMark}; ${appendMsg}` : appendMsg;

            let currentSources = [];
            try { if (exist.duplicate_sources) currentSources = JSON.parse(exist.duplicate_sources); } catch (_) { /* ignore */ }
            if (!Array.isArray(currentSources)) currentSources = [];
            if (currentSources.length === 0 && (exist.source || exist.event)) {
                currentSources.push({ platform: exist.source || '', event: exist.event || '' });
            }
            currentSources.push({ platform: inc.source || '', event: inc.event || '' });
            const newDuplicateSources = JSON.stringify(currentSources);

            const updateData = {
                duplicate_count: newCount,
                mark: newMark,
                duplicate_sources: newDuplicateSources,
            };

            // 合并非空字段
            const fieldMap = {
                name: 'name', namePinyin: 'name_pinyin', phone: 'phone', country: 'country',
                idType: 'id_type', gender: 'gender', age: 'age', birthday: 'birthday',
                event: 'event', source: 'source', clothingSize: 'clothing_size',
                province: 'province', city: 'city', district: 'district', address: 'address',
                email: 'email', emergencyName: 'emergency_name', emergencyPhone: 'emergency_phone',
                bloodType: 'blood_type', orderGroupId: 'order_group_id', paymentStatus: 'payment_status',
                bagWindowNo: 'bag_window_no', bagNo: 'bag_no', expoWindowNo: 'expo_window_no',
                bibNumber: 'bib_number', bibColor: 'bib_color', _source: '_source',
                lotteryStatus: 'lottery_status',
            };
            for (const [camel, snake] of Object.entries(fieldMap)) {
                if (inc[camel] !== '' && inc[camel] !== null && inc[camel] !== undefined) {
                    updateData[snake] = inc[camel];
                }
            }

            // Category merge
            const mergeDecision = resolveCategoryMerge(exist.runner_category, inc.runnerCategory);
            if (mergeDecision.allowCategoryUpdate) {
                updateData.runner_category = mergeDecision.nextCategory;
            } else if (mergeDecision.actionReason === 'invalid_category' || mergeDecision.actionReason === 'category_conflict') {
                rejectedRecords.push({
                    idNumber: inc.idNumber || '',
                    name: inc.name || '',
                    incomingCategory: String(inc.runnerCategory || ''),
                    reason: mergeDecision.actionReason,
                });
            }

            duplicates.push({ id: exist.id, data: updateData });

            // 更新内存 map 以处理同批次多条匹配
            existingMap.set(key, {
                ...exist,
                duplicate_count: newCount,
                mark: newMark,
                duplicate_sources: newDuplicateSources,
                runner_category: updateData.runner_category || exist.runner_category,
            });

        } else if (incomingIdSet.has(key)) {
            // ── 批次内部重复 ──
            const firstInstance = newRecords.find(r => r.idNumber === key);
            if (firstInstance) {
                firstInstance.duplicateCount = (firstInstance.duplicateCount || 1) + 1;
                const src = inc.source || '未知来源';
                firstInstance.mark = firstInstance.mark
                    ? `${firstInstance.mark}; 内部重复: ${src}`
                    : `内部重复: ${src}`;
                let sources = [];
                try { if (firstInstance.duplicateSources) sources = JSON.parse(firstInstance.duplicateSources); } catch (_) { /* ignore */ }
                if (!Array.isArray(sources)) sources = [];
                sources.push({ platform: inc.source || '', event: inc.event || '' });
                firstInstance.duplicateSources = JSON.stringify(sources);
            }

        } else {
            // ── 全新记录 ──
            const normalizedCat = normalizeCategory(inc.runnerCategory);
            if (!normalizedCat) {
                rejectedRecords.push({
                    idNumber: inc.idNumber || '',
                    name: inc.name || '',
                    incomingCategory: String(inc.runnerCategory || ''),
                    reason: 'invalid_category',
                });
                continue;
            }
            if (!canInsertWhenNotFound(normalizedCat)) {
                rejectedRecords.push({
                    idNumber: inc.idNumber || '',
                    name: inc.name || '',
                    incomingCategory: normalizedCat,
                    reason: 'requires_mass_registration',
                });
                continue;
            }

            incomingIdSet.add(key);
            const initSources = JSON.stringify([{ platform: inc.source || '', event: inc.event || '' }]);
            newRecords.push({ ...inc, runnerCategory: normalizedCat, duplicateCount: 1, duplicateSources: initSources });
        }
    }

    const validIncoming = incoming.filter(i => i.idNumber);
    const internalUpdateCount = validIncoming.length - duplicates.length - newRecords.length - rejectedRecords.length;

    return { newRecords, duplicates, internalUpdateCount, rejectedRecords };
}

// ── 注册 Handler ─────────────────────────────────────────

registerHandler('commit-import-session', async (job, { knex, heartbeat }) => {
    const { sessionId, raceId: rawRaceId, category = 'Mass' } = job.payload;
    const raceId = Number(rawRaceId);
    const orgId = job.orgId;

    if (!raceId || !Number.isFinite(raceId)) {
        throw new Error('Invalid raceId in payload');
    }

    await heartbeat(5, '读取导入会话数据');

    // 1. 从 chunks 读取全部行
    const chunks = await knex('import_session_chunks')
        .where({ session_id: sessionId })
        .orderBy('seq', 'asc');

    const allRows = [];
    for (const c of chunks) {
        let data = c.rows_data;
        if (typeof data === 'string') data = JSON.parse(data);
        if (Array.isArray(data)) allRows.push(...data);
    }

    if (allRows.length === 0) {
        await importSessionRepository.markCommitted(orgId, sessionId);
        return { addedCount: 0, updatedCount: 0, internalCount: 0, rejectedCount: 0 };
    }

    await heartbeat(15, `共 ${allRows.length} 行，正在映射并设定分类`);

    // 2. 映射行并设定 category / lotteryStatus
    const now = new Date().toISOString();
    const isMass = category === 'Mass';
    const isPerformance = category === 'Performance';
    const rawRecords = allRows.map(row => {
        const mapped = { ...row };
        mapped.runnerCategory = isPerformance ? 'Mass' : category;
        if (isMass) {
            mapped.lotteryStatus = '参与抽签';
        } else if (!isPerformance) {
            mapped.lotteryStatus = '直通名额';
        }
        return mapped;
    });

    await heartbeat(25, '去重检查');

    // 3. 去重
    const { newRecords, duplicates, internalUpdateCount, rejectedRecords } = await checkDuplicates(knex, rawRecords, orgId, raceId);

    // 非 Mass/Performance 的新增记录追加首次报名标记
    if (!isMass && !isPerformance) {
        for (const record of newRecords) {
            record.mark = record.mark ? `${record.mark}; 首次报名` : '首次报名';
        }
    }

    await heartbeat(40, `新增 ${newRecords.length}, 更新 ${duplicates.length}, 拒绝 ${rejectedRecords.length}`);

    // 4. 批量插入新记录（分 500 条一批避免 PG 参数上限）
    let addedCount = 0;
    if (newRecords.length > 0) {
        const BATCH_SIZE = 500;
        const dbRecords = newRecords.map(r => mapRowToDbRecord(r, orgId, raceId, now));

        for (let i = 0; i < dbRecords.length; i += BATCH_SIZE) {
            const batch = dbRecords.slice(i, i + BATCH_SIZE);
            await knex('records').insert(batch);
            addedCount += batch.length;

            const progress = 40 + Math.round((i / dbRecords.length) * 30);
            await heartbeat(progress, `已插入 ${addedCount}/${newRecords.length}`);
        }
    }

    await heartbeat(75, `更新 ${duplicates.length} 条重复记录`);

    // 5. 逐条更新重复记录
    let updatedCount = 0;
    if (duplicates.length > 0) {
        for (let i = 0; i < duplicates.length; i++) {
            const { id, data } = duplicates[i];
            data.updated_at = now;
            await knex('records').where({ id }).update(data);
            updatedCount++;

            if (i % 100 === 0) {
                const progress = 75 + Math.round((i / duplicates.length) * 20);
                await heartbeat(progress, `已更新 ${updatedCount}/${duplicates.length}`);
            }
        }
    }

    await heartbeat(97, '标记会话为 committed');

    // 6. 标记 session
    await importSessionRepository.markCommitted(orgId, sessionId);

    const result = {
        addedCount,
        updatedCount,
        internalCount: Number(internalUpdateCount || 0),
        rejectedCount: rejectedRecords.length,
    };

    console.log(`[commit-import-session] ✅ 完成: 新增=${addedCount}, 更新=${updatedCount}, 内部重复=${result.internalCount}, 拒绝=${result.rejectedCount}`);

    return result;
});
