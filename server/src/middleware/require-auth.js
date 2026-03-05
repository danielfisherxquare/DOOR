/**
 * Require Auth 中间件 — 认证与角色兼容映射核心
 * 替代原 tenantContext 成为统一门禁
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// 兼容旧版 token，过渡期平滑支持
const ROLE_MIGRATION_MAP = {
    owner: 'org_admin',
    admin: 'org_admin',
    member: 'race_editor' // 旧系统 member 目前先映射为更高权限的 editor，以防阻断现有业务
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
        const normalizedRole = ROLE_MIGRATION_MAP[decoded.role] || decoded.role;

        req.authContext = {
            userId: decoded.userId,
            orgId: decoded.orgId || null,
            role: normalizedRole,
        };

        // 兼容遗留代码 (原本的 tenantContext 设置)
        req.tenantContext = req.authContext;
        req.user = decoded;

        next();
    } catch (err) {
        console.error('requireAuth verify error:', err);
        return res.status(401).json({
            success: false,
            message: 'Token 无效或已过期，请重新登录',
        });
    }
}
