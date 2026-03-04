/**
 * Require Org Scope 中间件 — 机构数据边界守卫
 * 确保普通用户无法越界操作其他机构的资源
 */

export function requireOrgScope(resolveTargetOrgId) {
    return (req, res, next) => {
        const { role, orgId: userOrgId } = req.authContext || {};

        if (!role) {
            return res.status(401).json({ success: false, message: '未授权' });
        }

        // 超级管理员无视机构边界
        if (role === 'super_admin') {
            return next();
        }

        // 获取当前请求试图操作的目标机构 ID
        let targetOrgId;
        if (typeof resolveTargetOrgId === 'function') {
            targetOrgId = resolveTargetOrgId(req);
        } else if (typeof resolveTargetOrgId === 'string') {
            targetOrgId = req.params[resolveTargetOrgId] || req.body[resolveTargetOrgId] || req.query[resolveTargetOrgId];
        }

        if (!targetOrgId) {
            // 安全失败: 如果路由需要校验却未能解析出目标资源所在的机构，直接拒绝
            return res.status(400).json({ success: false, message: '缺少机构上下文，无法验证操作边界' });
        }

        if (userOrgId !== targetOrgId) {
            return res.status(403).json({ success: false, message: '操作被拦截：尝试越界访问其他机构资源' });
        }

        next();
    };
}
