/**
 * Auth Service — 注册、登录、刷新 Token、修改密码的业务逻辑
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import * as authRepo from './auth.repository.js';
import { userMapper } from '../../db/mappers/auth.js';

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

// ── 工具函数 ──────────────────────────────────────────

function generateAccessToken(user) {
    return jwt.sign(
        { userId: user.id, orgId: user.org_id || user.orgId, role: user.role },
        env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES },
    );
}

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** 根据 role 构建抽象权限列表 */
function buildPermissions(role) {
    switch (role) {
        case 'super_admin':
            return ['platform:manage', 'org:manage', 'race:manage', 'race:read', 'user:manage'];
        case 'org_admin':
            return ['org:manage', 'race:manage', 'race:read', 'user:manage'];
        case 'race_editor':
            return ['race:manage', 'race:read'];
        case 'race_viewer':
            return ['race:read'];
        default:
            return [];
    }
}

// ── 注册 ──────────────────────────────────────────────

export async function register({ username, email, password, orgName }) {
    // 生成 slug
    const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-|-$/g, '')
        || `org-${Date.now()}`;

    // 创建组织
    const org = await authRepo.createOrg(orgName, slug);

    // 创建管理员用户
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await authRepo.createUser({
        orgId: org.id,
        username,
        email,
        passwordHash,
        role: 'org_admin',
    });

    // 生成 token 对
    const accessToken = generateAccessToken(user);
    const rawRefresh = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await authRepo.createRefreshToken(user.id, hashToken(rawRefresh), expiresAt);

    return {
        accessToken,
        refreshToken: rawRefresh,
        user: userMapper.toApiResponse(user),
    };
}

// ── 登录 ──────────────────────────────────────────────

export async function login({ login, password }) {
    const user = await authRepo.findUserByLogin(login);
    if (!user) {
        // 不存在的用户也做延迟，防止用户名枚举
        await sleep(1000);
        const err = new Error('用户名或密码错误');
        err.status = 401;
        err.expose = true;
        throw err;
    }

    // 1. 检查账户是否被禁用
    if (user.status === 'disabled') {
        const err = new Error('账户已被禁用，请联系管理员');
        err.status = 403;
        err.expose = true;
        throw err;
    }

    // 2. 检查账户是否被锁定
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const err = new Error('账户已被临时锁定，请稍后重试');
        err.status = 429;
        err.expose = true;
        throw err;
    }

    // 3. 密码校验
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        // 递增失败计数
        await authRepo.incrementFailedAttempts(user.id);
        const currentAttempts = (user.failed_login_attempts || 0) + 1;
        if (currentAttempts >= MAX_FAILED_ATTEMPTS) {
            await authRepo.lockUser(user.id, LOCK_DURATION_MINUTES);
            console.warn(`[AUTH] 账户 ${user.username} 已因连续 ${currentAttempts} 次错误密码被锁定 ${LOCK_DURATION_MINUTES} 分钟`);
        }
        // 慢响应
        await sleep(1000);
        const err = new Error('用户名或密码错误');
        err.status = 401;
        err.expose = true;
        throw err;
    }

    // 4. 登录成功，重置失败计数
    await authRepo.resetFailedAttempts(user.id);

    const accessToken = generateAccessToken(user);
    const rawRefresh = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await authRepo.createRefreshToken(user.id, hashToken(rawRefresh), expiresAt);

    return {
        accessToken,
        refreshToken: rawRefresh,
        user: userMapper.toApiResponse(user),
        mustChangePassword: user.must_change_password || false,
    };
}

// ── 刷新 Token ────────────────────────────────────────

export async function refresh(refreshToken) {
    const tokenHash = hashToken(refreshToken);
    const stored = await authRepo.findRefreshToken(tokenHash);
    if (!stored) {
        const err = new Error('刷新 Token 无效或已过期');
        err.status = 401;
        err.expose = true;
        throw err;
    }

    // 旧 token 销毁
    await authRepo.deleteRefreshToken(tokenHash);

    const user = await authRepo.findUserById(stored.user_id);
    if (!user) {
        const err = new Error('用户不存在');
        err.status = 401;
        err.expose = true;
        throw err;
    }

    // 账户被禁用时也阻止 refresh
    if (user.status === 'disabled') {
        const err = new Error('账户已被禁用');
        err.status = 403;
        err.expose = true;
        throw err;
    }

    // 发行新 token 对
    const accessToken = generateAccessToken(user);
    const rawRefresh = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await authRepo.createRefreshToken(user.id, hashToken(rawRefresh), expiresAt);

    return { accessToken, refreshToken: rawRefresh };
}

// ── 获取当前用户 ──────────────────────────────────────

export async function getMe(userId) {
    const user = await authRepo.findUserById(userId);
    if (!user) {
        const err = new Error('用户不存在');
        err.status = 404;
        err.expose = true;
        throw err;
    }

    const org = user.org_id ? await authRepo.findOrgById(user.org_id) : null;
    const racePermissions = await authRepo.findRacePermissions(userId);

    return {
        ...userMapper.toApiResponse(user),
        status: user.status,
        mustChangePassword: user.must_change_password || false,
        org: org ? { id: org.id, name: org.name, slug: org.slug } : null,
        assignedRaceIds: racePermissions.map(p => p.race_id),
        racePermissions: racePermissions.map(p => ({
            raceId: p.race_id,
            accessLevel: p.access_level,
        })),
        permissions: buildPermissions(user.role),
    };
}

// ── 登出 ──────────────────────────────────────────────

export async function logout(refreshToken) {
    if (refreshToken) {
        await authRepo.deleteRefreshToken(hashToken(refreshToken));
    }
}

// ── 修改密码（用户自助） ─────────────────────────────

export async function changePassword(userId, { oldPassword, newPassword }) {
    const user = await authRepo.findUserById(userId);
    if (!user) {
        const err = new Error('用户不存在');
        err.status = 404;
        err.expose = true;
        throw err;
    }

    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
        const err = new Error('旧密码错误');
        err.status = 400;
        err.expose = true;
        throw err;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await authRepo.updateUser(userId, {
        password_hash: newHash,
        must_change_password: false,
    });

    return { message: '密码修改成功' };
}

// ── 重置密码（管理员操作） ──────────────────────────

export async function setPassword(targetUserId, newPassword, operatorContext) {
    const targetUser = await authRepo.findUserById(targetUserId);
    if (!targetUser) {
        const err = new Error('目标用户不存在');
        err.status = 404;
        err.expose = true;
        throw err;
    }

    // 权限检查: org_admin 只能重置本机构用户
    if (operatorContext.role === 'org_admin' && targetUser.org_id !== operatorContext.orgId) {
        const err = new Error('无权操作其他机构用户');
        err.status = 403;
        err.expose = true;
        throw err;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await authRepo.updateUser(targetUserId, {
        password_hash: newHash,
        must_change_password: true, // 强制下次登录时改密
        failed_login_attempts: 0,
        locked_until: null,
    });

    return { message: '密码重置成功，用户下次登录时需修改密码' };
}

export async function assignRaceRole(operatorContext, targetUserId, raceId, role) {
    const targetUser = await authRepo.findUserById(targetUserId);
    if (!targetUser) {
        const err = new Error('目标用户不存在');
        err.status = 404;
        err.expose = true;
        throw err;
    }

    if (operatorContext.role === 'org_admin' && targetUser.org_id !== operatorContext.orgId) {
        const err = new Error('无权操作其他机构用户');
        err.status = 403;
        err.expose = true;
        throw err;
    }

    // TODO: 可以再验证 raceId 是否属于该机构，但这主要依赖数据库约束或稍后的查表，暂假定由调用方 / 管理员知晓

    let accessLevel = null;
    if (role) {
        const roleToAccessLevel = {
            race_editor: 'editor',
            race_viewer: 'viewer',
            editor: 'editor',
            viewer: 'viewer',
        };
        accessLevel = roleToAccessLevel[role] || null;
        if (!accessLevel) {
            const err = new Error(`无效赛事权限角色: ${role}`);
            err.status = 400;
            err.expose = true;
            throw err;
        }
    }

    if (accessLevel) {
        await authRepo.setRacePermission(targetUserId, targetUser.org_id, raceId, accessLevel, operatorContext.userId);
        return { message: `已授予赛事访问权限: ${accessLevel}` };
    } else {
        await authRepo.removeRacePermission(targetUserId, raceId);
        return { message: '已移除赛事访问权限' };
    }
}
