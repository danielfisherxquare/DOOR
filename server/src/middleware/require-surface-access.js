import { hasSurfaceAccess } from '../utils/capability-policy.js';

export function requireSurfaceAccess(surface) {
    return (req, res, next) => {
        const role = req.authContext?.role;

        if (!role) {
            return res.status(401).json({
                success: false,
                message: '未授权或上下文丢失',
            });
        }

        if (!hasSurfaceAccess(role, surface)) {
            return res.status(403).json({
                success: false,
                message: `当前角色无权访问 ${surface} 入口`,
            });
        }

        req.surface = surface;
        next();
    };
}
