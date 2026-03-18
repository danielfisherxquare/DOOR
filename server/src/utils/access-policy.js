/**
 * PII 访问策略工具
 * ==================
 *
 * 统一判断用户是否应该看到明文 PII
 * 避免 API 路由中散落权限判断逻辑
 */

// ============================================================================
// 访问级别定义
// ============================================================================

/**
 * PII 访问级别
 * - plaintext: 明文可见
 * - masked: 脱敏可见
 * - denied: 禁止访问
 */
export const PII_ACCESS_LEVEL = {
    PLAINTEXT: 'plaintext',
    MASKED: 'masked',
    DENIED: 'denied',
};

// ============================================================================
// 核心判断函数
// ============================================================================

/**
 * 判断用户是否应该看到明文 PII
 *
 * @param {object} req - Express request 对象
 * @param {string} resourceType - 资源类型 ('records' | 'lottery_lists' | 'export')
 * @returns {boolean} true = 明文, false = 需要脱敏
 */
export function shouldSeePlaintext(req, resourceType = 'records') {
    const { authContext, raceAccess } = req;

    // 未认证用户不能看到任何 PII
    if (!authContext?.userId || !authContext?.role) {
        return false;
    }

    // super_admin 始终看明文
    if (authContext.role === 'super_admin') {
        return true;
    }

    // 如果有 raceAccess，根据 effectiveAccessLevel 判断
    if (raceAccess?.effectiveAccessLevel) {
        return raceAccess.effectiveAccessLevel === 'editor';
    }

    // 没有具体赛事权限时，org_admin 看明文
    if (authContext.role === 'org_admin') {
        return true;
    }

    // 默认脱敏
    return false;
}

/**
 * 获取用户的 PII 访问级别
 *
 * @param {object} req - Express request 对象
 * @param {string} resourceType - 资源类型
 * @returns {string} PII_ACCESS_LEVEL 值
 */
export function getPiiAccessLevel(req, resourceType = 'records') {
    const { authContext, raceAccess } = req;

    // 未认证用户
    if (!authContext?.userId || !authContext?.role) {
        return PII_ACCESS_LEVEL.DENIED;
    }

    // super_admin 始终明文
    if (authContext.role === 'super_admin') {
        return PII_ACCESS_LEVEL.PLAINTEXT;
    }

    // 有赛事权限时，根据 effectiveAccessLevel 判断
    if (raceAccess?.effectiveAccessLevel) {
        return raceAccess.effectiveAccessLevel === 'editor'
            ? PII_ACCESS_LEVEL.PLAINTEXT
            : PII_ACCESS_LEVEL.MASKED;
    }

    // org_admin 无具体赛事权限时，仍可看明文
    if (authContext.role === 'org_admin') {
        return PII_ACCESS_LEVEL.PLAINTEXT;
    }

    // 默认脱敏
    return PII_ACCESS_LEVEL.MASKED;
}

/**
 * 检查用户是否有导出权限
 *
 * @param {object} req - Express request 对象
 * @returns {object} { allowed: boolean, plaintext: boolean }
 */
export function checkExportPermission(req) {
    const { authContext, raceAccess } = req;

    // 未认证用户不能导出
    if (!authContext?.userId || !authContext?.role) {
        return { allowed: false, plaintext: false, reason: '未授权' };
    }

    // super_admin 可以导出明文
    if (authContext.role === 'super_admin') {
        return { allowed: true, plaintext: true };
    }

    // 需要有具体赛事权限
    if (!raceAccess?.effectiveAccessLevel) {
        return { allowed: false, plaintext: false, reason: '无赛事访问权限' };
    }

    // editor 可以导出明文
    if (raceAccess.effectiveAccessLevel === 'editor') {
        return { allowed: true, plaintext: true };
    }

    // viewer 可以导出，但只能导出脱敏数据
    return { allowed: true, plaintext: false };
}

// ============================================================================
// 中间件
// ============================================================================

/**
 * PII 访问控制中间件
 * 在 req 上添加 piiAccess 字段
 *
 * @param {string} resourceType - 资源类型
 * @returns {Function} Express 中间件
 */
export function piiAccessMiddleware(resourceType = 'records') {
    return (req, res, next) => {
        req.piiAccess = {
            level: getPiiAccessLevel(req, resourceType),
            plaintext: shouldSeePlaintext(req, resourceType),
        };
        next();
    };
}

/**
 * 导出权限中间件
 * 检查用户是否有权导出数据
 *
 * @param {object} options - 选项
 * @param {boolean} options.requirePlaintext - 是否要求明文导出权限
 * @returns {Function} Express 中间件
 */
export function requireExportPermission(options = {}) {
    return (req, res, next) => {
        const { allowed, plaintext, reason } = checkExportPermission(req);

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: reason || '无导出权限',
            });
        }

        if (options.requirePlaintext && !plaintext) {
            return res.status(403).json({
                success: false,
                message: '当前权限仅支持脱敏导出',
            });
        }

        req.exportAccess = { allowed, plaintext };
        next();
    };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 根据访问级别处理记录
 * 自动决定是否脱敏
 *
 * @param {object} record - 原始记录
 * @param {object} piiAccess - PII 访问信息
 * @param {Function} maskFn - 脱敏函数
 * @returns {object} 处理后的记录
 */
export function applyPiiPolicy(record, piiAccess, maskFn) {
    if (!record) return record;

    // 明文权限，直接返回
    if (piiAccess?.plaintext) {
        return record;
    }

    // 需要脱敏
    return maskFn ? maskFn(record) : record;
}

/**
 * 批量处理记录
 *
 * @param {object[]} records - 记录数组
 * @param {object} piiAccess - PII 访问信息
 * @param {Function} maskFn - 脱敏函数
 * @returns {object[]} 处理后的记录数组
 */
export function applyPiiPolicyBatch(records, piiAccess, maskFn) {
    if (!Array.isArray(records)) return records;
    return records.map(record => applyPiiPolicy(record, piiAccess, maskFn));
}