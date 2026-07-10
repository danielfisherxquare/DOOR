import { randomUUID } from 'node:crypto';

/**
 * 请求追踪 ID 中间件
 * 为每个请求注入唯一 ID，便于日志追踪
 */
export function requestId(req, res, next) {
    const candidate = req.headers['x-request-id'];
    const safeCandidate = typeof candidate === 'string'
        && candidate.length <= 128
        && /^[A-Za-z0-9._:-]+$/.test(candidate)
        ? candidate
        : null;

    req.id = safeCandidate || randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
}
