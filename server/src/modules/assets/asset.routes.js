import { Router } from 'express';
import multer from 'multer';
import { resolveAssetContext } from './asset.context.js';
import * as service from './asset.service.js';
import { getAssetPreview } from './asset-preview.service.js';
import { streamObjectToResponse } from './asset.storage.js';

const router = Router();
const partUpload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: service.PART_SIZE + 1024 },
});

router.get('/context', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getLibraryContext(resolveAssetContext(req)) });
    } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.listAssets(resolveAssetContext(req), req.query) });
    } catch (error) { next(error); }
});

router.post('/folders', async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.createFolder(resolveAssetContext(req), req.body) });
    } catch (error) { next(error); }
});

router.patch('/folders/:folderId', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.updateFolder(resolveAssetContext(req), req.params.folderId, req.body) });
    } catch (error) { next(error); }
});

router.delete('/folders/:folderId', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.deleteFolder(resolveAssetContext(req), req.params.folderId, req.query.baseRevision) });
    } catch (error) { next(error); }
});

router.post('/tags', async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.createTag(resolveAssetContext(req), req.body) });
    } catch (error) { next(error); }
});

router.patch('/tags/:tagId', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.updateTag(resolveAssetContext(req), req.params.tagId, req.body) });
    } catch (error) { next(error); }
});

router.delete('/tags/:tagId', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.deleteTag(resolveAssetContext(req), req.params.tagId, req.query.baseRevision) });
    } catch (error) { next(error); }
});

router.post('/uploads/init', async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.initUpload(resolveAssetContext(req), req.body) });
    } catch (error) { next(error); }
});

router.post('/:assetId/versions/uploads/init', async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.initVersionUpload(resolveAssetContext(req), req.params.assetId, req.body) });
    } catch (error) { next(error); }
});

router.post('/uploads/:uploadId/parts', partUpload.single('part'), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.uploadPart(resolveAssetContext(req), req.params.uploadId, req.body.partNumber, req.file) });
    } catch (error) { next(error); }
});

router.post('/uploads/:uploadId/complete', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.completeUpload(resolveAssetContext(req), req.params.uploadId, req.body) });
    } catch (error) { next(error); }
});

router.get('/sync', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.pullChanges(resolveAssetContext(req), req.query) });
    } catch (error) { next(error); }
});

router.post('/sync/changes', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.pushChanges(resolveAssetContext(req), req.body) });
    } catch (error) { next(error); }
});

router.get('/:assetId/preview', async (req, res, next) => {
    try {
        const binary = await getAssetPreview(resolveAssetContext(req), req.params.assetId);
        res.setHeader('Content-Type', binary.mimeType);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(binary.fileName)}`);
        res.setHeader('Cache-Control', 'private, max-age=86400');
        await streamObjectToResponse(binary.stream, res);
    } catch (error) { next(error); }
});

router.get('/:assetId/download', async (req, res, next) => {
    try {
        const binary = await service.getAssetBinary(resolveAssetContext(req), req.params.assetId);
        res.setHeader('Content-Type', binary.mimeType);
        if (binary.size) res.setHeader('Content-Length', String(binary.size));
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(binary.fileName)}`);
        await streamObjectToResponse(binary.stream, res);
    } catch (error) { next(error); }
});

router.get('/:assetId/versions', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.listAssetVersions(resolveAssetContext(req), req.params.assetId) });
    } catch (error) { next(error); }
});

router.get('/:assetId/versions/:versionId/download', async (req, res, next) => {
    try {
        const binary = await service.getAssetVersionBinary(resolveAssetContext(req), req.params.assetId, req.params.versionId);
        res.setHeader('Content-Type', binary.mimeType);
        res.setHeader('Content-Length', String(binary.size));
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(binary.fileName)}`);
        await streamObjectToResponse(binary.stream, res);
    } catch (error) { next(error); }
});

router.get('/:assetId/thumbnail', async (req, res, next) => {
    try {
        const binary = await service.getAssetBinary(resolveAssetContext(req), req.params.assetId, 'thumbnail');
        res.setHeader('Content-Type', binary.mimeType);
        res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
        await streamObjectToResponse(binary.stream, res);
    } catch (error) { next(error); }
});

router.patch('/:assetId', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.patchAsset(resolveAssetContext(req), req.params.assetId, req.body) });
    } catch (error) { next(error); }
});

router.delete('/:assetId', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.deleteAsset(resolveAssetContext(req), req.params.assetId, req.query.baseRevision) });
    } catch (error) { next(error); }
});

export default router;
