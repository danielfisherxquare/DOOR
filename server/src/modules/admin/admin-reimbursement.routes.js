import express from 'express';
import {
    getOrgProjects,
    getAllProjects,
    getProjectRecords,
    exportProjectExcel,
} from '../reimbursement/reimbursement.controller.js';
import {
    requireSuperAdmin,
    requireOrgAdminOrFinance,
} from '../../middleware/require-reimbursement-access.js';
import { requireCapability } from '../../middleware/require-capability.js';
import { requireSurfaceAccess } from '../../middleware/require-surface-access.js';

const router = express.Router();

router.use(requireSurfaceAccess('admin'));

// GET /admin/reimbursements/org/:orgId - 获取机构所有项目
router.get('/org/:orgId', requireCapability('org', 'view'), requireOrgAdminOrFinance, getOrgProjects);

// GET /admin/reimbursements/all - 获取全部项目（超管）
router.get('/all', requireCapability('platform', 'view'), requireSuperAdmin, getAllProjects);

// GET /admin/reimbursements/projects/:id/records - 获取项目记录明细
router.get('/projects/:id/records', requireOrgAdminOrFinance, getProjectRecords);

// GET /admin/reimbursements/projects/:id/export - 导出项目Excel
router.get('/projects/:id/export', requireOrgAdminOrFinance, exportProjectExcel);

export default router;
