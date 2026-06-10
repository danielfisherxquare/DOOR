import { Router } from 'express';
import * as staffService from './race-staff.service.js';

const router = Router({ mergeParams: true });

function buildContext(req) {
    return {
        ...req.authContext,
        raceAccess: req.raceAccess || null,
    };
}

router.get('/', async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await staffService.listStaffAssignments(buildContext(req), req.params.raceId, req.query),
        });
    } catch (err) {
        next(err);
    }
});

router.post('/', async (req, res, next) => {
    try {
        res.status(201).json({
            success: true,
            data: await staffService.createStaffAssignment(buildContext(req), req.params.raceId, req.body),
        });
    } catch (err) {
        next(err);
    }
});

router.patch('/:assignmentId', async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await staffService.updateStaffAssignment(buildContext(req), req.params.raceId, req.params.assignmentId, req.body),
        });
    } catch (err) {
        next(err);
    }
});

router.delete('/:assignmentId', async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await staffService.archiveStaffAssignment(buildContext(req), req.params.raceId, req.params.assignmentId),
        });
    } catch (err) {
        next(err);
    }
});

export default router;
