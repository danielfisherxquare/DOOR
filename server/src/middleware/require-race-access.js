/**
 * Require Race Access 中间件 — 赛事粒度权限守卫
 */
import { resolveRaceAccess } from '../modules/races/race-access.service.js';

export function requireRaceAccess(resolveRaceId) {
    return async (req, res, next) => {
        try {
            const { userId, role, orgId: userOrgId } = req.authContext || {};

            if (!userId || !role) {
                return res.status(401).json({ success: false, message: '未授权' });
            }

            // 超级管理员畅通无阻
            if (role === 'super_admin') {
                return next();
            }

            // 解析目标 raceId
            let raceId;
            if (typeof resolveRaceId === 'function') {
                raceId = resolveRaceId(req);
            } else if (typeof resolveRaceId === 'string') {
                raceId = req.params[resolveRaceId] || req.body[resolveRaceId] || req.query[resolveRaceId];
            }

            if (!raceId) {
                return res.status(400).json({ success: false, message: '无法确立赛事操作边界 (缺少 race_id)' });
            }

            const access = await resolveRaceAccess(
                { userId, role, orgId: userOrgId },
                raceId,
                req.method,
            );
            req.raceAccess = access;
            next();

        } catch (err) {
            if (err?.status) {
                return res.status(err.status).json({
                    success: false,
                    message: err.expose ? err.message : '权限校验失败',
                });
            }
            console.error('[AUTH ERROR] requireRaceAccess:', err);
            return res.status(500).json({ success: false, message: '权限校验服务出错' });
        }
    };
}
