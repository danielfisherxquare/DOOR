const SURFACES = ['public', 'app', 'ops', 'admin'];
const SCOPES = ['self', 'race', 'org', 'platform', 'inventory'];

// 默认模块访问权限（所有用户都有）
const DEFAULT_MODULES = ['app:home', 'app:profile'];

function uniq(values) {
    return [...new Set(values)];
}

/**
 * 四层权限模型:
 * - super_admin: 平台最高权限，跨组织管理
 * - org_admin: 组织最高权限，管理本组织所有事务
 * - race_admin: 赛事管理员，可执行赛事操作
 * - user: 普通用户，最小权限，需管理员授权模块访问
 */
const ROLE_POLICY = {
    super_admin: {
        defaultSurface: 'admin',
        surfaceAccess: ['public', 'app', 'ops', 'admin'],
        scopedCapabilities: {
            self: ['view', 'operate'],
            race: ['view', 'operate', 'approve', 'configure', 'govern', 'export_plaintext'],
            org: ['view', 'operate', 'approve', 'configure', 'govern', 'export_plaintext'],
            platform: ['view', 'operate', 'approve', 'configure', 'govern', 'export_plaintext', 'manage_system'],
            inventory: ['3d_studio'],
        },
        permissions: ['platform:manage', 'org:manage', 'race:manage', 'race:read', 'user:manage'],
        moduleAccess: 'all', // 拥有全部模块访问权限
    },
    org_admin: {
        defaultSurface: 'admin',
        surfaceAccess: ['public', 'app', 'ops', 'admin'],
        scopedCapabilities: {
            self: ['view', 'operate'],
            race: ['view', 'operate', 'approve', 'configure', 'export_plaintext'],
            org: ['view', 'operate', 'approve', 'configure', 'govern', 'export_plaintext'],
            platform: [],
            inventory: ['3d_studio'],
        },
        permissions: ['org:manage', 'race:manage', 'race:read', 'user:manage', 'finance:approve'],
        moduleAccess: 'all', // 拥有全部模块访问权限
    },
    race_admin: {
        defaultSurface: 'ops',
        surfaceAccess: ['public', 'app', 'ops'],
        scopedCapabilities: {
            self: ['view', 'operate'],
            race: ['view', 'operate'],
            org: [],
            platform: [],
            inventory: ['3d_studio'],
        },
        permissions: ['race:manage', 'race:read'],
        moduleAccess: ['app:home', 'app:profile', 'app:map', 'ops:home', 'ops:bib-pickup', 'ops:scan'],
    },
    user: {
        defaultSurface: 'app',
        surfaceAccess: ['public', 'app'],
        scopedCapabilities: {
            self: ['view', 'operate'],
            race: ['view'],
            org: [],
            platform: [],
            inventory: [],
        },
        permissions: ['race:read'],
        moduleAccess: DEFAULT_MODULES, // 最小权限，只有默认模块
    },
    default: {
        defaultSurface: 'app',
        surfaceAccess: ['public', 'app'],
        scopedCapabilities: {
            self: ['view', 'operate'],
            race: [],
            org: [],
            platform: [],
            inventory: [],
        },
        permissions: [],
        moduleAccess: DEFAULT_MODULES,
    },
};

function getRolePolicy(role) {
    return ROLE_POLICY[role] || ROLE_POLICY.default;
}

export function buildPermissions(role) {
    return [...getRolePolicy(role).permissions];
}

export function buildSurfaceAccess(role) {
    const access = getRolePolicy(role).surfaceAccess || [];
    return SURFACES.reduce((result, surface) => {
        result[surface] = access.includes(surface);
        return result;
    }, {});
}

export function getDefaultSurface(role) {
    return getRolePolicy(role).defaultSurface || 'app';
}

export function buildScopedCapabilities(role) {
    const scoped = getRolePolicy(role).scopedCapabilities || {};
    return SCOPES.reduce((result, scope) => {
        result[scope] = uniq(scoped[scope] || []);
        return result;
    }, {});
}

export function hasSurfaceAccess(role, surface) {
    return Boolean(buildSurfaceAccess(role)[surface]);
}

export function hasCapability(role, scope, capability) {
    if (!scope || !capability) return false;
    const scoped = buildScopedCapabilities(role);
    return (scoped[scope] || []).includes(capability);
}

export function buildAuthzProfile(role) {
    return {
        permissions: buildPermissions(role),
        defaultSurface: getDefaultSurface(role),
        surfaceAccess: buildSurfaceAccess(role),
        scopedCapabilities: buildScopedCapabilities(role),
        moduleAccess: getRoleModuleAccess(role),
    };
}

/**
 * 获取角色默认模块访问权限
 * @param {string} role - 用户角色
 * @returns {string[]|'all'} - 模块ID列表或 'all'（表示全部模块）
 */
export function getRoleModuleAccess(role) {
    const policy = getRolePolicy(role);
    return policy.moduleAccess || DEFAULT_MODULES;
}

/**
 * 判断角色是否有全部模块访问权限
 * @param {string} role - 用户角色
 * @returns {boolean}
 */
export function hasAllModuleAccess(role, options = {}) {
    if (role === 'super_admin') return true;
    if (role === 'org_admin' && options.strictSurfaceModules) return false;
    return getRoleModuleAccess(role) === 'all';
}

/**
 * 获取默认模块列表
 * @returns {string[]}
 */
export function getDefaultModules() {
    return DEFAULT_MODULES;
}

export function getRoleDefaultModules(role) {
    const moduleAccess = getRoleModuleAccess(role);
    if (moduleAccess === 'all') return 'all';
    return uniq([...DEFAULT_MODULES, ...moduleAccess]);
}
