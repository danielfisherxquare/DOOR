/**
 * Require Auth 中间件 — 认证与角色兼容映射核心
 * 替代原 tenantContext 成为统一门禁
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// TODO: Remove this map after 2026-07-01 (3-month migration window from 2026-04-01).
// Legacy tokens issued before the permission consolidation migration will have expired by then.
// 兼容旧版 token，过渡期平滑支持
const ROLE_MIGRATION_MAP = {
    owner: 'org_admin',
    admin: 'org_admin',
    org_finance: 'org_admin',
    member: 'user',
    race_editor: 'race_admin',
    race_viewer: 'user',
    editor: 'race_admin',
    viewer: 'user',
};

export async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: '未授权，请先登录',
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);

        // 映射纠正旧 token 带来的旧版角色名称
        if (ROLE_MIGRATION_MAP[decoded.role]) {
            console.warn(
                `[DEPRECATED] Legacy role "${decoded.role}" detected for user ${decoded.userId}. ` +
                    `Mapped to "${ROLE_MIGRATION_MAP[decoded.role]}". User should re-login to get updated token.`
            );
        }
        const normalizedRole = ROLE_MIGRATION_MAP[decoded.role] || decoded.role;

        req.authContext = {
            userId: decoded.userId,
            orgId: decoded.orgId || null,
            role: normalizedRole,
            strictSurfaceModules: Boolean(decoded.preferences?.strictSurfaceModules),
        };

        // DEPRECATED: req.tenantContext is a legacy alias for req.authContext.
        // New code must use req.authContext exclusively.
        req.tenantContext = req.authContext;

        // DEPRECATED: req.user is a legacy alias carrying the raw JWT payload.
        // New code must use req.authContext for authenticated user context.
        req.user = decoded;

        // DEPRECATED: req.orgAccess is a legacy alias for inventory module compatibility.
        // New code must use req.authContext for org/user context.
        req.orgAccess = {
            orgId: decoded.orgId || null,
            userId: decoded.userId,
            role: normalizedRole,
        };

        next();
    } catch (err) {
        console.error('requireAuth verify error:', err);
        return res.status(401).json({
            success: false,
            message: 'Token 无效或已过期，请重新登录',
        });
    }
}
