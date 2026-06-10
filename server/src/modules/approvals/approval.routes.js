import { Router } from 'express';
import {
    actOnTask,
    getCurrentApprovalForBusiness,
    listMyApprovalTasks,
} from './approval.service.js';

const router = Router();

function buildContext(req) {
    return {
        ...req.authContext,
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
