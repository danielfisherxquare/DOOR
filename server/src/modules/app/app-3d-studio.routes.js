import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { authorize } from '../../middleware/authorize.js';
import * as studioService from '../inventory/inventory.studio.service.js';
import * as assetService from '../inventory/inventory.asset.service.js';
import * as spatialService from '../inventory/inventory.spatial.service.js';
import * as sceneJobService from '../inventory/inventory.spatial.scene-job.service.js';
import * as spatialOsmService from '../inventory/inventory.spatial.osm.service.js';
import * as spatialTerrainService from '../inventory/inventory.spatial.terrain.service.js';
import * as generatedSceneService from '../inventory/inventory.spatial.generated-scene.service.js';
import * as siteBakeService from '../inventory/inventory.spatial.site-bake.service.js';

const router = express.Router();

function resolveTargetOrgId(req) {
    const paramOrgId = req.query.orgId || req.body?.orgId;

    if (paramOrgId) {
        if (req.authContext?.role !== 'super_admin') {
            return req.authContext?.orgId || null;
        }
        return paramOrgId;
    }

    return req.authContext?.orgId || null;
}

function orgIdRequiredResponse(req, res) {
    return res.status(400).json({
        success: false,
        message: req.authContext?.role === 'super_admin'
            ? '请先选择要导入的机构'
            : '当前账号未关联机构，无法导入仓库场景',
    });
}

function buildProjectScope(req) {
    return {
        orgId: resolveTargetOrgId(req),
        ownerUserId: req.authContext?.userId || null,
    };
}

function encodeArtifactPath(relativePath) {
    return String(relativePath || '')
        .split(/[\\/]+/)
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

function appendOrgIdQuery(urlPath, orgId) {
    if (!orgId) return urlPath;
    return `${urlPath}${urlPath.includes('?') ? '&' : '?'}orgId=${encodeURIComponent(orgId)}`;
}

function buildArtifactUrl(req, zoneId, relativePath) {
    const basePath = `${req.baseUrl}/terrain-work-zones/${zoneId}/export-artifacts`;
    const encodedPath = encodeArtifactPath(relativePath);
    return appendOrgIdQuery(`${basePath}/${encodedPath}`, resolveTargetOrgId(req));
}

function rewriteTilesetJsonUris(tilesetJson, req, zoneId) {
    if (!tilesetJson || typeof tilesetJson !== 'object') return tilesetJson;

    const cloned = JSON.parse(JSON.stringify(tilesetJson));
    const rewriteNode = (node, parentRelativePath = '') => {
        if (!node || typeof node !== 'object') return;

        if (node.content?.uri) {
            const nextRelativePath = path.posix.join(parentRelativePath, String(node.content.uri));
            node.content.uri = buildArtifactUrl(req, zoneId, nextRelativePath);
        }

        if (node.extras?.doorContentUri) {
            const nextRelativePath = path.posix.join(parentRelativePath, String(node.extras.doorContentUri));
            node.extras.doorContentUri = buildArtifactUrl(req, zoneId, nextRelativePath);
        }

        if (node.extras?.doorContentIndexUri) {
            const nextRelativePath = path.posix.join(parentRelativePath, String(node.extras.doorContentIndexUri));
            node.extras.doorContentIndexUri = buildArtifactUrl(req, zoneId, nextRelativePath);
        }

        if (Array.isArray(node.children)) {
            node.children.forEach((child) => rewriteNode(child, parentRelativePath));
        }
    };

    rewriteNode(cloned.root, path.posix.dirname(req.params[0] || '').replace(/\\/g, '/'));
    return cloned;
}

router.use(authorize({
    action: 'use',
    resource: { kind: 'capability', scope: 'inventory', name: '3d_studio' },
}));

router.get('/projects', async (req, res, next) => {
    try {
        const scope = buildProjectScope(req);
        if (!scope.orgId && req.authContext?.role !== 'super_admin') {
            return orgIdRequiredResponse(req, res);
        }
        const data = await studioService.listStudioProjects(scope);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects', async (req, res, next) => {
    try {
        const scope = buildProjectScope(req);
        if (!scope.orgId && req.authContext?.role !== 'super_admin') {
            return orgIdRequiredResponse(req, res);
        }
        const data = await studioService.createStudioProject(scope, req.authContext.userId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/projects/:id', async (req, res, next) => {
    try {
        const data = await studioService.getStudioProject(buildProjectScope(req), req.params.id, req.authContext.userId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.put('/projects/:id', async (req, res, next) => {
    try {
        const data = await studioService.updateStudioProject(buildProjectScope(req), req.authContext.userId, req.params.id, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.delete('/projects/:id', async (req, res, next) => {
    try {
        const data = await studioService.deleteStudioProject(buildProjectScope(req), req.params.id);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/duplicate', async (req, res, next) => {
    try {
        const data = await studioService.duplicateStudioProject(buildProjectScope(req), req.authContext.userId, req.params.id);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/primary-asset', async (req, res, next) => {
    try {
        const data = await studioService.saveStudioProjectPrimaryAsset(
            buildProjectScope(req),
            req.authContext.userId,
            req.params.id,
            req.body,
        );
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/projects/:id/snapshot', async (req, res, next) => {
    try {
        const data = await studioService.getStudioProjectSnapshot(buildProjectScope(req), req.params.id);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.put('/projects/:id/snapshot', async (req, res, next) => {
    try {
        const data = await studioService.updateStudioProjectSnapshot(buildProjectScope(req), req.authContext.userId, req.params.id, req.body.snapshotJson);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/projects/:id/buildings', async (req, res, next) => {
    try {
        const data = await studioService.listProjectBuildings(buildProjectScope(req), req.params.id);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/buildings', async (req, res, next) => {
    try {
        const data = await studioService.createProjectBuilding(buildProjectScope(req), req.authContext.userId, req.params.id, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.put('/projects/:id/buildings/:buildingId', async (req, res, next) => {
    try {
        const data = await studioService.updateProjectBuilding(buildProjectScope(req), req.authContext.userId, req.params.id, req.params.buildingId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/buildings/:buildingId/levels', async (req, res, next) => {
    try {
        const data = await studioService.createProjectLevel(buildProjectScope(req), req.authContext.userId, req.params.id, req.params.buildingId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.put('/projects/:id/buildings/:buildingId/levels/:levelId', async (req, res, next) => {
    try {
        const data = await studioService.updateProjectLevel(buildProjectScope(req), req.authContext.userId, req.params.id, req.params.buildingId, req.params.levelId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/buildings/:buildingId/levels/:levelId/warehouses', async (req, res, next) => {
    try {
        const data = await studioService.createProjectWarehouse(buildProjectScope(req), req.authContext.userId, req.params.id, req.params.buildingId, req.params.levelId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.put('/projects/:id/warehouses/:warehouseId', async (req, res, next) => {
    try {
        const data = await studioService.updateProjectWarehouse(buildProjectScope(req), req.authContext.userId, req.params.id, req.params.warehouseId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/projects/:id/warehouses/:warehouseId/scene', async (req, res, next) => {
    try {
        const data = await studioService.getProjectWarehouseScene(buildProjectScope(req), req.params.id, req.params.warehouseId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.put('/projects/:id/warehouses/:warehouseId/scene', async (req, res, next) => {
    try {
        const data = await studioService.updateProjectWarehouseScene(buildProjectScope(req), req.authContext.userId, req.params.id, req.params.warehouseId, req.body.sceneSnapshot);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/projects/:id/race-bindings', async (req, res, next) => {
    try {
        const data = await studioService.listProjectRaceBindings(buildProjectScope(req), req.params.id);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/race-bindings', async (req, res, next) => {
    try {
        const data = await studioService.upsertProjectRaceBinding(buildProjectScope(req), req.authContext.userId, req.authContext, req.params.id, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/projects/:id/map-layers', async (req, res, next) => {
    try {
        const data = await studioService.listProjectMapLayers(buildProjectScope(req), req.params.id);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/map-layers', async (req, res, next) => {
    try {
        const data = await studioService.createProjectMapLayer(buildProjectScope(req), req.authContext.userId, req.params.id, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/projects/:id/spatial-objects', async (req, res, next) => {
    try {
        const data = await spatialService.listProjectSpatialObjects(buildProjectScope(req), req.params.id, req.query);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/spatial-objects', async (req, res, next) => {
    try {
        const data = await spatialService.createProjectSpatialObject(buildProjectScope(req), req.authContext.userId, req.params.id, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.put('/spatial-objects/:objectId', async (req, res, next) => {
    try {
        const data = await spatialService.updateProjectSpatialObject(buildProjectScope(req), req.authContext.userId, req.params.objectId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.delete('/spatial-objects/:objectId', async (req, res, next) => {
    try {
        const data = await spatialService.deleteProjectSpatialObject(buildProjectScope(req), req.params.objectId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/projects/:id/terrain-work-zones', async (req, res, next) => {
    try {
        const data = await spatialService.listProjectTerrainWorkZones(buildProjectScope(req), req.params.id, req.query);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:id/terrain-work-zones', async (req, res, next) => {
    try {
        const data = await spatialService.createProjectTerrainWorkZone(buildProjectScope(req), req.authContext.userId, req.params.id, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/terrain-work-zones/:zoneId', async (req, res, next) => {
    try {
        const data = await spatialService.getProjectTerrainWorkZone(buildProjectScope(req), req.params.zoneId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.put('/terrain-work-zones/:zoneId', async (req, res, next) => {
    try {
        const data = await spatialService.updateProjectTerrainWorkZone(buildProjectScope(req), req.authContext.userId, req.params.zoneId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/terrain-work-zones/:zoneId/publish-manifest', async (req, res, next) => {
    try {
        const data = await spatialService.generateTerrainWorkZonePublishManifest(buildProjectScope(req), req.authContext.userId, req.params.zoneId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/terrain-work-zones/:zoneId/export-package', async (req, res, next) => {
    try {
        const data = await spatialService.generateTerrainWorkZoneExportPackage(buildProjectScope(req), req.authContext.userId, req.params.zoneId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/terrain-work-zones/:zoneId/execute-export', async (req, res, next) => {
    try {
        const data = await spatialService.executeTerrainWorkZoneExport(buildProjectScope(req), req.authContext.userId, req.params.zoneId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/terrain-work-zones/:zoneId/osm-buildings/sync', async (req, res, next) => {
    try {
        const data = await spatialOsmService.syncTerrainWorkZoneOsmBuildings(
            buildProjectScope(req),
            req.authContext.userId,
            req.params.zoneId,
            req.body,
        );
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/terrain-work-zones/:zoneId/terrain-patch/sync', async (req, res, next) => {
    try {
        const data = await spatialTerrainService.syncTerrainWorkZoneTerrainPatch(
            buildProjectScope(req),
            req.authContext.userId,
            req.params.zoneId,
            req.body,
        );
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/projects/:projectId/terrain-work-zones/:zoneId/scene-export-jobs', async (req, res, next) => {
    try {
        const data = await sceneJobService.createTerrainWorkZoneSceneExportJob(
            buildProjectScope(req),
            req.authContext.userId,
            req.params.projectId,
            req.params.zoneId,
            req.body,
        );
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/scene-export-jobs/:jobId', async (req, res, next) => {
    try {
        const data = await sceneJobService.getSceneExportJob(buildProjectScope(req), req.params.jobId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/generated-scenes/:sceneId', async (req, res, next) => {
    try {
        const data = await generatedSceneService.getGeneratedScene(buildProjectScope(req), req.params.sceneId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/generated-scenes/:sceneId/download', async (req, res, next) => {
    try {
        const resolved = await generatedSceneService.resolveGeneratedSceneDownload(
            buildProjectScope(req),
            req.params.sceneId,
            req.query.asset,
        );
        res.type(resolved.contentType);
        res.download(resolved.absolutePath, resolved.filename);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            res.status(404).json({ success: false, message: 'generated scene 下载文件不存在' });
            return;
        }
        next(error);
    }
});

router.post('/generated-scenes/:sceneId/import-to-studio', async (req, res, next) => {
    try {
        const data = await generatedSceneService.importGeneratedSceneToStudio(
            buildProjectScope(req),
            req.authContext.userId,
            req.params.sceneId,
            req.body,
        );
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/terrain-work-zones/:zoneId/runtime-preview', async (req, res, next) => {
    try {
        const data = await spatialService.getTerrainWorkZoneRuntimePreview(buildProjectScope(req), req.params.zoneId);
        res.json({
            success: true,
            data: {
                ...data,
                preview: {
                    ...data.preview,
                    artifactBasePath: appendOrgIdQuery(
                        `${req.baseUrl}/terrain-work-zones/${req.params.zoneId}/export-artifacts`,
                        resolveTargetOrgId(req),
                    ),
                    sources: (data.preview?.sources || []).map((source) => ({
                        ...source,
                        url: buildArtifactUrl(req, req.params.zoneId, source.relativePath),
                        fallbackUrl: source.fallbackRelativePath
                            ? buildArtifactUrl(req, req.params.zoneId, source.fallbackRelativePath)
                            : null,
                        instancing: source.instancing
                            ? {
                                ...source.instancing,
                                planUrl: source.instancing.planRelativePath
                                    ? buildArtifactUrl(req, req.params.zoneId, source.instancing.planRelativePath)
                                    : null,
                                instancedUrl: source.instancing.instancedRelativePath
                                    ? buildArtifactUrl(req, req.params.zoneId, source.instancing.instancedRelativePath)
                                    : null,
                                templates: (source.instancing.templates || []).map((template) => ({
                                    ...template,
                                    url: template.templateRelativePath
                                        ? buildArtifactUrl(req, req.params.zoneId, template.templateRelativePath)
                                        : null,
                                })),
                            }
                            : null,
                    })),
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

router.get('/terrain-work-zones/:zoneId/export-artifacts/*', async (req, res, next) => {
    try {
        const artifactPath = req.params[0];
        const resolved = await spatialService.resolveTerrainWorkZoneExportArtifact(buildProjectScope(req), req.params.zoneId, artifactPath);

        if (resolved.relativePath.endsWith('.tileset.json')) {
            const raw = await fs.readFile(resolved.absolutePath, 'utf8');
            res.type('application/json').send(JSON.stringify(rewriteTilesetJsonUris(JSON.parse(raw), req, req.params.zoneId)));
            return;
        }

        if (resolved.relativePath.endsWith('.json')) {
            const raw = await fs.readFile(resolved.absolutePath, 'utf8');
            res.type('application/json').send(raw);
            return;
        }

        res.sendFile(resolved.absolutePath);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            res.status(404).json({ success: false, message: '导出产物不存在' });
            return;
        }
        next(error);
    }
});

router.delete('/terrain-work-zones/:zoneId', async (req, res, next) => {
    try {
        const data = await spatialService.deleteProjectTerrainWorkZone(buildProjectScope(req), req.params.zoneId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/site-bake', async (req, res, next) => {
    try {
        const bbox = siteBakeService.parseSiteBakeBbox(req.body);
        if (!bbox) {
            return res.status(400).json({
                success: false,
                message: 'bbox 无效：需提供合法 WGS84 边界，且经纬跨度均不得超过 0.25°',
            });
        }

        const data = await siteBakeService.bakeSiteScene(bbox, {
            name: typeof req.body?.name === 'string' ? req.body.name : undefined,
            orthophoto: {
                zoom: req.body?.zoom,
                maxTiles: req.body?.maxTiles,
            },
        });
        return res.json({ success: true, data });
    } catch (error) {
        return next(error);
    }
});

router.get('/asset-templates', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        const data = await studioService.listStudioAssetTemplates(orgId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/asset-templates', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await studioService.createStudioAssetTemplate(orgId, req.authContext.userId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/races', async (req, res, next) => {
    try {
        const data = await studioService.listAvailableRaces(buildProjectScope(req), req.authContext);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/inventory-units', async (req, res, next) => {
    try {
        const scope = buildProjectScope(req);
        if (!scope.orgId) return orgIdRequiredResponse(req, res);
        const data = await studioService.listBindableInventoryUnits(scope, req.query);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/warehouse-locations', async (req, res, next) => {
    try {
        const scope = buildProjectScope(req);
        if (!scope.orgId) return orgIdRequiredResponse(req, res);
        const data = await studioService.listBindableWarehouseLocations(scope, req.query);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.post('/placements/:id/bind-inventory', async (req, res, next) => {
    try {
        const scope = buildProjectScope(req);
        if (!scope.orgId) return orgIdRequiredResponse(req, res);
        const data = await studioService.bindInventoryToPlacement(scope, req.authContext.userId, req.params.id, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/imports/warehouse/:warehouseId', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const warehouseId = Number(req.params.warehouseId);
        const data = await studioService.importWarehouseScene(orgId, warehouseId, {
            sceneType: req.query.sceneType,
            projectType: req.query.projectType,
        });
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

// ============ 资产库 API ============

/**
 * GET /api/app/3d-studio/assets
 * 列出可见的资产（组织 + 公共）
 */
router.get('/assets', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        const data = await assetService.listAssets(orgId, req.query);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/app/3d-studio/assets
 * 创建资产（含文件上传）
 */
router.post('/assets', assetService.assetUploadMiddleware.single('file'), async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);

        const data = await assetService.createAsset(orgId, req.authContext.userId, req.body, req.file);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/app/3d-studio/assets/:id
 * 获取资产详情
 */
router.get('/assets/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        const data = await assetService.getAsset(req.params.id, orgId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/app/3d-studio/assets/:id
 * 更新资产信息
 */
router.put('/assets/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        const data = await assetService.updateAsset(req.params.id, orgId, req.authContext.userId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/app/3d-studio/assets/:id
 * 删除资产
 */
router.delete('/assets/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        const data = await assetService.deleteAsset(req.params.id, orgId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/app/3d-studio/assets/:id/file
 * 下载资产文件
 */
router.get('/assets/:id/file', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        const fileData = await assetService.getAssetFile(req.params.id, orgId);

        if (!fileData) {
            return res.status(404).json({ success: false, message: '文件不存在' });
        }

        res.setHeader('Content-Type', fileData.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.fileName)}"`);
        res.send(fileData.buffer);
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/app/3d-studio/assets/:id/thumbnail
 * 获取资产缩略图
 */
router.get('/assets/:id/thumbnail', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        const thumbnailBuffer = await assetService.getThumbnail(req.params.id, orgId);

        if (!thumbnailBuffer) {
            return res.status(404).json({ success: false, message: '缩略图不存在' });
        }

        res.setHeader('Content-Type', 'image/png');
        res.send(thumbnailBuffer);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/app/3d-studio/assets/:id/thumbnail
 * 更新资产缩略图
 */
router.post('/assets/:id/thumbnail', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        const { thumbnail } = req.body;

        if (!thumbnail) {
            return res.status(400).json({ success: false, message: '需要提供缩略图数据' });
        }

        const data = await assetService.updateThumbnail(req.params.id, orgId, thumbnail);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

// ============ 资产实例 API ============

/**
 * GET /api/app/3d-studio/projects/:id/instances
 * 列出项目中的资产实例
 */
router.get('/projects/:id/instances', async (req, res, next) => {
    try {
        const data = await assetService.listInstances(req.params.id);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/app/3d-studio/projects/:id/instances
 * 创建资产实例
 */
router.post('/projects/:id/instances', async (req, res, next) => {
    try {
        const data = await assetService.createInstance(req.params.id, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/app/3d-studio/instances/:id
 * 更新资产实例
 */
router.put('/instances/:id', async (req, res, next) => {
    try {
        const data = await assetService.updateInstance(req.params.id, req.body.projectId, req.body);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/app/3d-studio/instances/:id
 * 删除资产实例
 */
router.delete('/instances/:id', async (req, res, next) => {
    try {
        const data = await assetService.deleteInstance(req.params.id, req.query.projectId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

export default router;
