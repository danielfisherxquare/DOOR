import knex from '../db/knex.js';

export function operationLog({ module, businessType, titleFactory }) {
  return (req, res, next) => {
    const start = Date.now();

    // Store original res.json
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      const duration = Date.now() - start;

      // Build log entry
      const logEntry = {
        user_id: req.authContext?.userId || null,
        org_id: req.authContext?.orgId || null,
        module,
        business_type: businessType,
        title: typeof titleFactory === 'function' ? titleFactory(req, body) : titleFactory,
        operation_ip: req.ip || req.socket?.remoteAddress || null,
        request_method: req.method,
        request_url: req.originalUrl,
        request_params: sanitizeParams(req),
        response_code: res.statusCode,
        error_msg:
          body?.success === false ? body.message || JSON.stringify(body) : null,
        duration_ms: duration,
        status: res.statusCode >= 400 ? 'fail' : 'success',
      };

      // Fire-and-forget: don't block response
      knex('operation_log')
        .insert(logEntry)
        .catch((err) => {
          console.error('[OperationLog] Failed to write:', err.message);
        });

      return originalJson(body);
    };

    next();
  };
}

function sanitizeParams(req) {
  const params = {
    query: req.query,
    body: req.body,
  };
  // Remove sensitive fields
  if (params.body?.password) params.body.password = '***';
  if (params.body?.newPassword) params.body.newPassword = '***';
  if (params.body?.confirmPassword) params.body.confirmPassword = '***';
  if (params.body?.oldPassword) params.body.oldPassword = '***';
  return params;
}
