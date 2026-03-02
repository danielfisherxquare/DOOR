/**
 * auth 表的 snake_case ↔ camelCase 映射（占位）
 * 在 Phase 2 auth 模块迁移时补充
 */

export function fromDbRow(row) {
    if (!row) return null;
    return { ...row };
}
