/**
 * Rate Limiter — 登录防爆破中间件
 *
 * - /api/auth/login:    5 次/分钟/IP
 * - /api/auth/register: 3 次/小时/IP
 */
import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

export const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '请求过于频繁，请稍后重试' },
    keyGenerator: (req) => req.headers['x-forwarded-for'] || '127.0.0.1',
    validate: { ip: false, xForwardedForHeader: false },
    skip: () => isTest,
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '注册请求过于频繁，请稍后重试' },
    keyGenerator: (req) => req.headers['x-forwarded-for'] || '127.0.0.1',
    validate: { ip: false, xForwardedForHeader: false },
    skip: () => isTest,
});
