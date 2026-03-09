/**
 * Rate Limiter — 登录防爆破中间件
 *
 * - /api/auth/login:    5 次/分钟/IP
 * - /api/auth/register: 3 次/小时/IP
 */
import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';
const resolveWindowMs = 60 * 1000;
const pickupWindowMs = 5 * 1000;

async function createSharedRateLimitStore() {
    const redisUrl = process.env.REDIS_URL || '';
    if (!redisUrl || isTest) return null;

    try {
        const [{ RedisStore }, { createClient }] = await Promise.all([
            import('rate-limit-redis'),
            import('redis'),
        ]);
        const client = createClient({ url: redisUrl });
        client.on('error', (err) => {
            console.error('[rate-limit] redis client error:', err.message);
        });
        if (!client.isOpen) {
            await client.connect();
        }
        return new RedisStore({
            sendCommand: (...args) => client.sendCommand(args),
        });
    } catch (err) {
        console.warn(`[rate-limit] Redis store unavailable, falling back to in-memory store: ${err.message}`);
        return null;
    }
}

const sharedRateLimitStore = await createSharedRateLimitStore();

function withOptionalStore(config) {
    return sharedRateLimitStore
        ? { ...config, store: sharedRateLimitStore }
        : config;
}

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

function resolveRequesterKey(req) {
    return req.authContext?.userId || req.headers['x-forwarded-for'] || req.ip || '127.0.0.1';
}

export const scanResolveLimiter = rateLimit(withOptionalStore({
    windowMs: resolveWindowMs,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '扫码请求过于频繁，请稍后再试' },
    keyGenerator: (req) => resolveRequesterKey(req),
    validate: { ip: false, xForwardedForHeader: false },
    skip: () => isTest,
}));

export const scanPickupLimiter = rateLimit(withOptionalStore({
    windowMs: pickupWindowMs,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '请勿重复提交领取操作' },
    keyGenerator: (req) => `${resolveRequesterKey(req)}:${String(req.body?.qrToken || '')}`,
    validate: { ip: false, xForwardedForHeader: false },
    skip: () => isTest,
}));
