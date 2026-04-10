/**
 * Reimbursement Access Middleware
 * 发票报销权限中间件
 *
 * 权限层级：
 * - owner: 数据所有者（用户只能访问自己创建的数据）
 * - org_member: 机构成员（查看本机构数据）
 * - org_admin: 机构管理员（管理本机构数据）
 * - super_admin: 超级管理员（查看和管理所有数据）
 */

/**
 * 检查报销数据访问权限
 * @param {string} minLevel - 最低权限级别
 */
function resolveRoles(req) {
  const role = req.authContext?.role || req.user?.role || null;
  const legacyRoles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  return role ? [...new Set([role, ...legacyRoles])] : legacyRoles;
}

function getActor(req) {
  return {
    userId: req.authContext?.userId || req.user?.userId,
    orgId: req.authContext?.orgId || req.user?.orgId,
    roles: resolveRoles(req),
  };
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

export function requireReimbursementProjectAccess(source = { param: 'id' }, options = {}) {
  return async (req, res, next) => {
    const actor = getActor(req);
    if (!actor.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const projectId = readRequestValue(req, source);
    if (!projectId) {
      return options.optional ? next() : failMissingResourceId(res);
    }

    try {
      const project = await req.app.locals.knex('reimbursement_projects')
        .where({ id: projectId })
        .first();

      if (!project) {
        return res.status(404).json({ error: '项目不存在' });
      }

      if (!canAccessOwnedResource({ ownerUserId: project.user_id, resourceOrgId: project.org_id }, actor)) {
        return res.status(403).json({ error: '无权访问该项目' });
      }

      req.reimbursementProject = project;
      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: '权限检查失败' });
    }
  };
}

export function requireReimbursementRecordAccess(source = { param: 'id' }) {
  return async (req, res, next) => {
    const actor = getActor(req);
    if (!actor.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const recordId = readRequestValue(req, source);
    if (!recordId) {
      return failMissingResourceId(res);
    }

    try {
      const record = await req.app.locals.knex('reimbursement_records as rr')
        .join('reimbursement_projects as rp', 'rr.project_id', 'rp.id')
        .where('rr.id', recordId)
        .select(
          'rr.id as record_id',
          'rr.user_id as record_user_id',
          'rp.user_id as project_user_id',
          'rp.org_id as project_org_id',
        )
        .first();

      if (!record) {
        return res.status(404).json({ error: '记录不存在' });
      }

      if (!canAccessOwnedResource({
        ownerUserId: record.record_user_id || record.project_user_id,
        resourceOrgId: record.project_org_id,
      }, actor)) {
        return res.status(403).json({ error: '无权访问该记录' });
      }

      req.reimbursementRecord = record;
      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: '权限检查失败' });
    }
  };
}

export function requireReimbursementBatchRecordAccess(bodyKey = 'recordIds') {
  return async (req, res, next) => {
    const actor = getActor(req);
    if (!actor.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const recordIds = req.body?.[bodyKey];
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return next();
    }

    try {
      const uniqueRecordIds = [...new Set(recordIds)];
      const rows = await req.app.locals.knex('reimbursement_records as rr')
        .join('reimbursement_projects as rp', 'rr.project_id', 'rp.id')
        .whereIn('rr.id', uniqueRecordIds)
        .select(
          'rr.id as record_id',
          'rr.user_id as record_user_id',
          'rp.user_id as project_user_id',
          'rp.org_id as project_org_id',
        );

      if (rows.length !== uniqueRecordIds.length) {
        return res.status(404).json({ error: '记录不存在' });
      }

      const blocked = rows.some((row) => !canAccessOwnedResource({
        ownerUserId: row.record_user_id || row.project_user_id,
        resourceOrgId: row.project_org_id,
      }, actor));

      if (blocked) {
        return res.status(403).json({ error: '无权访问部分记录' });
      }

      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: '权限检查失败' });
    }
  };
}

export function requireReimbursementAttachmentAccess(source = { param: 'id' }) {
  return async (req, res, next) => {
    const actor = getActor(req);
    if (!actor.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const attachmentId = readRequestValue(req, source);
    if (!attachmentId) {
      return failMissingResourceId(res);
    }

    try {
      const attachment = await req.app.locals.knex('reimbursement_attachments as ra')
        .join('reimbursement_records as rr', 'ra.record_id', 'rr.id')
        .join('reimbursement_projects as rp', 'rr.project_id', 'rp.id')
        .where('ra.id', attachmentId)
        .select(
          'ra.id as attachment_id',
          'rr.user_id as record_user_id',
          'rp.user_id as project_user_id',
          'rp.org_id as project_org_id',
        )
        .first();

      if (!attachment) {
        return res.status(404).json({ error: '附件不存在' });
      }

      if (!canAccessOwnedResource({
        ownerUserId: attachment.record_user_id || attachment.project_user_id,
        resourceOrgId: attachment.project_org_id,
      }, actor)) {
        return res.status(403).json({ error: '无权访问该附件' });
      }

      req.reimbursementAttachment = attachment;
      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: '权限检查失败' });
    }
  };
}

export function requireReimbursementPendingMatchAccess(source = { param: 'id' }) {
  return async (req, res, next) => {
    const actor = getActor(req);
    if (!actor.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const matchId = readRequestValue(req, source);
    if (!matchId) {
      return failMissingResourceId(res);
    }

    try {
      const match = await req.app.locals.knex('reimbursement_pending_matches as rpm')
        .join('reimbursement_projects as rp', 'rpm.project_id', 'rp.id')
        .where('rpm.id', matchId)
        .select(
          'rpm.id as match_id',
          'rpm.user_id as match_user_id',
          'rp.user_id as project_user_id',
          'rp.org_id as project_org_id',
        )
        .first();

      if (!match) {
        return res.status(404).json({ error: '待匹配项不存在' });
      }

      if (!canAccessOwnedResource({
        ownerUserId: match.match_user_id || match.project_user_id,
        resourceOrgId: match.project_org_id,
      }, actor)) {
        return res.status(403).json({ error: '无权访问该待匹配项' });
      }

      req.reimbursementPendingMatch = match;
      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: '权限检查失败' });
    }
  };
}

export function requireReimbursementAccess(minLevel = 'owner') {
  return async (req, res, next) => {
    const userId = req.authContext?.userId || req.user?.userId;
    const orgId = req.authContext?.orgId || req.user?.orgId;
    const roles = resolveRoles(req);

    // 未登录
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    // 超级管理员：可以访问所有数据
    if (roles.includes('super_admin')) {
      return next();
    }

    // 机构管理员：可以访问本机构数据
    if (roles.includes('org_admin')) {
      if (['view_org', 'org_member', 'owner'].includes(minLevel)) {
        return next();
      }
    }

    // 普通用户：检查是否是数据所有者
    const targetUserId = req.params.userId || req.body.user_id || req.query.userId;

    if (minLevel === 'owner' || !targetUserId) {
      // 需要验证是否是数据所有者
      if (targetUserId && targetUserId !== userId) {
        return res.status(403).json({ error: '无权访问该数据' });
      }
    }

    return next();
  };
}

/**
 * 检查是否是报销记录的所有者
 * @param {string} resourceType - 资源类型：'project' | 'record'
 */
export function requireReimbursementOwner(resourceType = 'project') {
  return async (req, res, next) => {
    const userId = req.authContext?.userId || req.user?.userId;
    const roles = resolveRoles(req);

    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    // 超级管理员跳过检查
    if (roles.includes('super_admin')) {
      return next();
    }

    const resourceId = req.params.id || req.params.projectId || req.params.recordId;

    if (!resourceId) {
      return res.status(400).json({ error: '缺少资源ID' });
    }

    try {
      const knex = req.app.locals.knex;

      if (resourceType === 'project') {
        const project = await knex('reimbursement_projects')
          .where({ id: resourceId })
          .first();

        if (!project) {
          return res.status(404).json({ error: '项目不存在' });
        }

        if (project.user_id !== userId) {
          // 检查是否是机构管理员
          if (!roles.includes('org_admin')) {
            return res.status(403).json({ error: '无权访问该项目' });
          }
        }
      } else if (resourceType === 'record') {
        const record = await knex('reimbursement_records')
          .where({ id: resourceId })
          .first();

        if (!record) {
          return res.status(404).json({ error: '记录不存在' });
        }

        if (record.user_id !== userId) {
          if (!roles.includes('org_admin')) {
            return res.status(403).json({ error: '无权访问该记录' });
          }
        }
      }

      return next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: '权限检查失败' });
    }
  };
}

/**
 * 仅限超级管理员
 */
export function requireSuperAdmin(req, res, next) {
  const roles = resolveRoles(req);

  if (!roles.includes('super_admin')) {
    return res.status(403).json({ error: '需要超级管理员权限' });
  }

  return next();
}

/**
 * 机构管理员
 */
export function requireOrgAdminOrFinance(req, res, next) {
  const roles = resolveRoles(req);

  if (!roles.some(r => ['super_admin', 'org_admin'].includes(r))) {
    return res.status(403).json({ error: '需要机构管理员权限' });
  }

  return next();
}
