/**
 * 统一错误处理中间件
 */
function normalizeDatabaseError(err) {
    if (!err?.code) return null;

    if (err.code === '42P01') {
        const isOrgRacePermissionMissing = String(err.message || '').includes('org_race_permissions');
        return {
            status: 500,
            message: isOrgRacePermissionMissing
                ? '数据库缺少 org_race_permissions 表，请先执行后端迁移 (npm run migrate)'
                : '数据库表结构不完整，请先执行后端迁移 (npm run migrate)',
            expose: true,
        };
    }

    if (err.code === '42703') {
        return {
            status: 500,
            message: '数据库字段缺失，请先执行后端迁移 (npm run migrate)',
            expose: true,
        };
    }

    if (err.code === '23505') {
        return {
            status: 409,
            message: '数据已存在或违反唯一约束',
            expose: true,
        };
    }

    if (err.code === '23503') {
        return {
            status: 400,
            message: '存在关联数据，当前操作被数据库外键约束拒绝',
            expose: true,
        };
    }

    if (err.code === '23514') {
        return {
            status: 400,
            message: '字段值不合法，未通过数据校验约束',
            expose: true,
        };
    }

    return null;
}

export function errorHandler(err, req, res, _next) {
    const normalizedDbError = normalizeDatabaseError(err);
    const status = err.status || err.statusCode || normalizedDbError?.status || 500;
    const message = err.expose
        ? err.message
        : (normalizedDbError?.expose ? normalizedDbError.message : '服务器内部错误');

    console.error(`[${req.id || '-'}] Error ${status}:`, err.message);
    if (status === 500) {
        console.error(err.stack);
    }

    res.status(status).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}
