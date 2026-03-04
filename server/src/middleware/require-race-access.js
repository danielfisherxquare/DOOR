/**
 * Require Race Access 中间件 — 赛事粒度权限守卫
 */
import knex from '../db/knex.js';

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

            // 查询目标赛事的归属
            const targetRace = await knex('races').where({ id: raceId }).first('org_id');
            if (!targetRace) {
                return res.status(404).json({ success: false, message: '目标赛事不存在' });
            }

            // 1. 机构管理员 (org_admin): 只要赛事属于本机构，就可以随意操作
            if (role === 'org_admin') {
                if (targetRace.org_id !== userOrgId) {
                    return res.status(403).json({ success: false, message: '无权操作其他机构的赛事' });
                }
                return next(); // org_admin 拥有本机构内全部权限
            }

            // 2. 普通员工 (race_editor / race_viewer): 必须有显式的分配记录
            const permission = await knex('user_race_permissions')
                .where({ user_id: userId, race_id: raceId })
                .first('access_level');

            if (!permission) {
                return res.status(403).json({ success: false, message: '您未被授予该赛事的操作权限' });
            }

            // 被分配的人，要进一步校验 access_level 和请求类型
            // viewer: 只允许 GET
            if (permission.access_level === 'viewer' && req.method !== 'GET') {
                return res.status(403).json({ success: false, message: '只读权限，不可执行写入、计算或删除等操作' });
            }

            // 认证完毕
            next();

        } catch (err) {
            console.error('[AUTH ERROR] requireRaceAccess:', err);
            return res.status(500).json({ success: false, message: '权限校验服务出错' });
        }
    };
}
