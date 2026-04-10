/**
 * Require Module Access 中间件 — 模块访问权限守卫
 *
 * 使用方式:
 *   router.get('/map', requireModuleAccess('app', 'map'), handler)
 */
import knex from '../db/knex.js';
import { hasAllModuleAccess, getDefaultModules } from '../utils/capability-policy.js';

/**
 * 检查用户是否有特定模块的访问权限
 * @param {string} userId - 用户ID
 * @param {string} moduleId - 模块ID（格式: surface:module）
 * @returns {Promise<boolean>}
 */
async function checkUserModuleAccess(userId, moduleId) {
    // 查询 user_module_access 表
    const access = await knex('user_module_access')
        .where('user_id', userId)
        .where('module_id', moduleId)
        .where(function() {
            this.whereNull('expires_at')
                .orWhere('expires_at', '>', knex.fn.now());
        })
        .first();

    return Boolean(access);
}

/**
 * 模块访问中间件
 * @param {string} surface - 入口层（app/ops/admin）
 * @param {string} moduleId - 模块ID（不含 surface 前缀）
 * @returns {Function} Express 中间件
 */
export function requireModuleAccess(surface, moduleId) {
    return async (req, res, next) => {
        const userId = req.authContext?.userId;
        const role = req.authContext?.role;

        if (!userId || !role) {
            return res.status(401).json({
                success: false,
                message: '未授权或上下文丢失'
            });
        }

        // super_admin / org_admin 跳过检查（拥有全部模块权限）
        if (hasAllModuleAccess(role)) {
            return next();
        }

        // 构建完整模块ID
        const fullModuleId = `${surface}:${moduleId}`;

        // 默认模块无需检查（所有用户都有）
        if (getDefaultModules().includes(fullModuleId)) {
            return next();
        }

        // 检查 user_module_access 表
        try {
            const hasAccess = await checkUserModuleAccess(userId, fullModuleId);
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    message: `无权访问模块: ${moduleId}`,
                    code: 'MODULE_ACCESS_DENIED'
                });
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * 批量检查用户模块访问权限
 * @param {string} userId - 用户ID
 * @param {string} role - 用户角色
 * @param {string[]} modules - 模块ID列表（不含 surface 前缀）
 * @param {string} surface - 入口层
 * @returns {Promise<Object>} - 返回 { moduleId: hasAccess } 映射
 */
export async function batchCheckModuleAccess(userId, role, modules, surface) {
    // 超级用户拥有全部权限
    if (hasAllModuleAccess(role)) {
        return modules.reduce((result, moduleId) => {
            result[`${surface}:${moduleId}`] = true;
            return result;
        }, {});
    }

    const defaultModules = getDefaultModules();
    const fullModuleIds = modules.map(m => `${surface}:${m}`);

    // 分离默认模块和需要检查的模块
    const toCheck = fullModuleIds.filter(id => !defaultModules.includes(id));

    // 默认模块全部允许
    const result = fullModuleIds.reduce((r, id) => {
        if (defaultModules.includes(id)) {
            r[id] = true;
        }
        return r;
    }, {});

    // 批量查询数据库
    if (toCheck.length > 0) {
        const accesses = await knex('user_module_access')
            .where('user_id', userId)
            .whereIn('module_id', toCheck)
            .where(function() {
                this.whereNull('expires_at')
                    .orWhere('expires_at', '>', knex.fn.now());
            });

        toCheck.forEach(moduleId => {
            result[moduleId] = accesses.some(a => a.module_id === moduleId);
        });
    }

    return result;
}

/**
 * 获取用户所有已授权的模块列表
 * @param {string} userId - 用户ID
 * @param {string} role - 用户角色
 * @returns {Promise<string[]>} - 模块ID列表
 */
export async function getUserAllModules(userId, role) {
    // 超级用户返回 null 表示全部权限
    if (hasAllModuleAccess(role)) {
        return null;
    }

    // 查询数据库获取已授权模块
    const accesses = await knex('user_module_access')
        .where('user_id', userId)
        .where(function() {
            this.whereNull('expires_at')
                .orWhere('expires_at', '>', knex.fn.now());
        });

    // 合并默认模块
    const defaultModules = getDefaultModules();
    const grantedModules = accesses.map(a => a.module_id);

    return uniq([...defaultModules, ...grantedModules]);
}

function uniq(values) {
    return [...new Set(values)];
}