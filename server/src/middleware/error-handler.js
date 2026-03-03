/**
 * 统一错误处理中间件
 */
export function errorHandler(err, req, res, _next) {
    const status = err.status || err.statusCode || 500;
    const message = err.expose ? err.message : '服务器内部错误';

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

