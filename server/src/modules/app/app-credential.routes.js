import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import { requirePermission } from '../../middleware/require-permission.js';
import * as service from '../credential/credential.service.js';
import credentialWorkbenchRoutes from '../credential/credential.routes.js';

const router = Router();

const buildRequestContext = (req) => ({
    ...req.authContext,
    requestId: req.id || null,
});

router.post(
    '/requests/:raceId',
    requirePermission({ capability: { scope: 'self', name: 'operate' } }),
    requireRaceAccess('raceId'),
    async (req, res, next) => {
        try {
            res.status(201).json({
                success: true,
                data: await service.createRequest(buildRequestContext(req), req.params.raceId, req.body),
            });
        } catch (err) {
            next(err);
        }
    },
);

router.get(
    '/requests/:raceId/:requestId',
    requirePermission({ capability: { scope: 'self', name: 'view' } }),
    requireRaceAccess('raceId'),
    async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.getRequest(buildRequestContext(req), req.params.raceId, req.params.requestId),
            });
        } catch (err) {
            next(err);
        }
    },
);

router.get(
    '/credentials/:raceId/:credentialId',
    requirePermission({ capability: { scope: 'self', name: 'view' } }),
    requireRaceAccess('raceId'),
    async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.getCredential(buildRequestContext(req), req.params.raceId, req.params.credentialId),
            });
        } catch (err) {
            next(err);
        }
    },
);

router.post('/scan/resolve', requirePermission({ capability: { scope: 'self', name: 'view' } }), async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await service.resolveCredentialByQrPayload(buildRequestContext(req), req.body?.qrPayload),
        });
    } catch (err) {
        next(err);
    }
});

// App surface hosts the credential workbench UI. Keep the self-service routes
// above for least-privilege users, then fall through to the shared workbench
// routes for admins/operators using the same app workspace.
router.use(credentialWorkbenchRoutes);

export default router;
