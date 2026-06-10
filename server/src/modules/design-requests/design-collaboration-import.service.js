import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import knex from '../../db/knex.js';
import { EVENT_TYPES } from './design-request.defaults.js';

const REQUIRED_HEADERS = ['使用区域', '项目', '设计'];
const EXPORT_MODES = new Set(['blank_template', 'incremental', 'full_marked']);
const BASE_HEADERS = [
    '序号',
    '使用区域',
    '供方',
    '类别',
    '项目',
    '材质',
    '制作工艺',
    '搭建尺寸',
    '数量',
    '单位',
    '单价',
    '总价',
    '搭建备注',
    '设计',
    '需求部门',
    '需求人',
    '交付时间',
    '优先级',
    '材质',
    '设计尺寸',
    '设计备注',
    '设计参考图',
    '设计参考说明',
];
const EXPORT_HELPER_HEADERS = ['变更标记', '导出轮次', '提报时间', '最近修改时间', '系统行键'];
const CHANGE_LABELS = {
    new: '新增',
    changed: '修改',
    unchanged: '未变化',
    new_category: '新类目',
};

function httpError(status, message) {
    return Object.assign(new Error(message), { status, expose: true });
}

function normalizeString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && value === 0) return '';
    return String(value).trim();
}

function normalizeNullableString(value) {
    const text = normalizeString(value);
    return text || null;
}

function normalizeKeyPart(value) {
    return normalizeString(value).replace(/\s+/g, ' ').toLowerCase();
}

function normalizeEventType(value) {
    const eventType = normalizeString(value) || 'general';
    return EVENT_TYPES.includes(eventType) ? eventType : 'general';
}

function normalizePriority(value) {
    const priority = normalizeString(value);
    const mapped = {
        高: 'high',
        紧急: 'urgent',
        急: 'urgent',
        低: 'low',
        普通: 'normal',
        一般: 'normal',
        high: 'high',
        urgent: 'urgent',
        low: 'low',
        normal: 'normal',
    }[priority];
    return mapped || 'normal';
}

function parseJson(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }
    return value;
}

function valueFromCell(cell) {
    const value = cell?.value;
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    if (typeof value !== 'object') return value;
    if (Object.prototype.hasOwnProperty.call(value, 'formula')) {
        return cell.result ?? value.result ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result ?? null;
    if (value.text) return value.text;
    if (value.richText) return value.richText.map((part) => part.text || '').join('');
    if (value.hyperlink) return value.text || value.hyperlink;
    return String(value);
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function dateOrNull(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number') {
        const excelEpochOffset = 25569;
        const millisecondsPerDay = 24 * 60 * 60 * 1000;
        const date = new Date((value - excelEpochOffset) * millisecondsPerDay);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function needsDesign(value) {
    const text = normalizeString(value).toLowerCase();
    return ['✅', '✓', '✔', '是', 'y', 'yes', 'true', '1'].includes(text);
}

function computeSyncState(row) {
    if (!row.needsDesign) {
        return { syncStatus: 'ignored', syncIssues: [] };
    }

    const issues = [];
    if (!normalizeString(row.requesterDepartment)) issues.push('需求部门为空');
    if (!normalizeString(row.requesterName)) issues.push('需求人为空');
    if (!dateOrNull(row.dueAt)) issues.push(row.dueAt ? '交付时间格式不正确' : '交付时间为空');
    return {
        syncStatus: issues.length > 0 ? 'needs_info' : 'ready',
        syncIssues: issues,
    };
}

function hashJson(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildStableKey(row) {
    return hashJson([
        row.area,
        row.category,
        row.itemName,
        row.supplier,
        row.buildSize,
        row.quantity,
        row.unit,
    ].map(normalizeKeyPart));
}

function buildContentHash(row) {
    return hashJson({
        area: row.area || '',
        supplier: row.supplier || '',
        category: row.category || '',
        itemName: row.itemName || '',
        buildMaterial: row.buildMaterial || '',
        craft: row.craft || '',
        buildSize: row.buildSize || '',
        quantity: row.quantity ?? null,
        unit: row.unit || '',
        unitPrice: row.unitPrice ?? null,
        totalPrice: row.totalPrice ?? null,
        buildNote: row.buildNote || '',
        needsDesign: Boolean(row.needsDesign),
        requesterDepartment: row.requesterDepartment || '',
        requesterName: row.requesterName || '',
        dueAt: row.dueAt || null,
        priority: row.priority || 'normal',
        designMaterial: row.designMaterial || '',
        designSize: row.designSize || '',
        designNote: row.designNote || '',
        referenceImage: row.referenceImage || '',
        referenceNote: row.referenceNote || '',
    });
}

function categoryKey(row) {
    return [row.area, row.category].map(normalizeKeyPart).join('|');
}

async function findRace(raceId) {
    const race = await knex('races').where({ id: Number(raceId) }).first('id', 'org_id', 'name');
    if (!race) throw httpError(404, '赛事不存在');
    return race;
}

function applyImportScope(query, context, alias = 'dci') {
    if (context.role === 'super_admin') return query;
    if (!context.orgId) return query.whereRaw('1 = 0');
    return query.where(alias + '.org_id', context.orgId);
}

function mapImport(row, items = []) {
    return {
        importId: row.id,
        id: row.id,
        orgId: row.org_id,
        raceId: Number(row.race_id),
        eventType: row.event_type,
        fileName: row.file_name,
        fileHash: row.file_hash,
        sheetName: row.sheet_name || '',
        status: row.status,
        rowCount: Number(row.row_count || 0),
        designCount: Number(row.design_count || 0),
        readyCount: Number(row.ready_count || 0),
        needsInfoCount: Number(row.needs_info_count || 0),
        syncedCount: Number(row.synced_count || 0),
        newCount: Number(row.new_count || 0),
        changedCount: Number(row.changed_count || 0),
        unchangedCount: Number(row.unchanged_count || 0),
        newCategoryCount: Number(row.new_category_count || 0),
        issueSummary: parseJson(row.issue_summary_json, []),
        createdBy: row.created_by || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        items,
    };
}

function mapItem(row) {
    return {
        id: row.id,
        importId: row.import_id,
        orgId: row.org_id,
        raceId: Number(row.race_id),
        excelRowNumber: Number(row.excel_row_number),
        rowHash: row.row_hash,
        stableKey: row.stable_key || '',
        contentHash: row.content_hash || '',
        changeType: row.change_type || 'new',
        firstSeenAt: row.first_seen_at || null,
        lastChangedAt: row.last_changed_at || null,
        area: row.area || '',
        supplier: row.supplier || '',
        category: row.category || '',
        itemName: row.item_name || '',
        buildMaterial: row.build_material || '',
        craft: row.craft || '',
        buildSize: row.build_size || '',
        quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
        unit: row.unit || '',
        unitPrice: row.unit_price === null || row.unit_price === undefined ? null : Number(row.unit_price),
        totalPrice: row.total_price === null || row.total_price === undefined ? null : Number(row.total_price),
        buildNote: row.build_note || '',
        needsDesign: Boolean(row.needs_design),
        requesterDepartment: row.requester_department || '',
        requesterName: row.requester_name || '',
        dueAt: row.due_at || null,
        priority: row.priority || 'normal',
        designMaterial: row.design_material || '',
        designSize: row.design_size || '',
        designNote: row.design_note || '',
        referenceImage: row.reference_image || '',
        referenceNote: row.reference_note || '',
        syncStatus: row.sync_status,
        syncIssues: parseJson(row.sync_issues_json, []),
        designRequestId: row.design_request_id || null,
        raw: parseJson(row.raw_json, {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function findHeaderRow(sheet) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const labels = new Set();
        row.eachCell((cell) => {
            const label = normalizeString(valueFromCell(cell));
            if (label) labels.add(label);
        });
        if (REQUIRED_HEADERS.every((header) => labels.has(header))) return rowNumber;
    }
    throw httpError(400, '未找到协同清单表头，请确认包含 使用区域、项目、设计 列');
}

function buildColumnMap(headerRow) {
    const occurrences = new Map();
    headerRow.eachCell((cell, columnNumber) => {
        const label = normalizeString(valueFromCell(cell));
        if (!label) return;
        if (!occurrences.has(label)) occurrences.set(label, []);
        occurrences.get(label).push(columnNumber);
    });

    for (const header of REQUIRED_HEADERS) {
        if (!occurrences.has(header)) throw httpError(400, '缺少必需列：' + header);
    }

    const designColumn = occurrences.get('设计')[0];
    const materialColumns = occurrences.get('材质') || [];
    return {
        sequence: occurrences.get('序号')?.[0] || null,
        area: occurrences.get('使用区域')?.[0],
        supplier: occurrences.get('供方')?.[0] || null,
        category: occurrences.get('类别')?.[0] || null,
        item: occurrences.get('项目')?.[0],
        buildMaterial: materialColumns.find((column) => column < designColumn) || null,
        craft: occurrences.get('制作工艺')?.[0] || null,
        buildSize: occurrences.get('搭建尺寸')?.[0] || null,
        quantity: occurrences.get('数量')?.[0] || null,
        unit: occurrences.get('单位')?.[0] || null,
        unitPrice: occurrences.get('单价')?.[0] || null,
        totalPrice: occurrences.get('总价')?.[0] || null,
        buildNote: occurrences.get('搭建备注')?.[0] || null,
        design: designColumn,
        requesterDepartment: occurrences.get('需求部门')?.[0] || null,
        requesterName: occurrences.get('需求人')?.[0] || null,
        dueAt: occurrences.get('交付时间')?.[0] || null,
        priority: occurrences.get('优先级')?.[0] || null,
        designMaterial: materialColumns.find((column) => column > designColumn) || null,
        designSize: occurrences.get('设计尺寸')?.[0] || null,
        designNote: occurrences.get('设计备注')?.[0] || null,
        referenceImage: occurrences.get('设计参考图')?.[0] || null,
        referenceNote: occurrences.get('设计参考说明')?.[0] || null,
        systemKey: occurrences.get('系统行键')?.[0] || null,
    };
}

function cellValue(row, column) {
    if (!column) return null;
    return valueFromCell(row.getCell(column));
}

async function parseWorkbook(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw httpError(400, 'Excel 文件没有工作表');

    const headerRowNumber = findHeaderRow(sheet);
    const columns = buildColumnMap(sheet.getRow(headerRowNumber));
    const rows = [];
    let currentArea = '';

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const rawValues = {};
        for (const [name, column] of Object.entries(columns)) {
            if (column) rawValues[name] = cellValue(row, column);
        }

        const meaningfulValues = [
            rawValues.area,
            rawValues.supplier,
            rawValues.category,
            rawValues.item,
            rawValues.buildNote,
            rawValues.design,
            rawValues.quantity,
            rawValues.unit,
        ];
        if (!meaningfulValues.some((value) => normalizeString(value))) continue;

        const explicitArea = normalizeString(rawValues.area);
        if (explicitArea) currentArea = explicitArea;

        const parsed = {
            excelRowNumber: rowNumber,
            area: explicitArea || currentArea || null,
            supplier: normalizeNullableString(rawValues.supplier),
            category: normalizeNullableString(rawValues.category),
            itemName: normalizeNullableString(rawValues.item),
            buildMaterial: normalizeNullableString(rawValues.buildMaterial),
            craft: normalizeNullableString(rawValues.craft),
            buildSize: normalizeNullableString(rawValues.buildSize),
            quantity: numberOrNull(rawValues.quantity),
            unit: normalizeNullableString(rawValues.unit),
            unitPrice: numberOrNull(rawValues.unitPrice),
            totalPrice: numberOrNull(rawValues.totalPrice),
            buildNote: normalizeNullableString(rawValues.buildNote),
            needsDesign: needsDesign(rawValues.design),
            requesterDepartment: normalizeNullableString(rawValues.requesterDepartment),
            requesterName: normalizeNullableString(rawValues.requesterName),
            dueAt: dateOrNull(rawValues.dueAt),
            priority: normalizePriority(rawValues.priority),
            designMaterial: normalizeNullableString(rawValues.designMaterial) || normalizeNullableString(rawValues.buildMaterial),
            designSize: normalizeNullableString(rawValues.designSize) || normalizeNullableString(rawValues.buildSize),
            designNote: normalizeNullableString(rawValues.designNote),
            referenceImage: normalizeNullableString(rawValues.referenceImage),
            referenceNote: normalizeNullableString(rawValues.referenceNote),
            raw: rawValues,
        };
        const stableKey = normalizeNullableString(rawValues.systemKey) || buildStableKey(parsed);
        const contentHash = buildContentHash(parsed);
        const syncState = computeSyncState(parsed);
        rows.push({
            ...parsed,
            ...syncState,
            stableKey,
            contentHash,
            rowHash: contentHash,
        });
    }

    return { sheetName: sheet.name, rows };
}

function summarizeRows(rows) {
    return {
        rowCount: rows.length,
        designCount: rows.filter((row) => row.needsDesign).length,
        readyCount: rows.filter((row) => row.syncStatus === 'ready').length,
        needsInfoCount: rows.filter((row) => row.syncStatus === 'needs_info').length,
        syncedCount: rows.filter((row) => row.syncStatus === 'synced').length,
        newCount: rows.filter((row) => row.changeType === 'new').length,
        changedCount: rows.filter((row) => row.changeType === 'changed').length,
        unchangedCount: rows.filter((row) => row.changeType === 'unchanged').length,
        newCategoryCount: rows.filter((row) => row.changeType === 'new_category').length,
    };
}

async function refreshImportCounts(trx, importId) {
    const items = await trx('design_collaboration_items').where({ import_id: importId });
    const summary = summarizeRows(items.map((item) => ({
        needsDesign: item.needs_design,
        syncStatus: item.sync_status,
        changeType: item.change_type,
    })));
    await trx('design_collaboration_imports')
        .where({ id: importId })
        .update({
            row_count: summary.rowCount,
            design_count: summary.designCount,
            ready_count: summary.readyCount,
            needs_info_count: summary.needsInfoCount,
            synced_count: summary.syncedCount,
            new_count: summary.newCount,
            changed_count: summary.changedCount,
            unchanged_count: summary.unchangedCount,
            new_category_count: summary.newCategoryCount,
            status: summary.syncedCount > 0 ? 'committed' : 'parsed',
            updated_at: trx.fn.now(),
        });
}

async function getImportRow(context, importId, trx = knex) {
    const query = trx('design_collaboration_imports as dci').where('dci.id', importId).select('dci.*');
    applyImportScope(query, context, 'dci');
    const row = await query.first();
    if (!row) throw httpError(404, '导入批次不存在');
    return row;
}

async function getItemRow(context, importId, itemId, trx = knex) {
    const query = trx('design_collaboration_items as dci')
        .where('dci.import_id', importId)
        .where('dci.id', itemId)
        .select('dci.*');
    applyImportScope(query, context, 'dci');
    const row = await query.first();
    if (!row) throw httpError(404, '导入行不存在');
    return row;
}

function snapshotPayloadFromItem(item, importId, now, overrides = {}) {
    return {
        event_type: item.event_type || overrides.eventType || 'general',
        stable_key: item.stable_key,
        content_hash: item.content_hash,
        last_import_id: importId,
        last_item_id: item.id,
        area: item.area,
        supplier: item.supplier,
        category: item.category,
        item_name: item.item_name,
        build_material: item.build_material,
        craft: item.craft,
        build_size: item.build_size,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        build_note: item.build_note,
        needs_design: item.needs_design,
        requester_department: item.requester_department,
        requester_name: item.requester_name,
        due_at: item.due_at,
        priority: item.priority || 'normal',
        design_material: item.design_material,
        design_size: item.design_size,
        design_note: item.design_note,
        reference_image: item.reference_image,
        reference_note: item.reference_note,
        raw_json: JSON.stringify(parseJson(item.raw_json, {})),
        last_changed_at: overrides.lastChangedAt || now,
        updated_at: now,
    };
}

function rowJsonFromSnapshot(row) {
    return {
        stableKey: row.stable_key,
        contentHash: row.content_hash,
        area: row.area || '',
        supplier: row.supplier || '',
        category: row.category || '',
        itemName: row.item_name || '',
        buildMaterial: row.build_material || '',
        craft: row.craft || '',
        buildSize: row.build_size || '',
        quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
        unit: row.unit || '',
        unitPrice: row.unit_price === null || row.unit_price === undefined ? null : Number(row.unit_price),
        totalPrice: row.total_price === null || row.total_price === undefined ? null : Number(row.total_price),
        buildNote: row.build_note || '',
        needsDesign: Boolean(row.needs_design),
        requesterDepartment: row.requester_department || '',
        requesterName: row.requester_name || '',
        dueAt: row.due_at || null,
        priority: row.priority || 'normal',
        designMaterial: row.design_material || '',
        designSize: row.design_size || '',
        designNote: row.design_note || '',
        referenceImage: row.reference_image || '',
        referenceNote: row.reference_note || '',
        firstSeenAt: row.first_seen_at || null,
        lastChangedAt: row.last_changed_at || null,
    };
}

async function applyDiffTracking(trx, { race, raceId, eventType, importId, items }) {
    if (items.length === 0) return;

    const now = new Date();
    const existingSnapshots = await trx('design_collaboration_item_snapshots')
        .where({ org_id: race.org_id, race_id: raceId })
        .whereIn('stable_key', items.map((item) => item.stable_key));
    const existingByKey = new Map(existingSnapshots.map((row) => [row.stable_key, row]));

    const categoryRows = await trx('design_collaboration_item_snapshots')
        .where({ org_id: race.org_id, race_id: raceId })
        .select('area', 'category');
    const hasHistory = categoryRows.length > 0;
    const knownCategories = new Set(categoryRows.map(categoryKey));

    for (const item of items) {
        const existing = existingByKey.get(item.stable_key);
        let changeType = 'new';
        let firstSeenAt = now;
        let lastChangedAt = now;
        let snapshotId = null;

        if (existing) {
            const changed = existing.content_hash !== item.content_hash;
            changeType = changed ? 'changed' : 'unchanged';
            firstSeenAt = existing.first_seen_at;
            lastChangedAt = changed ? now : existing.last_changed_at;
            snapshotId = existing.id;
            await trx('design_collaboration_item_snapshots')
                .where({ id: existing.id })
                .update(snapshotPayloadFromItem({ ...item, event_type: eventType }, importId, now, {
                    eventType,
                    lastChangedAt,
                }));
        } else {
            const nextCategoryKey = categoryKey(item);
            changeType = hasHistory && !knownCategories.has(nextCategoryKey) ? 'new_category' : 'new';
            const [createdSnapshot] = await trx('design_collaboration_item_snapshots')
                .insert({
                    org_id: race.org_id,
                    race_id: raceId,
                    first_seen_at: firstSeenAt,
                    created_at: now,
                    ...snapshotPayloadFromItem({ ...item, event_type: eventType }, importId, now, { eventType }),
                })
                .returning('*');
            snapshotId = createdSnapshot.id;
            knownCategories.add(nextCategoryKey);
        }

        await trx('design_collaboration_items')
            .where({ id: item.id })
            .update({
                change_type: changeType,
                first_seen_at: firstSeenAt,
                last_changed_at: lastChangedAt,
                updated_at: trx.fn.now(),
            });

        item.change_type = changeType;
        item.first_seen_at = firstSeenAt;
        item.last_changed_at = lastChangedAt;
        item.snapshot_id = snapshotId;
    }

    await refreshImportCounts(trx, importId);
}

export async function previewImport(context, { file, body = {} }) {
    if (!file?.buffer) throw httpError(400, '请上传 Excel 文件');
    if (!/\.xlsx$/i.test(file.originalname || '')) throw httpError(400, '仅支持 .xlsx 文件');

    const raceId = Number(body.raceId);
    const race = await findRace(raceId);
    const eventType = normalizeEventType(body.eventType);
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    const parsed = await parseWorkbook(file.buffer);
    const summary = summarizeRows(parsed.rows);

    const importRow = await knex.transaction(async (trx) => {
        const [createdImport] = await trx('design_collaboration_imports')
            .insert({
                org_id: race.org_id,
                race_id: raceId,
                event_type: eventType,
                file_name: file.originalname || '协同清单.xlsx',
                file_hash: fileHash,
                sheet_name: parsed.sheetName,
                row_count: summary.rowCount,
                design_count: summary.designCount,
                ready_count: summary.readyCount,
                needs_info_count: summary.needsInfoCount,
                synced_count: summary.syncedCount,
                issue_summary_json: JSON.stringify([]),
                created_by: context.userId || null,
            })
            .returning('*');

        if (parsed.rows.length > 0) {
            const insertedItems = await trx('design_collaboration_items').insert(parsed.rows.map((item) => ({
                import_id: createdImport.id,
                org_id: race.org_id,
                race_id: raceId,
                excel_row_number: item.excelRowNumber,
                row_hash: item.rowHash,
                stable_key: item.stableKey,
                content_hash: item.contentHash,
                area: item.area,
                supplier: item.supplier,
                category: item.category,
                item_name: item.itemName,
                build_material: item.buildMaterial,
                craft: item.craft,
                build_size: item.buildSize,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unitPrice,
                total_price: item.totalPrice,
                build_note: item.buildNote,
                needs_design: item.needsDesign,
                requester_department: item.requesterDepartment,
                requester_name: item.requesterName,
                due_at: item.dueAt,
                priority: item.priority,
                design_material: item.designMaterial,
                design_size: item.designSize,
                design_note: item.designNote,
                reference_image: item.referenceImage,
                reference_note: item.referenceNote,
                sync_status: item.syncStatus,
                sync_issues_json: JSON.stringify(item.syncIssues),
                raw_json: JSON.stringify(item.raw),
            }))).returning('*');
            await applyDiffTracking(trx, {
                race,
                raceId,
                eventType,
                importId: createdImport.id,
                items: insertedItems,
            });
        }

        return createdImport;
    });

    return getImport(context, importRow.id);
}

export async function listImports(context, filters = {}) {
    const query = knex('design_collaboration_imports as dci')
        .select('dci.*')
        .orderBy('dci.created_at', 'desc');
    applyImportScope(query, context, 'dci');
    if (filters.raceId) query.where('dci.race_id', Number(filters.raceId));
    const rows = await query;
    return { items: rows.map((row) => mapImport(row)), total: rows.length };
}

export async function getImport(context, importId) {
    const row = await getImportRow(context, importId);
    const items = await knex('design_collaboration_items')
        .where({ import_id: importId })
        .orderBy('excel_row_number', 'asc');
    return mapImport(row, items.map(mapItem));
}

export async function updateImportItem(context, importId, itemId, payload = {}) {
    await getImportRow(context, importId);
    let updatedId = itemId;
    await knex.transaction(async (trx) => {
        const row = await getItemRow(context, importId, itemId, trx);
        const next = {
            ...row,
            needsDesign: row.needs_design,
            requesterDepartment: Object.prototype.hasOwnProperty.call(payload, 'requesterDepartment')
                ? normalizeNullableString(payload.requesterDepartment)
                : row.requester_department,
            requesterName: Object.prototype.hasOwnProperty.call(payload, 'requesterName')
                ? normalizeNullableString(payload.requesterName)
                : row.requester_name,
            dueAt: Object.prototype.hasOwnProperty.call(payload, 'dueAt')
                ? dateOrNull(payload.dueAt)
                : row.due_at,
            priority: Object.prototype.hasOwnProperty.call(payload, 'priority')
                ? normalizePriority(payload.priority)
                : row.priority,
            designMaterial: Object.prototype.hasOwnProperty.call(payload, 'designMaterial')
                ? normalizeNullableString(payload.designMaterial)
                : row.design_material,
            designSize: Object.prototype.hasOwnProperty.call(payload, 'designSize')
                ? normalizeNullableString(payload.designSize)
                : row.design_size,
            designNote: Object.prototype.hasOwnProperty.call(payload, 'designNote')
                ? normalizeNullableString(payload.designNote)
                : row.design_note,
            referenceNote: Object.prototype.hasOwnProperty.call(payload, 'referenceNote')
                ? normalizeNullableString(payload.referenceNote)
                : row.reference_note,
        };
        const syncState = computeSyncState(next);
        await trx('design_collaboration_items')
            .where({ id: itemId })
            .update({
                requester_department: next.requesterDepartment,
                requester_name: next.requesterName,
                due_at: next.dueAt,
                priority: next.priority,
                design_material: next.designMaterial,
                design_size: next.designSize,
                design_note: next.designNote,
                reference_note: next.referenceNote,
                sync_status: syncState.syncStatus,
                sync_issues_json: JSON.stringify(syncState.syncIssues),
                updated_at: trx.fn.now(),
            });
        await refreshImportCounts(trx, importId);
        updatedId = itemId;
    });

    const row = await getItemRow(context, importId, updatedId);
    return mapItem(row);
}

function buildRequestPayload(item, eventType) {
    const areaPrefix = item.area ? item.area + ' - ' : '';
    const title = areaPrefix + (item.item_name || '设计需求');
    const fallbackRequirement = [item.item_name, item.craft, item.build_note]
        .map((value) => normalizeString(value))
        .filter(Boolean)
        .join('；');
    return {
        event_type: eventType,
        requester_department: item.requester_department,
        requester_name: item.requester_name,
        title,
        requirement_text: item.design_note || fallbackRequirement || title,
        reference_notes: item.reference_note || null,
        size_spec: item.design_size || item.build_size || null,
        material_spec: item.design_material || item.build_material || item.craft || null,
        due_at: item.due_at,
        priority: normalizePriority(item.priority),
    };
}

async function writeHistory(trx, requestId, actorId) {
    await trx('design_request_reviews').insert({
        request_id: requestId,
        action: 'submit',
        from_status: null,
        to_status: 'pending_review',
        comment: '从协同清单同步设计需求',
        actor_id: actorId || null,
    });
}

export async function commitImport(context, importId, payload = {}) {
    const importRow = await getImportRow(context, importId);
    const itemIds = Array.isArray(payload.itemIds) ? payload.itemIds.filter(Boolean) : [];
    const syncedItems = [];
    const skippedItems = [];

    await knex.transaction(async (trx) => {
        const query = trx('design_collaboration_items')
            .where({ import_id: importId })
            .where('needs_design', true)
            .orderBy('excel_row_number', 'asc');
        if (itemIds.length > 0) query.whereIn('id', itemIds);
        const rows = await query;

        for (const item of rows) {
            if (item.design_request_id) {
                skippedItems.push({ itemId: item.id, reason: '已同步' });
                continue;
            }
            if (item.sync_status !== 'ready') {
                skippedItems.push({ itemId: item.id, reason: '字段未补齐' });
                continue;
            }

            const requestPayload = buildRequestPayload(item, importRow.event_type);
            const [requestRow] = await trx('design_requests')
                .insert({
                    org_id: item.org_id,
                    race_id: item.race_id,
                    template_id: null,
                    ...requestPayload,
                    status: 'pending_review',
                    source_type: 'collaboration_import',
                    created_by: context.userId || null,
                    updated_by: context.userId || null,
                })
                .returning('*');

            if (item.reference_image) {
                await trx('design_request_assets').insert({
                    request_id: requestRow.id,
                    asset_type: 'reference',
                    file_name: item.reference_image,
                    file_url: item.reference_image,
                    mime_type: null,
                    note: item.reference_note || null,
                    version: 1,
                    uploaded_by: context.userId || null,
                });
            }

            await writeHistory(trx, requestRow.id, context.userId);
            await trx('design_collaboration_items')
                .where({ id: item.id })
                .update({
                    sync_status: 'synced',
                    design_request_id: requestRow.id,
                    sync_issues_json: JSON.stringify([]),
                    updated_at: trx.fn.now(),
                });
            syncedItems.push({ itemId: item.id, requestId: requestRow.id });
        }

        await refreshImportCounts(trx, importId);
    });

    const refreshed = await getImport(context, importId);
    return {
        ...refreshed,
        syncedCount: syncedItems.length,
        totalSyncedCount: refreshed.syncedCount,
        syncedItems,
        skippedItems,
    };
}

function normalizeExportMode(value) {
    const mode = normalizeString(value) || 'full_marked';
    return EXPORT_MODES.has(mode) ? mode : 'full_marked';
}

function mapExport(row) {
    return {
        id: row.id,
        exportId: row.id,
        orgId: row.org_id,
        raceId: Number(row.race_id),
        eventType: row.event_type,
        roundNo: Number(row.round_no || 0),
        mode: row.mode,
        baselineExportId: row.baseline_export_id || null,
        fileName: row.file_name,
        status: row.status,
        rowCount: Number(row.row_count || 0),
        newCount: Number(row.new_count || 0),
        changedCount: Number(row.changed_count || 0),
        unchangedCount: Number(row.unchanged_count || 0),
        newCategoryCount: Number(row.new_category_count || 0),
        createdBy: row.created_by || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        downloadUrl: '/api/app/design-requests/collaboration-exports/' + row.id + '/download',
    };
}

async function getExportRow(context, exportId, trx = knex) {
    const query = trx('design_collaboration_exports as dce')
        .where('dce.id', exportId)
        .select('dce.*');
    applyImportScope(query, context, 'dce');
    const row = await query.first();
    if (!row) throw httpError(404, '导出轮次不存在');
    return row;
}

async function getBaselineExport(context, raceId, eventType, baselineExportId, trx = knex) {
    if (baselineExportId) {
        const row = await getExportRow(context, baselineExportId, trx);
        if (Number(row.race_id) !== Number(raceId)) throw httpError(400, '基准导出轮次不属于当前赛事');
        return row;
    }

    const query = trx('design_collaboration_exports as dce')
        .where('dce.race_id', Number(raceId))
        .where('dce.event_type', eventType)
        .whereNot('dce.mode', 'blank_template')
        .orderBy('dce.round_no', 'desc')
        .select('dce.*');
    applyImportScope(query, context, 'dce');
    return query.first();
}

function classifyExportChange(snapshot, baselineByKey, baselineCategories) {
    if (!baselineByKey) return 'new';
    const rowJson = rowJsonFromSnapshot(snapshot);
    const previous = baselineByKey.get(snapshot.stable_key);
    if (!previous) {
        return baselineCategories.has(categoryKey(rowJson)) ? 'new' : 'new_category';
    }
    return previous.content_hash === snapshot.content_hash ? 'unchanged' : 'changed';
}

function summarizeChangeTypes(rows) {
    return {
        rowCount: rows.length,
        newCount: rows.filter((row) => row.changeType === 'new').length,
        changedCount: rows.filter((row) => row.changeType === 'changed').length,
        unchangedCount: rows.filter((row) => row.changeType === 'unchanged').length,
        newCategoryCount: rows.filter((row) => row.changeType === 'new_category').length,
    };
}

function exportFileName(mode, roundNo) {
    const modeName = {
        blank_template: '标准模板',
        incremental: '增量清单',
        full_marked: '完整标记清单',
    }[mode] || '协同清单';
    return '设计协同' + modeName + '-第' + roundNo + '轮.xlsx';
}

function toExcelDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function rowValuesForWorkbook(row, sequence, exportRow, changeType) {
    return [
        sequence,
        row.area || '',
        row.supplier || '',
        row.category || '',
        row.itemName || '',
        row.buildMaterial || '',
        row.craft || '',
        row.buildSize || '',
        row.quantity ?? '',
        row.unit || '',
        row.unitPrice ?? '',
        row.totalPrice ?? '',
        row.buildNote || '',
        row.needsDesign ? '✅' : '',
        row.requesterDepartment || '',
        row.requesterName || '',
        toExcelDate(row.dueAt) || '',
        row.priority || 'normal',
        row.designMaterial || '',
        row.designSize || '',
        row.designNote || '',
        row.referenceImage || '',
        row.referenceNote || '',
        CHANGE_LABELS[changeType] || changeType,
        exportRow.round_no,
        toExcelDate(row.firstSeenAt) || '',
        toExcelDate(row.lastChangedAt) || '',
        row.stableKey || '',
    ];
}

async function buildExportWorkbook(exportRow, exportItems) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DOOR';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('搭建&设计 清单');
    const headers = [...BASE_HEADERS, ...EXPORT_HELPER_HEADERS];
    sheet.addRow(headers);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    exportItems.forEach((item, index) => {
        const rowJson = parseJson(item.row_json, {});
        sheet.addRow(rowValuesForWorkbook(rowJson, index + 1, exportRow, item.change_type));
    });

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5FD1' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(headers.length).address };
    sheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: Math.min(Math.max(String(header).length + 6, 10), 28),
    }));
    ['Q', 'Z', 'AA'].forEach((column) => {
        sheet.getColumn(column).numFmt = 'yyyy-mm-dd hh:mm';
    });
    sheet.getColumn('AB').hidden = true;

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

export async function listExports(context, filters = {}) {
    const query = knex('design_collaboration_exports as dce')
        .select('dce.*')
        .orderBy('dce.round_no', 'desc');
    applyImportScope(query, context, 'dce');
    if (filters.raceId) query.where('dce.race_id', Number(filters.raceId));
    if (filters.eventType) query.where('dce.event_type', normalizeEventType(filters.eventType));
    const rows = await query;
    return { items: rows.map(mapExport), total: rows.length };
}

export async function createExport(context, payload = {}) {
    const raceId = Number(payload.raceId);
    const race = await findRace(raceId);
    const eventType = normalizeEventType(payload.eventType);
    const mode = normalizeExportMode(payload.mode);

    const created = await knex.transaction(async (trx) => {
        const [roundRow] = await trx('design_collaboration_exports')
            .where({ org_id: race.org_id, race_id: raceId })
            .max('round_no as max_round');
        const roundNo = Number(roundRow?.max_round || 0) + 1;
        const baseline = mode === 'blank_template'
            ? null
            : await getBaselineExport(context, raceId, eventType, payload.baselineExportId, trx);

        let baselineByKey = null;
        let baselineCategories = new Set();
        if (baseline) {
            const baselineItems = await trx('design_collaboration_export_items')
                .where({ export_id: baseline.id });
            baselineByKey = new Map(baselineItems.map((item) => [item.stable_key, item]));
            baselineCategories = new Set(baselineItems.map((item) => categoryKey(parseJson(item.row_json, {}))));
        }

        const snapshots = mode === 'blank_template'
            ? []
            : await trx('design_collaboration_item_snapshots')
                .where({ org_id: race.org_id, race_id: raceId, event_type: eventType })
                .orderBy([{ column: 'area', order: 'asc' }, { column: 'item_name', order: 'asc' }]);

        const exportRows = snapshots.map((snapshot) => ({
            snapshot,
            rowJson: rowJsonFromSnapshot(snapshot),
            changeType: classifyExportChange(snapshot, baselineByKey, baselineCategories),
        })).filter((row) => mode !== 'incremental' || row.changeType !== 'unchanged');
        const summary = summarizeChangeTypes(exportRows);
        const fileName = exportFileName(mode, roundNo);

        const [exportRow] = await trx('design_collaboration_exports')
            .insert({
                org_id: race.org_id,
                race_id: raceId,
                event_type: eventType,
                round_no: roundNo,
                mode,
                baseline_export_id: baseline?.id || null,
                file_name: fileName,
                row_count: summary.rowCount,
                new_count: summary.newCount,
                changed_count: summary.changedCount,
                unchanged_count: summary.unchangedCount,
                new_category_count: summary.newCategoryCount,
                created_by: context.userId || null,
            })
            .returning('*');

        if (exportRows.length > 0) {
            await trx('design_collaboration_export_items').insert(exportRows.map((item) => ({
                export_id: exportRow.id,
                snapshot_id: item.snapshot.id,
                stable_key: item.snapshot.stable_key,
                content_hash: item.snapshot.content_hash,
                change_type: item.changeType,
                first_seen_at: item.snapshot.first_seen_at,
                last_changed_at: item.snapshot.last_changed_at,
                row_json: JSON.stringify({
                    ...item.rowJson,
                    changeType: item.changeType,
                }),
            })));
        }

        return exportRow;
    });

    return mapExport(created);
}

export async function downloadExportWorkbook(context, exportId) {
    const exportRow = await getExportRow(context, exportId);
    const items = await knex('design_collaboration_export_items')
        .where({ export_id: exportRow.id })
        .orderBy('created_at', 'asc');
    const buffer = await buildExportWorkbook(exportRow, items);
    return {
        export: mapExport(exportRow),
        fileName: exportRow.file_name,
        buffer,
    };
}
