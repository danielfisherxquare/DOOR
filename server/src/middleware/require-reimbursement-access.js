/**
 * Unified Reimbursement Access Middleware
 * 发票报销权限中间件
 *
 * 权限层级：
 * - owner: 数据所有者（用户只能访问自己创建的数据）
 * - org_member: 机构成员（查看本机构数据）
 * - org_admin: 机构管理员（管理本机构数据）
 * - super_admin: 超级管理员（查看和管理所有数据）
 *
 * Usage:
 *   // Role-only checks
 *   requireReimbursementAccess({ accessLevel: 'super_admin' })
 *   requireReimbursementAccess({ accessLevel: 'org_admin' })
 *
 *   // Resource ownership checks
 *   requireReimbursementAccess({ resourceType: 'project', source: { param: 'id' } })
 *   requireReimbursementAccess({ resourceType: 'project', source: { body: 'projectId' }, optional: true })
 *   requireReimbursementAccess({ resourceType: 'record', source: { param: 'id' } })
 *   requireReimbursementAccess({ resourceType: 'attachment', source: { param: 'id' } })
 *   requireReimbursementAccess({ resourceType: 'pendingMatch', source: { param: 'id' } })
 *
 *   // Batch record access
 *   requireReimbursementAccess({ resourceType: 'record', source: 'body', bodyKey: 'recordIds' })
 *
 *   // Generic user-scoped access (no DB lookup)
 *   requireReimbursementAccess({ accessLevel: 'view_org' })
 *
 *   // Owner check by resource type
 *   requireReimbursementAccess({ resourceType: 'project', source: 'id', accessLevel: 'owner' })
 *
 * @param {object} options
 * @param {string} [options.resourceType] - 'project' | 'record' | 'attachment' | 'pendingMatch'
 * @param {string} [options.accessLevel] - 'super_admin' | 'org_admin' | 'view_org' | 'org_member' | 'owner'
 * @param {string|object} [options.source] - Source for resource ID resolution.
 *   - String: param name to read from req.params (e.g. 'id', 'projectId').
 *     Special value 'body' triggers batch mode (requires bodyKey).
 *   - Object: { param: 'name' } | { body: 'key' } | { query: 'key' } for single resource.
 *   - Default: { param: 'id' }
 * @param {string} [options.bodyKey] - Key in req.body for batch operations (default 'recordIds').
 * @param {boolean} [options.optional] - If true, missing resource ID passes through instead of 400.
 */

function resolveRoles(req) {
  const role = req.authContext?.role || req.user?.role || null;
  const legacyRoles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  return role ? [...new Set([role, ...legacyRoles])] : legacyRoles;
}

function canAccessOwnedResource({ ownerUserId, resourceOrgId }, { userId, orgId, roles }) {
  if (roles.includes('super_admin')) return true;
  if (ownerUserId && ownerUserId === userId) return true;
  return roles.includes('org_admin') && resourceOrgId && orgId && resourceOrgId === orgId;
}

function readRequestValue(req, source) {
  if (source?.param) return req.params?.[source.param];
  if (source?.body) return req.body?.[source.body];
  if (source?.query) return req.query?.[source.query];
  return null;
}

function failMissingResourceId(res) {
  return res.status(400).json({ error: '缺少资源ID' });
}

// Map resourceType to the error / label messages
const RESOURCE_LABELS = {
  project: { notFound: '项目不存在', forbidden: '无权访问该项目' },
  record: { notFound: '记录不存在', forbidden: '无权访问该记录' },
  attachment: { notFound: '附件不存在', forbidden: '无权访问该附件' },
  pendingMatch: { notFound: '待匹配项不存在', forbidden: '无权访问该待匹配项' },
};

/**
 * Fetch a single resource by type and ID.
 */
async function fetchSingleResource(knex, resourceType, resourceId) {
  if (resourceType === 'project') {
    return knex('reimbursement_projects')
      .where({ id: resourceId })
      .first();
  }

  if (resourceType === 'record') {
    return knex('reimbursement_records as rr')
      .join('reimbursement_projects as rp', 'rr.project_id', 'rp.id')
      .where('rr.id', resourceId)
      .select(
        'rr.id as record_id',
        'rr.user_id as record_user_id',
        'rp.user_id as project_user_id',
        'rp.org_id as project_org_id',
      )
      .first();
  }

  if (resourceType === 'attachment') {
    return knex('reimbursement_attachments as ra')
      .join('reimbursement_records as rr', 'ra.record_id', 'rr.id')
      .join('reimbursement_projects as rp', 'rr.project_id', 'rp.id')
      .where('ra.id', resourceId)
      .select(
        'ra.id as attachment_id',
        'rr.user_id as record_user_id',
        'rp.user_id as project_user_id',
        'rp.org_id as project_org_id',
      )
      .first();
  }

  if (resourceType === 'pendingMatch') {
    return knex('reimbursement_pending_matches as rpm')
      .join('reimbursement_projects as rp', 'rpm.project_id', 'rp.id')
      .where('rpm.id', resourceId)
      .select(
        'rpm.id as match_id',
        'rpm.user_id as match_user_id',
        'rp.user_id as project_user_id',
        'rp.org_id as project_org_id',
      )
      .first();
  }

  return null;
}

/**
 * Extract owner info from a fetched resource row.
 */
function getOwnerInfo(resource, resourceType) {
  switch (resourceType) {
    case 'project':
      return { ownerUserId: resource.user_id, resourceOrgId: resource.org_id };
    case 'record':
      return {
        ownerUserId: resource.record_user_id || resource.project_user_id,
        resourceOrgId: resource.project_org_id,
      };
    case 'attachment':
      return {
        ownerUserId: resource.record_user_id || resource.project_user_id,
        resourceOrgId: resource.project_org_id,
      };
    case 'pendingMatch':
      return {
        ownerUserId: resource.match_user_id || resource.project_user_id,
        resourceOrgId: resource.project_org_id,
      };
    default:
      return { ownerUserId: resource.user_id, resourceOrgId: resource.org_id };
  }
}

/**
 * Attach the fetched resource to req under the appropriate property.
 */
function attachResource(req, resource, resourceType) {
  switch (resourceType) {
    case 'project':
      req.reimbursementProject = resource;
      break;
    case 'record':
      req.reimbursementRecord = resource;
      break;
    case 'attachment':
      req.reimbursementAttachment = resource;
      break;
    case 'pendingMatch':
      req.reimbursementPendingMatch = resource;
      break;
    default:
      break;
  }
  // Also set a generic key for unified access
  req.reimbursementResource = resource;
}

/**
 * Perform a batch record ownership check.
 */
async function checkBatchRecords(knex, recordIds, { userId, orgId, roles }) {
  const uniqueRecordIds = [...new Set(recordIds)];

  const rows = await knex('reimbursement_records as rr')
    .join('reimbursement_projects as rp', 'rr.project_id', 'rp.id')
    .whereIn('rr.id', uniqueRecordIds)
    .select(
      'rr.id as record_id',
      'rr.user_id as record_user_id',
      'rp.user_id as project_user_id',
      'rp.org_id as project_org_id',
    );

  if (rows.length !== uniqueRecordIds.length) {
    return { ok: false, status: 404, error: '记录不存在' };
  }

  const blocked = rows.some((row) => !canAccessOwnedResource({
    ownerUserId: row.record_user_id || row.project_user_id,
    resourceOrgId: row.project_org_id,
  }, { userId, orgId, roles }));

  if (blocked) {
    return { ok: false, status: 403, error: '无权访问部分记录' };
  }

  return { ok: true };
}

/**
 * Unified reimbursement access middleware.
 * Replaces the previous 9 separate middleware functions.
 *
 * @param {object} options
 * @param {string} [options.resourceType] - 'project' | 'record' | 'attachment' | 'pendingMatch'
 * @param {string} [options.accessLevel] - Minimum required access level
 * @param {string|object} [options.source] - req.params key, 'body', or { param, body, query } object
 * @param {string} [options.bodyKey] - Key in req.body for batch operations
 * @param {boolean} [options.optional] - If true, missing resource ID is not an error
 */
export function requireReimbursementAccess(options = {}) {
  return async (req, res, next) => {
    const userId = req.authContext?.userId || req.user?.userId;
    const orgId = req.authContext?.orgId || req.user?.orgId;
    const roles = resolveRoles(req);

    // Not logged in
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    // Super admin bypasses all checks
    if (roles.includes('super_admin')) {
      return next();
    }

    const { resourceType, accessLevel, source, bodyKey, optional } = options;

    // ── Role-only checks (no resourceType) ──

    // requireSuperAdmin replacement: only super_admin allowed (already denied above)
    if (accessLevel === 'super_admin') {
      return res.status(403).json({ error: '需要超级管理员权限' });
    }

    // requireOrgAdminOrFinance replacement: org_admin required
    if (accessLevel === 'org_admin' && !resourceType) {
      if (!roles.includes('org_admin')) {
        return res.status(403).json({ error: '需要机构管理员权限' });
      }
      return next();
    }

    // requireReimbursementAccess(minLevel): user-scoped check without DB lookup
    if (!resourceType && accessLevel) {
      // Org admin can access org-level data for these levels
      if (roles.includes('org_admin') && ['view_org', 'org_member', 'owner'].includes(accessLevel)) {
        return next();
      }
      // For 'owner' level, verify the target userId matches the requester
      if (accessLevel === 'owner') {
        // Resolve target user from source param or common conventions
        const targetUserId = typeof source === 'string'
          ? req.params?.[source]
          : (req.params?.userId || req.body?.user_id || req.query?.userId);
        if (targetUserId && targetUserId !== userId) {
          return res.status(403).json({ error: '无权访问该数据' });
        }
      }
      return next();
    }

    // ── Resource-based checks ──

    if (!resourceType) {
      return next(); // Nothing to check, allow through
    }

    // ── Batch mode: source === 'body' (string, not object) ──
    if (source === 'body') {
      const key = bodyKey || 'recordIds';
      const recordIds = req.body?.[key];

      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return next(); // No records to check, allow through
      }

      try {
        const result = await checkBatchRecords(req.app.locals.knex, recordIds, { userId, orgId, roles });
        if (!result.ok) {
          return res.status(result.status).json({ error: result.error });
        }
        return next();
      } catch (error) {
        console.error('Permission check error:', error);
        return res.status(500).json({ error: '权限检查失败' });
      }
    }

    // ── Single resource mode ──

    // Resolve resource ID
    let resourceId;
    if (typeof source === 'string') {
      resourceId = req.params?.[source];
    } else if (source && typeof source === 'object') {
      resourceId = readRequestValue(req, source);
    } else {
      // Default: try common param names
      resourceId = req.params?.id || req.params?.projectId || req.params?.recordId;
    }

    if (!resourceId) {
      if (optional) return next();
      return failMissingResourceId(res);
    }

    try {
      const resource = await fetchSingleResource(req.app.locals.knex, resourceType, resourceId);

      if (!resource) {
        const label = RESOURCE_LABELS[resourceType] || { notFound: '资源不存在' };
        return res.status(404).json({ error: label.notFound });
      }

      const ownerInfo = getOwnerInfo(resource, resourceType);

      if (!canAccessOwnedResource(ownerInfo, { userId, orgId, roles })) {
        const label = RESOURCE_LABELS[resourceType] || { forbidden: '无权操作他人的报销数据' };
        return res.status(403).json({ error: label.forbidden });
      }

      attachResource(req, resource, resourceType);
      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: '权限检查失败' });
    }
  };
}
