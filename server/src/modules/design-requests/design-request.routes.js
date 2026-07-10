import { Router } from 'express';
import multer from 'multer';
import { authorize } from '../../middleware/authorize.js';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import * as service from './design-request.service.js';
import * as importService from './design-collaboration-import.service.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});
const requireDesignAdmin = authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['org_admin', 'super_admin'] },
});

function buildRequestContext(req, surface) {
    const requestedOrgId = req.query?.orgId || req.body?.orgId || req.body?.org_id || null;
    return {
        ...req.authContext,
        orgId: req.authContext?.role === 'super_admin'
            ? (requestedOrgId || req.authContext?.orgId || null)
            : req.authContext?.orgId,
        surface,
        requestId: req.id || null,
        raceAccess: req.raceAccess || null,
    };
}

function raceIdFromBody(req) {
    return req.body?.primaryRaceId
        || req.body?.raceId
        || (Array.isArray(req.body?.raceIds) ? req.body.raceIds[0] : null);
}

function optionalRaceAccess(resolveRaceId) {
    const raceAccess = requireRaceAccess(resolveRaceId);
    return async (req, res, next) => {
        const raceId = await resolveRaceId(req);
        if (!raceId) return next();
        return raceAccess(req, res, next);
    };
}

export function createDesignRequestRoutes(surface) {
    const router = Router();

    router.get('/templates', async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.listTemplates(buildRequestContext(req, surface), req.query),
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/templates', requireDesignAdmin, async (req, res, next) => {
        try {
            res.status(201).json({
                success: true,
                data: await service.createTemplate(buildRequestContext(req, surface), req.body),
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/templates/from-request/:requestId', requireDesignAdmin, async (req, res, next) => {
        try {
            res.status(201).json({
                success: true,
                data: await service.createTemplateFromRequest(buildRequestContext(req, surface), req.params.requestId, req.body),
            });
        } catch (err) {
            next(err);
        }
    });

    if (surface !== 'app') {
        router.post('/imports/preview', upload.single('file'), optionalRaceAccess(raceIdFromBody), async (req, res, next) => {
            try {
                res.status(201).json({
                    success: true,
                    data: await importService.previewImport(buildRequestContext(req, surface), {
                        file: req.file,
                        body: req.body,
                    }),
                });
            } catch (err) {
                next(err);
            }
        });

        router.get('/imports', async (req, res, next) => {
            try {
                res.json({
                    success: true,
                    data: await importService.listImports(buildRequestContext(req, surface), req.query),
                });
            } catch (err) {
                next(err);
            }
        });

        router.get('/imports/:importId', async (req, res, next) => {
            try {
                res.json({
                    success: true,
                    data: await importService.getImport(buildRequestContext(req, surface), req.params.importId),
                });
            } catch (err) {
                next(err);
            }
        });

        router.patch('/imports/:importId/items/:itemId', async (req, res, next) => {
            try {
                res.json({
                    success: true,
                    data: await importService.updateImportItem(buildRequestContext(req, surface), req.params.importId, req.params.itemId, req.body),
                });
            } catch (err) {
                next(err);
            }
        });

        router.post('/imports/:importId/commit', async (req, res, next) => {
            try {
                res.json({
                    success: true,
                    data: await importService.commitImport(buildRequestContext(req, surface), req.params.importId, req.body),
                });
            } catch (err) {
                next(err);
            }
        });
    }

    router.get('/collaboration-exports', async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await importService.listExports(buildRequestContext(req, surface), req.query),
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/collaboration-exports', optionalRaceAccess(raceIdFromBody), async (req, res, next) => {
        try {
            res.status(201).json({
                success: true,
                data: await importService.createExport(buildRequestContext(req, surface), req.body),
            });
        } catch (err) {
            next(err);
        }
    });

    router.get('/collaboration-exports/:exportId/download', async (req, res, next) => {
        try {
            const result = await importService.downloadExportWorkbook(buildRequestContext(req, surface), req.params.exportId);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(result.fileName));
            res.send(result.buffer);
        } catch (err) {
            next(err);
        }
    });

    router.get('/requests', async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.listRequests(buildRequestContext(req, surface), { ...req.query, surface }),
            });
        } catch (err) {
            next(err);
        }
    });

    router.get('/requests/:requestId', async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.getRequest(buildRequestContext(req, surface), req.params.requestId),
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/requests', optionalRaceAccess(raceIdFromBody), async (req, res, next) => {
        try {
            res.status(201).json({
                success: true,
                data: await service.createRequest(buildRequestContext(req, surface), req.body),
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/requests/:requestId/review', requireDesignAdmin, async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.reviewRequest(buildRequestContext(req, surface), req.params.requestId, req.body),
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/requests/:requestId/start', async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.startDesign(buildRequestContext(req, surface), req.params.requestId),
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/requests/:requestId/progress', requireDesignAdmin, async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.updateProgress(buildRequestContext(req, surface), req.params.requestId, req.body),
            });
        } catch (err) {
            next(err);
        }
    });

    router.post('/requests/:requestId/assets', async (req, res, next) => {
        try {
            res.status(201).json({
                success: true,
                data: await service.addAsset(buildRequestContext(req, surface), req.params.requestId, req.body),
            });
        } catch (err) {
            next(err);
        }
    });

    router.get('/stats', async (req, res, next) => {
        try {
            res.json({
                success: true,
                data: await service.getStats(buildRequestContext(req, surface), { ...req.query, surface }),
            });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

export default createDesignRequestRoutes;
