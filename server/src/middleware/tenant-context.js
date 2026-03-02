/**
 * Tenant Context 中间件 — 多租户隔离核心
 * 从 JWT 中解析 orgId / userId / role 并注入 req.tenantContext
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function tenantContext(req, res, next) {
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
        req.tenantContext = {
            userId: decoded.userId,
            orgId: decoded.orgId,
            role: decoded.role,
        };
        // 兼容旧中间件的 req.user
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({
            success: false,
            message: 'Token 无效或已过期，请重新登录',
        });
    }
}
