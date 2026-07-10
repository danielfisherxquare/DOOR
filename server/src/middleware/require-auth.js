/** Require Auth middleware — verifies the JWT and builds the canonical request context. */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

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

        req.authContext = {
            userId: decoded.userId,
            orgId: decoded.orgId || null,
            role: decoded.role,
            strictSurfaceModules: Boolean(decoded.preferences?.strictSurfaceModules),
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
