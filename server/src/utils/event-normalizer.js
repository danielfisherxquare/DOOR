/**
 * Event Normalizer — 比赛项目名称规范化共享工具
 *
 * 标准名称：
 *   - "马拉松"      ← 全马 / Full / Marathon / 42.195km …
 *   - "半程马拉松"   ← 半马 / Half / Half Marathon / 21.0975km …
 *   - 自定义项目保持原样（如 10K、欢乐跑）
 */

const HALF_ALIASES = ['half marathon', 'half', '21.0975km', '21km', '21k', '半程马拉松', '半程', '半马'];
const FULL_ALIASES = ['marathon', 'full', '42.195km', '42km', '42k', '全程马拉松', '全程', '全马'];

export function normalizeEvent(rawEvent) {
    const event = String(rawEvent || '').trim();
    if (!event) return '';
    const lower = event.toLowerCase();
    if (HALF_ALIASES.includes(lower)) return '半程马拉松';
    if (FULL_ALIASES.includes(lower)) return '马拉松';
    return event; // 自定义项目保持原样
}

export function isHalfEvent(event) {
    if (!event) return false;
    const v = String(event).trim().toLowerCase();
    return v.includes('半') || v.includes('half');
}

export function isFullEvent(event) {
    if (isHalfEvent(event)) return false;
    const v = String(event || '').trim().toLowerCase();
    return v.includes('马拉松') || v.includes('marathon') || v.includes('full') || v.includes('全');
}
