/**
 * Require Roles 中间件 — 角色白名单守卫
 */

export function requireRoles(...allowedRoles) {
    return (req, res, next) => {
        const { role } = req.authContext || {};

        if (!role) {
            return res.status(401).json({
                success: false,
                message: '未授权或上下文丢失'
            });
        }

        if (!allowedRoles.includes(role)) {
            return res.status(403).json({
                success: false,
                message: `权限不足，需要以下角色之一: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
}
