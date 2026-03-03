/**
 * Job Handler 注册表
 *
 * handler 接口：async function(job, { knex, heartbeat })
 * - job: 领域对象（camelCase）
 * - knex: Knex 实例（用于数据库操作）
 * - heartbeat: async (progress?, message?) => void（续租并更新进度）
 */

const handlers = new Map();

/**
 * 注册一个 Job handler
 * @param {string} type - Job 类型
 * @param {Function} handler - handler 函数
 */
export function registerHandler(type, handler) {
    if (handlers.has(type)) {
        throw new Error(`Handler already registered for type: ${type}`);
    }
    handlers.set(type, handler);
    console.log(`📋 注册 Job handler: ${type}`);
}

/**
 * 获取指定类型的 handler
 * @param {string} type - Job 类型
 * @returns {Function|undefined}
 */
export function getHandler(type) {
    return handlers.get(type);
}

/**
 * 获取所有已注册的 handler 类型
 * @returns {string[]}
 */
export function getRegisteredTypes() {
    return [...handlers.keys()];
}

// ── 内置测试 handler ────────────────────────────────────
registerHandler('echo', async (job, _ctx) => {
    // 直接返回 payload 作为 result
    return job.payload;
});

