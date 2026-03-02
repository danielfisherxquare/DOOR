/**
 * audit 表的 snake_case ↔ camelCase 映射（占位）
 * 在后续 Phase 补充
 */

export function fromDbRow(row) {
    if (!row) return null;
    return { ...row };
}
