import { createHash } from 'node:crypto';
import { EVENT_TYPES } from './design-request.defaults.js';

const EXPORT_MODES = new Set(['blank_template', 'incremental', 'full_marked']);

export function normalizeString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && value === 0) return '';
    return String(value).trim();
}

export function normalizeNullableString(value) {
    const text = normalizeString(value);
    return text || null;
}

export function normalizeUploadedFileName(value) {
    const fileName = normalizeString(value) || '协同清单.xlsx';
    const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
    const looksMojibake = /[ÃÂæèäå]/.test(fileName);
    if (looksMojibake && /[\u4e00-\u9fff]/.test(decoded) && !decoded.includes('�')) {
        return decoded;
    }
    return fileName;
}

function normalizeKeyPart(value) {
    return normalizeString(value).replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeEventType(value) {
    const eventType = normalizeString(value) || 'general';
    return EVENT_TYPES.includes(eventType) ? eventType : 'general';
}

export function normalizePriority(value) {
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

export function parseJson(value, fallback) {
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

export function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function dateOrNull(value) {
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

export function needsDesign(value) {
    const text = normalizeString(value).toLowerCase();
    return ['✅', '✓', '✔', '是', 'y', 'yes', 'true', '1'].includes(text);
}

export function computeSyncState(row) {
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

export function buildStableKey(row) {
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

export function buildContentHash(row) {
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

export function categoryKey(row) {
    return [row.area, row.category].map(normalizeKeyPart).join('|');
}

export function normalizeRaceIds(value) {
    const raw = Array.isArray(value)
        ? value
        : value === null || value === undefined || value === ''
            ? []
            : [value];
    return [...new Set(raw.map(Number).filter(Boolean))];
}

export function scopeKeyForRaceIds(raceIds = []) {
    const normalized = normalizeRaceIds(raceIds).sort((a, b) => a - b);
    if (normalized.length === 0) return 'org';
    if (normalized.length === 1) return 'race:' + normalized[0];
    return 'races:' + normalized.join(',');
}

export function normalizeExportMode(value) {
    const mode = normalizeString(value) || 'full_marked';
    return EXPORT_MODES.has(mode) ? mode : 'full_marked';
}

export function exportFileName(mode, roundNo) {
    const modeName = {
        blank_template: '标准模板',
        incremental: '增量清单',
        full_marked: '完整标记清单',
    }[mode] || '协同清单';
    return '设计协同' + modeName + '-第' + roundNo + '轮.xlsx';
}
