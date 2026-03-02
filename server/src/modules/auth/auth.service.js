/**
 * Auth Service — 注册、登录、刷新 Token 的业务逻辑
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import * as authRepo from './auth.repository.js';
import { userMapper } from '../../db/mappers/auth.js';

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_DAYS = 30;

// ── 工具函数 ──────────────────────────────────────────

function generateAccessToken(user) {
    return jwt.sign(
        { userId: user.id, orgId: user.org_id, role: user.role },
        env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES },
    );
}

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
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
        role: 'owner',
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
        const err = new Error('用户名或密码错误');
        err.status = 401;
        err.expose = true;
        throw err;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        const err = new Error('用户名或密码错误');
        err.status = 401;
        err.expose = true;
        throw err;
    }

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
    const org = await authRepo.findOrgById(user.org_id);
    return {
        ...userMapper.toApiResponse(user),
        org: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    };
}

// ── 登出 ──────────────────────────────────────────────

export async function logout(refreshToken) {
    if (refreshToken) {
        await authRepo.deleteRefreshToken(hashToken(refreshToken));
    }
}
