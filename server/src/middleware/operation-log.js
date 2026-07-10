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

const SENSITIVE_KEY_PATTERN =
  /(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key|encryption[_-]?key)/i;

function sanitizeValue(value, key, depth, seen) {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '***';
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  }
  if (typeof value !== 'object') return String(value);
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  if (depth >= 6) return '[max depth]';
  if (seen.has(value)) return '[circular]';

  seen.add(value);
  let sanitized;
  if (Array.isArray(value)) {
    sanitized = value.slice(0, 50).map((item) => sanitizeValue(item, '', depth + 1, seen));
  } else {
    sanitized = Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([childKey, childValue]) => [
          childKey,
          sanitizeValue(childValue, childKey, depth + 1, seen),
        ])
    );
  }
  seen.delete(value);
  return sanitized;
}

export function sanitizeParams(req) {
  const seen = new WeakSet();
  return {
    query: sanitizeValue(req.query || {}, 'query', 0, seen),
    body: sanitizeValue(req.body || {}, 'body', 0, seen),
  };
}
