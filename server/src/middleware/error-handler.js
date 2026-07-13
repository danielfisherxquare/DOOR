/**
 * 统一错误处理中间件
 */
function normalizeDatabaseError(err) {
    if (!err?.code) return null;

    if (err.code === '42P01') {
        const isOrgRacePermissionMissing = String(err.message || '').includes('org_race_permissions');
        return {
            status: 500,
            code: 'DATABASE_SCHEMA_INCOMPLETE',
            message: isOrgRacePermissionMissing
                ? '数据库缺少 org_race_permissions 表，请先执行后端迁移 (npm run migrate)'
                : '数据库表结构不完整，请先执行后端迁移 (npm run migrate)',
            expose: true,
        };
    }

    if (err.code === '42703') {
        return {
            status: 500,
            code: 'DATABASE_SCHEMA_INCOMPLETE',
            message: '数据库字段缺失，请先执行后端迁移 (npm run migrate)',
            expose: true,
        };
    }

    if (err.code === '23505') {
        return {
            status: 409,
            code: 'CONFLICT',
            message: '数据已存在或违反唯一约束',
            expose: true,
        };
    }

    if (err.code === '23503') {
        return {
            status: 400,
            code: 'FOREIGN_KEY_CONFLICT',
            message: '存在关联数据，当前操作被数据库外键约束拒绝',
            expose: true,
        };
    }

    if (err.code === '23514') {
        return {
            status: 400,
            code: 'VALIDATION_FAILED',
            message: '字段值不合法，未通过数据校验约束',
            expose: true,
        };
    }

    return null;
}

const STATUS_ERROR_CODES = {
    400: 'BAD_REQUEST',
    401: 'AUTHENTICATION_REQUIRED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_FAILED',
    429: 'RATE_LIMITED',
};

function normalizeStatus(err, normalizedDbError) {
    const candidate = Number(err.status || err.statusCode || normalizedDbError?.status || 500);
    return Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
}

function normalizeErrorCode(err, status, normalizedDbError) {
    if (normalizedDbError?.code) return normalizedDbError.code;
    if (status < 500 && typeof err.publicCode === 'string' && /^[A-Z][A-Z0-9_]+$/.test(err.publicCode)) {
        return err.publicCode;
    }
    if (status < 500 && typeof err.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(err.code)) {
        return err.code;
    }
    return STATUS_ERROR_CODES[status] || 'INTERNAL_SERVER_ERROR';
}

export function errorHandler(err, req, res, _next) {
    const normalizedDbError = normalizeDatabaseError(err);
    const status = normalizeStatus(err, normalizedDbError);
    const code = normalizeErrorCode(err, status, normalizedDbError);
    const message = err.expose
        ? err.message
        : (normalizedDbError?.expose ? normalizedDbError.message : '服务器内部错误');
    const details = err.expose ? (err.details ?? err.data) : undefined;
    const requestId = req.id || null;

    console.error(`[${req.id || '-'}] Error ${status}:`, err.message, `| ${req.method} ${req.originalUrl}`, req.params ? `params=${JSON.stringify(req.params)}` : '');
    if (status === 500) {
        console.error(err.stack);
    }

    const error = {
        code,
        message,
        ...(details !== undefined && { details }),
        ...(requestId && { requestId }),
    };

    res.status(status).json({
        success: false,
        error,
        message,
        ...(err.expose && err.publicCode ? { code: err.publicCode } : {}),
        ...(err.expose && err.data !== undefined ? { data: err.data } : {}),
        ...(err.expose && err.publicCode && requestId ? { requestId } : {}),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}
