import ExcelJS from 'exceljs';
import {
    buildContentHash,
    buildStableKey,
    computeSyncState,
    dateOrNull,
    needsDesign,
    normalizeNullableString,
    normalizePriority,
    normalizeString,
    numberOrNull,
    parseJson,
} from './design-collaboration-data.js';

const REQUIRED_HEADERS = ['使用区域', '项目', '设计'];
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

export async function parseCollaborationWorkbook(buffer) {
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

export async function buildCollaborationExportWorkbook(exportRow, exportItems) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ArcSpro';
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
