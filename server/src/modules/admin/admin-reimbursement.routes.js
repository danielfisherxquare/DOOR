import express from 'express';
import {
    getOrgProjects,
    getAllProjects,
    getProjectRecords,
    exportProjectExcel,
} from '../reimbursement/reimbursement.controller.js';
import { requireReimbursementAccess } from '../../middleware/require-reimbursement-access.js';
import { authorize } from '../../middleware/authorize.js';

const router = express.Router();

// GET /admin/reimbursements/org/:orgId - 获取机构所有项目
router.get('/org/:orgId', authorize({
    action: 'use',
    resource: { kind: 'capability', scope: 'org', name: 'view' },
}), requireReimbursementAccess({ accessLevel: 'org_admin' }), getOrgProjects);

// GET /admin/reimbursements/all - 获取全部项目（超管）
router.get('/all', authorize({
    action: 'use',
    resource: { kind: 'capability', scope: 'platform', name: 'view' },
}), requireReimbursementAccess({ accessLevel: 'super_admin' }), getAllProjects);

// GET /admin/reimbursements/projects/:id/records - 获取项目记录明细
router.get('/projects/:id/records', requireReimbursementAccess({ accessLevel: 'org_admin' }), getProjectRecords);

// GET /admin/reimbursements/projects/:id/export - 导出项目Excel
router.get('/projects/:id/export', requireReimbursementAccess({ accessLevel: 'org_admin' }), exportProjectExcel);

export default router;
