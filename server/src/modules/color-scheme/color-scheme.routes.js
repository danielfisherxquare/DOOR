/**
 * Color Scheme Routes
 * 配色方案路由 - 管理后台 API
 * 支持按层级（admin/app/ops）区分配色
 */

import { Router } from 'express';
import { requirePermission } from '../../middleware/require-permission.js';
import * as colorSchemeService from './color-scheme.service.js';

const router = Router();

router.use(requirePermission({ roles: ['org_admin', 'super_admin'] }));

async function getOrgId(req) {
  if (req.authContext.role === 'super_admin' && req.query.orgId) {
    return req.query.orgId;
  }
  if (req.authContext.orgId) return req.authContext.orgId;
  return null;
}

function getSurface(req) {
  return req.query.surface || 'admin';
}

/**
 * ────────────────────────────────────────────────────────────────────────
 * 机构配色设置路由（必须放在 /:schemeId 之前，避免被参数路由拦截）
 * ────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /admin/color-schemes/orgs/:orgId/color-scheme?surface=admin
 * 获取机构当前配色
 */
router.get('/orgs/:orgId/color-scheme', async (req, res, next) => {
  try {
    const requestedOrgId = req.params.orgId;
    const surface = getSurface(req);
    const userOrgId = await getOrgId(req);

    // 权限检查
    if (req.authContext.role !== 'super_admin' && requestedOrgId !== userOrgId) {
      return res.status(403).json({ success: false, message: 'No permission' });
    }

    const result = await colorSchemeService.getOrgScheme(requestedOrgId, surface);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin/color-schemes/orgs/:orgId/color-scheme?surface=admin
 * 设置机构配色
 */
router.put('/orgs/:orgId/color-scheme', async (req, res, next) => {
  try {
    const requestedOrgId = req.params.orgId;
    const surface = req.query.surface || 'admin';
    const userOrgId = await getOrgId(req);

    // 权限检查
    if (req.authContext.role !== 'super_admin' && requestedOrgId !== userOrgId) {
      return res.status(403).json({ success: false, message: 'No permission' });
    }

    const { schemeId, customConfig } = req.body;
    if (!schemeId) {
      return res.status(400).json({ success: false, message: 'Missing schemeId' });
    }

    await colorSchemeService.setOrgScheme(requestedOrgId, surface, schemeId, customConfig);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin/color-schemes/orgs/:orgId/color-scheme?surface=admin
 * 重置机构配色
 */
router.delete('/orgs/:orgId/color-scheme', async (req, res, next) => {
  try {
    const requestedOrgId = req.params.orgId;
    const surface = getSurface(req);
    const userOrgId = await getOrgId(req);

    // 权限检查
    if (req.authContext.role !== 'super_admin' && requestedOrgId !== userOrgId) {
      return res.status(403).json({ success: false, message: 'No permission' });
    }

    await colorSchemeService.resetOrgScheme(requestedOrgId, surface);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * ────────────────────────────────────────────────────────────────────────
 * 配色方案 CRUD 路由
 * ────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /admin/color-schemes/presets?surface=admin
 * 获取预设配色方案
 */
router.get('/presets', async (req, res, next) => {
  try {
    const surface = getSurface(req);
    const presets = colorSchemeService.getPresets(surface);
    res.json({ success: true, presets });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/color-schemes?surface=admin
 * 获取所有配色方案（含预设和自定义）
 */
router.get('/', async (req, res, next) => {
  try {
    const orgId = await getOrgId(req);
    const surface = getSurface(req);
    if (!orgId) {
      return res.status(400).json({ success: false, message: 'Missing orgId' });
    }

    const result = await colorSchemeService.getAllSchemes(orgId, surface);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/color-schemes/:schemeId
 * 获取单个配色方案
 */
router.get('/:schemeId', async (req, res, next) => {
  try {
    const scheme = await colorSchemeService.getScheme(req.params.schemeId);
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    res.json({ success: true, scheme });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/color-schemes?surface=admin
 * 创建自定义配色方案
 */
router.post('/', async (req, res, next) => {
  try {
    const orgId = await getOrgId(req);
    const surface = getSurface(req);
    if (!orgId) {
      return res.status(400).json({ success: false, message: 'Missing orgId' });
    }

    const { name, description, config } = req.body;
    if (!name || !config) {
      return res.status(400).json({ success: false, message: 'Missing required fields: name, config' });
    }

    const scheme = await colorSchemeService.createScheme(orgId, surface, { name, description, config });
    res.status(201).json({ success: true, scheme });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/color-schemes/:schemeId?surface=admin
 * 更新配色方案
 */
router.patch('/:schemeId', async (req, res, next) => {
  try {
    const orgId = await getOrgId(req);
    const surface = getSurface(req);
    if (!orgId) {
      return res.status(400).json({ success: false, message: 'Missing orgId' });
    }

    const scheme = await colorSchemeService.updateScheme(orgId, surface, req.params.schemeId, req.body);
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found or no permission' });
    }
    res.json({ success: true, scheme });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin/color-schemes/:schemeId?surface=admin
 * 删除配色方案
 */
router.delete('/:schemeId', async (req, res, next) => {
  try {
    const orgId = await getOrgId(req);
    const surface = getSurface(req);
    if (!orgId) {
      return res.status(400).json({ success: false, message: 'Missing orgId' });
    }

    const deleted = await colorSchemeService.deleteScheme(orgId, surface, req.params.schemeId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Scheme not found or cannot be deleted' });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/color-schemes/import?surface=admin
 * 导入配色方案
 */
router.post('/import', async (req, res, next) => {
  try {
    const orgId = await getOrgId(req);
    const surface = getSurface(req);
    if (!orgId) {
      return res.status(400).json({ success: false, message: 'Missing orgId' });
    }

    const { name, description, config } = req.body;
    if (!name || !config) {
      return res.status(400).json({ success: false, message: 'Invalid scheme data' });
    }

    const scheme = await colorSchemeService.createScheme(orgId, surface, {
      name: name || 'Imported Scheme',
      description: description || 'Imported from file',
      config,
    });
    res.status(201).json({ success: true, scheme });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/color-schemes/:schemeId/export
 * 导出配色方案
 */
router.get('/:schemeId/export', async (req, res, next) => {
  try {
    const scheme = await colorSchemeService.getScheme(req.params.schemeId);
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    res.json({ success: true, scheme });
  } catch (err) {
    next(err);
  }
});

export default router;
