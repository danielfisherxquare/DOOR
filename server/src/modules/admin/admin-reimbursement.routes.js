import express from 'express';
import {
    getOrgProjects,
    getAllProjects,
    getProjectRecords,
    exportProjectExcel,
} from '../reimbursement/reimbursement.controller.js';
import { requireReimbursementAccess } from '../../middleware/require-reimbursement-access.js';
import { requirePermission } from '../../middleware/require-permission.js';

const router = express.Router();

router.use(requirePermission({ surface: 'admin' }));

// GET /admin/reimbursements/org/:orgId - 获取机构所有项目
router.get('/org/:orgId', requirePermission({ capability: { scope: 'org', name: 'view' } }), requireReimbursementAccess({ accessLevel: 'org_admin' }), getOrgProjects);

// GET /admin/reimbursements/all - 获取全部项目（超管）
router.get('/all', requirePermission({ capability: { scope: 'platform', name: 'view' } }), requireReimbursementAccess({ accessLevel: 'super_admin' }), getAllProjects);

// GET /admin/reimbursements/projects/:id/records - 获取项目记录明细
router.get('/projects/:id/records', requireReimbursementAccess({ accessLevel: 'org_admin' }), getProjectRecords);

// GET /admin/reimbursements/projects/:id/export - 导出项目Excel
router.get('/projects/:id/export', requireReimbursementAccess({ accessLevel: 'org_admin' }), exportProjectExcel);

export default router;
