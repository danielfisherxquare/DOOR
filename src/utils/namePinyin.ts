import { pinyin, segment } from 'pinyin-pro';

export type SurnamePinyinOverrides = Record<string, string>;

export interface NamePinyinOptions {
    surnameOverrides?: SurnamePinyinOverrides;
}

export const SURNAME_OVERRIDE_STORAGE_KEY = 'surnamePinyinOverrides';

export const DEFAULT_SURNAME_OVERRIDES: SurnamePinyinOverrides = Object.freeze({
    '单': 'shan',
    '解': 'xie',
    '仇': 'qiu',
    '查': 'zha',
    '曾': 'zeng',
    '区': 'ou',
    '朴': 'piao',
    '乐': 'yue',
    '折': 'she',
    '繁': 'po',
    '尉迟': 'yu chi',
    '万俟': 'mo qi',
    '澹台': 'tan tai',
});

const CHINESE_SURNAME_RE = /^[\u3400-\u9fff]{1,4}$/;
const PINYIN_VALUE_RE = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;
const CHINESE_NAME_RE = /[\u3400-\u9fff]/;
const ASCII_NAME_RE = /^[A-Za-z\s]+$/;

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function compactName(value: string): string {
    return value.replace(/\s+/g, '');
}

function normalizeOverrideValue(value: string): string {
    return normalizeWhitespace(value).toLowerCase();
}

function sanitizeOverrides(input: unknown): SurnamePinyinOverrides {
    if (!input || typeof input !== 'object') return {};

    const sanitized: SurnamePinyinOverrides = {};
    for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
        const key = compactName(String(rawKey || ''));
        const value = normalizeOverrideValue(String(rawValue || ''));
        if (!CHINESE_SURNAME_RE.test(key) || !PINYIN_VALUE_RE.test(value)) continue;
        sanitized[key] = value;
    }
    return sanitized;
}

function mergeOverrides(overrides?: SurnamePinyinOverrides): SurnamePinyinOverrides {
    return { ...DEFAULT_SURNAME_OVERRIDES, ...sanitizeOverrides(overrides) };
}

function findLongestSurnamePrefix(name: string, overrides: SurnamePinyinOverrides): string | null {
    let matched: string | null = null;
    for (const key of Object.keys(overrides)) {
        if (!name.startsWith(key)) continue;
        if (!matched || key.length > matched.length) {
            matched = key;
        }
    }
    return matched;
}

function toUpperPinyin(parts: string[]): string {
    return parts.filter(Boolean).join(' ').toUpperCase();
}

function resolveRemainingNamePinyin(name: string): string[] {
    if (!name) return [];
    return pinyin(name, { toneType: 'none', type: 'array' }).map((item) => item.toLowerCase());
}

function resolveHeadAwareSegments(name: string): string[] {
    return segment(name, { mode: 'surname', surname: 'head', toneType: 'none' })
        .flatMap((item, index) => {
            const origin = typeof item === 'string' ? item : item.origin;
            if (!origin) return [];
            if (index === 0) {
                return pinyin(origin, { toneType: 'none', type: 'array', mode: 'surname', surname: 'head' });
            }
            return pinyin(origin, { toneType: 'none', type: 'array' });
        })
        .map((item) => String(item).toLowerCase())
        .filter(Boolean);
}

function isAsciiName(name: string): boolean {
    return ASCII_NAME_RE.test(name);
}

function hasChineseName(name: string): boolean {
    return CHINESE_NAME_RE.test(name);
}

export function loadSurnamePinyinOverrides(): SurnamePinyinOverrides {
    if (typeof localStorage === 'undefined') return {};

    try {
        const raw = localStorage.getItem(SURNAME_OVERRIDE_STORAGE_KEY);
        if (!raw) return {};
        return sanitizeOverrides(JSON.parse(raw));
    } catch {
        return {};
    }
}

export function saveSurnamePinyinOverrides(overrides: SurnamePinyinOverrides): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SURNAME_OVERRIDE_STORAGE_KEY, JSON.stringify(sanitizeOverrides(overrides)));
}

export function clearSurnamePinyinOverrides(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(SURNAME_OVERRIDE_STORAGE_KEY);
}

export function parseSurnameOverrideLines(input: string): { overrides: SurnamePinyinOverrides; errors: string[] } {
    const overrides: SurnamePinyinOverrides = {};
    const errors: string[] = [];
    const seenKeys = new Set<string>();

    input.split(/\r?\n/).forEach((line, index) => {
        const raw = line.trim();
        if (!raw || raw.startsWith('#')) return;

        const separatorIndex = raw.indexOf('=');
        if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
            errors.push(`第 ${index + 1} 行格式错误，应为 姓=pin yin`);
            return;
        }

        const key = compactName(raw.slice(0, separatorIndex));
        const value = normalizeOverrideValue(raw.slice(separatorIndex + 1));

        if (!CHINESE_SURNAME_RE.test(key)) {
            errors.push(`第 ${index + 1} 行姓氏无效：${key}`);
            return;
        }
        if (!PINYIN_VALUE_RE.test(value)) {
            errors.push(`第 ${index + 1} 行拼音无效：${value}`);
            return;
        }
        if (seenKeys.has(key)) {
            errors.push(`第 ${index + 1} 行重复定义姓氏：${key}`);
            return;
        }

        seenKeys.add(key);
        overrides[key] = value;
    });

    return { overrides, errors };
}

export function formatSurnameOverrideLines(overrides: SurnamePinyinOverrides): string {
    return Object.entries(sanitizeOverrides(overrides))
        .sort((left, right) => left[0].localeCompare(right[0], 'zh-CN'))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
}

export function getSurnameOverrideExamples(): SurnamePinyinOverrides {
    return {
        '区': DEFAULT_SURNAME_OVERRIDES['区'],
        '单': DEFAULT_SURNAME_OVERRIDES['单'],
        '解': DEFAULT_SURNAME_OVERRIDES['解'],
        '查': DEFAULT_SURNAME_OVERRIDES['查'],
        '曾': DEFAULT_SURNAME_OVERRIDES['曾'],
        '尉迟': DEFAULT_SURNAME_OVERRIDES['尉迟'],
        '万俟': DEFAULT_SURNAME_OVERRIDES['万俟'],
        '澹台': DEFAULT_SURNAME_OVERRIDES['澹台'],
    };
}

export function nameToPinyin(name: string, options: NamePinyinOptions = {}): string {
    const normalized = normalizeWhitespace(name || '');
    if (!normalized) return '';

    if (isAsciiName(normalized)) {
        return normalized.toUpperCase();
    }

    const compact = compactName(normalized);
    if (!hasChineseName(compact)) {
        return normalized.toUpperCase();
    }

    const overrides = mergeOverrides(options.surnameOverrides);
    const matchedSurname = findLongestSurnamePrefix(compact, overrides);

    if (matchedSurname) {
        const surnamePinyin = overrides[matchedSurname];
        const remaining = compact.slice(matchedSurname.length);
        return toUpperPinyin([surnamePinyin, ...resolveRemainingNamePinyin(remaining)]);
    }

    const segmented = resolveHeadAwareSegments(compact);
    if (segmented.length > 0) {
        return toUpperPinyin(segmented);
    }

    return toUpperPinyin(resolveRemainingNamePinyin(compact));
}

export function buildNameSortKey(name: string, options: NamePinyinOptions = {}): string {
    const normalized = normalizeWhitespace(name || '');
    if (!normalized) return '9:';

    if (hasChineseName(normalized)) {
        const pinyinValue = nameToPinyin(normalized, options).toLowerCase();
        return `0:${pinyinValue}:${compactName(normalized)}`;
    }

    if (isAsciiName(normalized)) {
        return `1:${normalized.toLowerCase()}`;
    }

    return `2:${normalized.toLowerCase()}`;
}

export function compareNamesByPinyin(a: string, b: string, options: NamePinyinOptions = {}): number {
    const leftKey = buildNameSortKey(a, options);
    const rightKey = buildNameSortKey(b, options);
    const keyCompare = leftKey.localeCompare(rightKey, 'en');
    if (keyCompare !== 0) return keyCompare;
    return a.localeCompare(b, 'zh-CN');
}

export function sortNamesByPinyin(names: string[], options: NamePinyinOptions = {}): string[] {
    return names
        .map((name) => ({ name, key: buildNameSortKey(name, options) }))
        .sort((left, right) => {
            const keyCompare = left.key.localeCompare(right.key, 'en');
            if (keyCompare !== 0) return keyCompare;
            return left.name.localeCompare(right.name, 'zh-CN');
        })
        .map((item) => item.name);
}
