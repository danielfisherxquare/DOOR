import { hasCapability } from '../utils/capability-policy.js';

export function requireCapability(scope, capability) {
    return (req, res, next) => {
        const role = req.authContext?.role;

        if (!role) {
            return res.status(401).json({
                success: false,
                message: '未授权或上下文丢失',
            });
        }

        if (!hasCapability(role, scope, capability)) {
            return res.status(403).json({
                success: false,
                message: `当前角色缺少 ${scope}:${capability} 权限`,
            });
        }

        next();
    };
}
