/**
 * Require Org Access 中间件 — 机构粒度权限守卫
 *
 * 用法：
 *   app.use('/api/inventory', requireAuth, requireOrgAccess(), inventoryRoutes);
 *   app.use('/api/inventory', requireAuth, requireOrgAccess('orgId'), inventoryRoutes);
 *   app.use('/api/inventory', requireAuth, requireOrgAccess((req) => req.body.orgId), inventoryRoutes);
 */
export function requireOrgAccess(resolveOrgId) {
    return async (req, res, next) => {
        try {
            const { userId, role, orgId: userOrgId } = req.authContext || {};

            if (!userId || !role) {
                return res.status(401).json({ success: false, message: '未授权' });
            }

            // 解析目标 orgId
            let orgId;
            if (typeof resolveOrgId === 'function') {
                orgId = await resolveOrgId(req);
            } else if (typeof resolveOrgId === 'string') {
                orgId = req.params[resolveOrgId] || req.body[resolveOrgId] || req.query[resolveOrgId];
            }

            // 默认使用当前用户的orgId
            if (!orgId) {
                orgId = userOrgId;
            }

            // 验证用户是否有权限访问该机构
            if (orgId !== userOrgId && role !== 'super_admin') {
                return res.status(403).json({ success: false, message: '无权访问该机构资源' });
            }

            req.orgAccess = { orgId, userId, role };
            next();

        } catch (err) {
            console.error('[AUTH ERROR] requireOrgAccess:', err);
            return res.status(500).json({ success: false, message: '权限校验服务出错' });
        }
    };
}
