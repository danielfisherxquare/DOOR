import { randomUUID } from 'node:crypto';

/**
 * 请求追踪 ID 中间件
 * 为每个请求注入唯一 ID，便于日志追踪
 */
export function requestId(req, _res, next) {
    req.id = req.headers['x-request-id'] || randomUUID();
    next();
}
