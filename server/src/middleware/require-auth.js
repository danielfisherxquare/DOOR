/** Require Auth middleware — verifies the JWT and builds the canonical request context. */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import knex from '../db/knex.js';

export async function requireAuth(req, res, next) {
    if (req.authContext?.accountValidated) {
        return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: '未授权，请先登录',
        });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
        decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
        console.error('requireAuth verify error:', err);
        return res.status(401).json({
            success: false,
            message: 'Token 无效或已过期，请重新登录',
        });
    }

    try {
        const account = await knex('users')
            .where({ id: decoded.userId })
            .first('id', 'org_id', 'role', 'status', 'must_change_password', 'preferences');

        if (!account || account.status !== 'active') {
            return res.status(401).json({
                success: false,
                error: { code: 'ACCOUNT_UNAVAILABLE', message: '账号不存在或已停用' },
                message: '账号不存在或已停用，请重新登录',
            });
        }

        req.authContext = {
            userId: account.id,
            orgId: account.org_id || null,
            role: account.role,
            mustChangePassword: Boolean(account.must_change_password),
            strictSurfaceModules: Boolean(account.preferences?.strictSurfaceModules),
            accountValidated: true,
        };

        return next();
    } catch (err) {
        return next(err);
    }
}
