/**
 * Auth Service — 注册、登录、刷新 Token、修改密码的业务逻辑
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import knex from '../../db/knex.js';
import * as authRepo from './auth.repository.js';
import { userMapper } from '../../db/mappers/auth.js';
import {
    listEffectiveRacePermissionsForUser,
    listVisibleRacesForOrg,
} from '../races/race-access.service.js';
import { buildAuthzProfile } from '../../utils/capability-policy.js';
import { getUserAllModules } from '../../middleware/require-module-access.js';

const ACCESS_TOKEN_EXPIRES = '1h';
const REFRESH_TOKEN_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

// ── 工具函数 ──────────────────────────────────────────

function generateAccessToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            orgId: user.org_id || user.orgId,
            role: user.role,
            preferences: user.preferences || {},
        },
        env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES }
    );
}

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildAuthProfile(user) {
    const authzProfile = buildAuthzProfile(user.role);
    const org = user.org_id ? await authRepo.findOrgById(user.org_id) : null;
    const racePermissions = await listEffectiveRacePermissionsForUser({
        userId: user.id,
        role: user.role,
        orgId: user.org_id || null,
    });
    const raceIds = racePermissions
        .map((permission) => Number(permission.raceId))
        .filter((id) => Number.isFinite(id));
    const raceRows =
        raceIds.length > 0 ? await knex('races').whereIn('id', raceIds).select('id', 'name') : [];
    const raceNameMap = new Map(raceRows.map((row) => [Number(row.id), row.name]));

    // 获取用户模块访问权限
    const strictSurfaceModules = Boolean(user.preferences?.strictSurfaceModules);
    const moduleAccess = await getUserAllModules(user.id, user.role, { strictSurfaceModules });

    return {
        ...userMapper.toApiResponse(user),
        status: user.status,
        mustChangePassword: user.must_change_password || false,
        org: org ? { id: org.id, name: org.name, slug: org.slug } : null,
        ...authzProfile,
        assignedRaceIds: racePermissions.map((permission) => permission.raceId),
        racePermissions: racePermissions.map((permission) => ({
            raceId: permission.raceId,
            raceName: raceNameMap.get(Number(permission.raceId)) || null,
            accessLevel: permission.accessLevel,
            source: permission.source || null,
            inheritedAccessLevel: permission.inheritedAccessLevel || null,
            explicitAccessLevel: permission.explicitAccessLevel || null,
        })),
        moduleAccess, // 添加模块访问权限
    };
}

// ── 注册 ──────────────────────────────────────────────

export async function register({ username, email, password, orgName }) {
    // 生成 slug
    const slug =
        orgName
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
            .replace(/^-|-$/g, '') || `org-${Date.now()}`;

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

    const authProfile = await buildAuthProfile(user);

    return {
        accessToken,
        refreshToken: rawRefresh,
        user: authProfile,
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
            console.warn(
                `[AUTH] 账户 ${user.username} 已因连续 ${currentAttempts} 次错误密码被锁定 ${LOCK_DURATION_MINUTES} 分钟`
            );
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

    const authProfile = await buildAuthProfile(user);

    return {
        accessToken,
        refreshToken: rawRefresh,
        user: authProfile,
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

    const authProfile = await buildAuthProfile(user);

    return {
        accessToken,
        refreshToken: rawRefresh,
        user: authProfile,
    };
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

    return buildAuthProfile(user);
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

    if (!targetUser.org_id) {
        const err = new Error('目标用户未绑定机构，无法配置赛事权限');
        err.status = 400;
        err.expose = true;
        throw err;
    }

    const numericRaceId = Number(raceId);
    if (!Number.isFinite(numericRaceId) || numericRaceId <= 0) {
        const err = new Error('无效 raceId');
        err.status = 400;
        err.expose = true;
        throw err;
    }

    const visibleRaces = await listVisibleRacesForOrg(targetUser.org_id);
    const raceInfo = visibleRaces.find((item) => Number(item.id) === numericRaceId);
    if (!raceInfo) {
        const err = new Error(`赛事 ${numericRaceId} 不在目标用户所属机构的可见范围内`);
        err.status = 403;
        err.expose = true;
        throw err;
    }

    let accessLevel = null;
    if (role) {
        const roleToAccessLevel = {
            race_admin: 'editor',
            user: 'viewer',
            race_editor: 'editor',
            race_viewer: 'viewer',
            editor: 'editor',
            viewer: 'viewer',
        };
        accessLevel = roleToAccessLevel[role] || null;
        if (!accessLevel) {
            const err = new Error(`不支持的赛事权限角色: ${role}`);
            err.status = 400;
            err.expose = true;
            throw err;
        }
        if (raceInfo.orgAccessLevel === 'viewer' && accessLevel === 'editor') {
            const err = new Error(
                `赛事 ${numericRaceId} 对目标机构仅开放 viewer，成员不可配置为 editor`
            );
            err.status = 400;
            err.expose = true;
            throw err;
        }
    }

    if (accessLevel) {
        await authRepo.setRacePermission(
            targetUserId,
            targetUser.org_id,
            numericRaceId,
            accessLevel,
            operatorContext.userId
        );
        return { message: `赛事权限已更新为: ${accessLevel}` };
    }

    await authRepo.removeRacePermission(targetUserId, numericRaceId);
    return { message: '赛事权限已移除' };
}

// ── 忘记密码 / 重置密码 ─────────────────────────────

const RESET_TOKEN_EXPIRES_HOURS = 1;

export async function forgotPassword(email) {
    const user = await authRepo.findUserByLogin(email);
    if (!user) {
        // 不暴露用户是否存在的信息，但仍然返回成功
        return { message: '如果该邮箱已注册，您将收到密码重置邮件' };
    }

    // 删除该用户之前的所有重置令牌
    await authRepo.deleteUserPasswordResetTokens(user.id);

    // 生成新的重置令牌
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_HOURS * 60 * 60 * 1000);

    await authRepo.createPasswordResetToken(user.id, tokenHash, expiresAt);

    // 在开发环境打印令牌，生产环境应该发送邮件
    if (env.NODE_ENV !== 'production') {
        console.log(`[AUTH] 密码重置令牌(开发模式): ${rawToken}`);
        console.log(`[AUTH] 重置链接: ${env.FRONTEND_URL}/reset-password/${rawToken}`);
    }

    // TODO: 生产环境发送邮件
    // await sendPasswordResetEmail(user.email, rawToken);

    return { message: '如果该邮箱已注册，您将收到密码重置邮件' };
}

export async function resetPassword(token, newPassword) {
    const tokenHash = hashToken(token);
    const resetToken = await authRepo.findPasswordResetToken(tokenHash);

    if (!resetToken) {
        const err = new Error('重置令牌无效或已过期');
        err.status = 400;
        err.expose = true;
        throw err;
    }

    const user = await authRepo.findUserById(resetToken.user_id);
    if (!user) {
        const err = new Error('用户不存在');
        err.status = 404;
        err.expose = true;
        throw err;
    }

    // 更新密码
    const newHash = await bcrypt.hash(newPassword, 10);
    await authRepo.updateUser(user.id, {
        password_hash: newHash,
        must_change_password: false,
        failed_login_attempts: 0,
        locked_until: null,
    });

    // 删除已使用的重置令牌
    await authRepo.deletePasswordResetToken(tokenHash);

    // 可选：让该用户的所有 refresh token 失效
    // await authRepo.deleteUserRefreshTokens(user.id);

    return { message: '密码重置成功，请使用新密码登录' };
}

// ── 用户偏好 ─────────────────────────────────────────────

export async function getPreferences(userId) {
    const user = await authRepo.findUserById(userId);
    if (!user) {
        const err = new Error('用户不存在');
        err.status = 404;
        err.expose = true;
        throw err;
    }
    return user.preferences || {};
}

export async function updatePreferences(userId, updates) {
    const user = await authRepo.findUserById(userId);
    if (!user) {
        const err = new Error('用户不存在');
        err.status = 404;
        err.expose = true;
        throw err;
    }

    const currentPrefs = user.preferences || {};
    const newPrefs = { ...currentPrefs };

    // 只更新允许的字段
    if (updates.lastOrgId !== undefined) {
        newPrefs.lastOrgId = updates.lastOrgId || null;
    }
    if (updates.lastRaceId !== undefined) {
        newPrefs.lastRaceId = updates.lastRaceId || null;
    }

    await authRepo.updateUser(userId, { preferences: newPrefs });
    return newPrefs;
}
