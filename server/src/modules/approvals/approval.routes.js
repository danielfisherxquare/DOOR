import { Router } from 'express';
import {
    actOnTask,
    getCurrentApprovalForBusiness,
    listMyApprovalTasks,
} from './approval.service.js';
import {
    archiveScopeRoleAssignment,
    createScopeRoleAssignment,
    listScopeRoleAssignments,
    updateScopeRoleAssignment,
} from './scope-role-assignment.service.js';

const router = Router();

function buildContext(req) {
    const requestedOrgId = req.query?.orgId || req.body?.orgId || req.body?.org_id || null;
    return {
        ...req.authContext,
        orgId: req.authContext?.role === 'super_admin'
            ? (requestedOrgId || req.authContext?.orgId || null)
            : req.authContext?.orgId,
        raceAccess: req.raceAccess || null,
    };
}

router.get('/tasks', async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await listMyApprovalTasks(buildContext(req), req.query),
        });
    } catch (err) {
        next(err);
    }
});

router.get('/scope-role-assignments', async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await listScopeRoleAssignments(buildContext(req), req.query),
        });
    } catch (err) {
        next(err);
    }
});

router.post('/scope-role-assignments', async (req, res, next) => {
    try {
        res.status(201).json({
            success: true,
            data: await createScopeRoleAssignment(buildContext(req), req.body),
        });
    } catch (err) {
        next(err);
    }
});

router.patch('/scope-role-assignments/:assignmentId', async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await updateScopeRoleAssignment(buildContext(req), req.params.assignmentId, req.body),
        });
    } catch (err) {
        next(err);
    }
});

router.delete('/scope-role-assignments/:assignmentId', async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await archiveScopeRoleAssignment(buildContext(req), req.params.assignmentId, req.body),
        });
    } catch (err) {
        next(err);
    }
});

for (const [route, action] of [
    ['approve', 'approve'],
    ['reject', 'reject'],
    ['request-changes', 'request_changes'],
    ['assign', 'assign'],
]) {
    router.post(`/tasks/:taskId/${route}`, async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await actOnTask(buildContext(req), req.params.taskId, {
                    ...req.body,
                    action,
                }),
            });
        } catch (err) {
            next(err);
        }
    });
}

router.get('/instances/by-business/:businessType/:businessId', async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await getCurrentApprovalForBusiness(buildContext(req), {
                businessType: req.params.businessType,
                businessId: req.params.businessId,
            }),
        });
    } catch (err) {
        next(err);
    }
});

export default router;
