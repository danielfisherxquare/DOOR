/**
 * Require Permission 中间件 — 统一权限守卫
 *
 * 合并 requireRoles、requireSurfaceAccess、requireModuleAccess、requireCapability
 * 四个独立中间件为单一入口，减少重复链式调用。
 *
 * 使用方式:
 *   router.get('/admin/finance', requirePermission({
 *     surface: 'admin',
 *     roles: ['org_admin', 'super_admin'],
 *     module: { surface: 'admin', moduleId: 'finance' },
 *     capability: { scope: 'inventory', name: '3d_studio' },
 *   }), handler)
 *
 * 支持任意选项组合，所有选中的检查必须全部通过才放行。
 */
import knex from '../db/knex.js';
import {
    hasSurfaceAccess,
    hasCapability,
    hasAllModuleAccess,
    getRoleDefaultModules,
} from '../utils/capability-policy.js';

/**
 * 检查用户是否有特定模块的数据库访问权限
 * @param {string} userId
 * @param {string} moduleId — 完整模块ID（surface:module）
 * @returns {Promise<boolean>}
 */
async function checkUserModuleAccess(userId, moduleId) {
    const access = await knex('user_module_access')
        .where('user_id', userId)
        .where('module_id', moduleId)
        .where(function () {
            this.whereNull('expires_at')
                .orWhere('expires_at', '>', knex.fn.now());
        })
        .first();

    return Boolean(access);
}

function usesStrictSurfaceModules(req) {
    return Boolean(req.authContext?.strictSurfaceModules || req.user?.preferences?.strictSurfaceModules);
}

/**
 * 统一权限中间件
 * @param {Object} [options={}] — 权限检查配置
 * @param {string} [options.surface] — 入口层名称
 * @param {string[]} [options.roles] — 允许的角色列表
 * @param {{ surface: string, moduleId: string }} [options.module] — 模块访问检查
 * @param {{ scope: string, name: string }} [options.capability] — 能力策略检查
 * @returns {Function} Express 中间件
 */
export function requirePermission(options = {}) {
    return async (req, res, next) => {
        const { role, userId } = req.authContext || {};

        // 无 authContext 视为未认证
        if (!role || !userId) {
            return res.status(401).json({
                success: false,
                message: '未授权或上下文丢失',
            });
        }

        // 1. 入口层检查
        if (options.surface) {
            if (!hasSurfaceAccess(role, options.surface)) {
                return res.status(403).json({
                    success: false,
                    message: `当前角色无权访问 ${options.surface} 入口`,
                    code: 'SURFACE_DENIED',
                });
            }
        }

        // 2. 角色白名单检查
        if (options.roles) {
            if (!options.roles.includes(role)) {
                return res.status(403).json({
                    success: false,
                    message: `权限不足，需要以下角色之一: ${options.roles.join(', ')}`,
                    code: 'ROLE_DENIED',
                });
            }
        }

        // 3. 模块访问检查（含数据库查询）
        if (options.module) {
            const { surface, moduleId } = options.module;

            // 管理员拥有全部模块权限，直接放行
            if (!hasAllModuleAccess(role, { strictSurfaceModules: usesStrictSurfaceModules(req) })) {
                const fullModuleId = `${surface}:${moduleId}`;

                const roleDefaultModules = getRoleDefaultModules(role);
                if (roleDefaultModules !== 'all' && !roleDefaultModules.includes(fullModuleId)) {
                    try {
                        const hasAccess = await checkUserModuleAccess(
                            userId,
                            fullModuleId,
                        );

                        if (!hasAccess) {
                            return res.status(403).json({
                                success: false,
                                message: `无权访问该模块`,
                                code: 'MODULE_DENIED',
                            });
                        }
                    } catch (err) {
                        return next(err);
                    }
                }
            }
        }

        // 4. 能力策略检查
        if (options.capability) {
            const { scope, name } = options.capability;

            if (!hasCapability(role, scope, name)) {
                return res.status(403).json({
                    success: false,
                    message: `当前角色缺少 ${scope}:${name} 权限`,
                    code: 'CAPABILITY_DENIED',
                });
            }
        }

        next();
    };
}
