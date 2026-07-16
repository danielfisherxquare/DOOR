import sharp from 'sharp';
import {
    assetKindFromMimeType,
    parseAssetChangePush,
    parseAssetFolderCreate,
    parseAssetFolderPatch,
    parseAssetListQuery,
    parseAssetPatch,
    parseAssetTagCreate,
    parseAssetTagPatch,
    parseAssetUploadComplete,
    parseAssetUploadInit,
    parseAssetVersionUploadInit,
} from '@arcspro/contracts/assets';
import * as repo from './asset.repository.js';
import * as storage from './asset.storage.js';
import { assetError, assetNotFound, assetValidation } from './asset.errors.js';

const PART_SIZE = Number(process.env.ASSET_UPLOAD_PART_SIZE || 8 * 1024 * 1024);
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

function parse(schemaParser, value) {
    try {
        return schemaParser(value);
    } catch (error) {
        throw assetValidation('素材请求参数不合法', error?.issues || error?.message);
    }
}

async function resolveLibraryAndFolder(context, input) {
    const library = input.libraryId
        ? await repo.getLibrary(context, input.libraryId)
        : await repo.ensureDefaultLibrary(context);
    if (!library) throw assetNotFound('素材库不存在');
    if (input.folderId && !(await repo.getFolder(context, input.folderId, library.id))) {
        throw assetNotFound('目标文件夹不存在');
    }
    return { library, folderId: input.folderId || null };
}

export async function getLibraryContext(context) {
    return repo.listContext(context);
}

export async function listAssets(context, rawQuery) {
    const query = parse(parseAssetListQuery, rawQuery);
    if (query.libraryId && !(await repo.getLibrary(context, query.libraryId))) throw assetNotFound('素材库不存在');
    return repo.listAssets(context, query);
}

function throwRevisionConflict(current) {
    throw assetError(409, 'ASSET_REVISION_CONFLICT', '内容已被其他成员修改', { current });
}

function translateConstraintError(error, message) {
    if (error?.code === '23505') throw assetValidation(message);
    throw error;
}

export async function createFolder(context, rawInput) {
    const input = parse(parseAssetFolderCreate, rawInput);
    const library = input.libraryId ? await repo.getLibrary(context, input.libraryId) : await repo.ensureDefaultLibrary(context);
    if (!library) throw assetNotFound('素材库不存在');
    if (input.parentId && !(await repo.getFolder(context, input.parentId, library.id))) throw assetNotFound('上级文件夹不存在');
    try {
        return await repo.createFolder(context, { ...input, libraryId: library.id });
    } catch (error) {
        translateConstraintError(error, '同一位置已存在同名文件夹');
    }
}

export async function updateFolder(context, folderId, rawPatch) {
    const patch = parse(parseAssetFolderPatch, rawPatch);
    const current = await repo.getFolder(context, folderId);
    if (!current) throw assetNotFound('文件夹不存在');
    if (patch.parentId === folderId) throw assetValidation('文件夹不能成为自己的上级');
    if (patch.parentId && !(await repo.getFolder(context, patch.parentId, current.library_id))) throw assetNotFound('上级文件夹不存在');
    if (patch.parentId && await repo.isFolderDescendant(context, folderId, patch.parentId)) throw assetValidation('不能把文件夹移动到自己的子文件夹中');
    try {
        const result = await repo.updateFolder(context, folderId, patch);
        if (result.status === 'not-found') throw assetNotFound('文件夹不存在');
        if (result.status === 'conflict') throwRevisionConflict(result.current);
        return result.folder;
    } catch (error) {
        translateConstraintError(error, '同一位置已存在同名文件夹');
    }
}

export async function deleteFolder(context, folderId, baseRevision) {
    const revision = Number(baseRevision);
    if (!Number.isInteger(revision) || revision < 1) throw assetValidation('baseRevision 必须是正整数');
    const result = await repo.deleteFolder(context, folderId, revision);
    if (result.status === 'not-found') throw assetNotFound('文件夹不存在');
    if (result.status === 'conflict') throwRevisionConflict(result.current);
    if (result.status === 'not-empty') throw assetError(409, 'ASSET_FOLDER_NOT_EMPTY', '请先移出文件夹内的素材和子文件夹', { childCount: result.childCount, assetCount: result.assetCount });
    return { id: folderId };
}

export async function createTag(context, rawInput) {
    const input = parse(parseAssetTagCreate, rawInput);
    try {
        return await repo.createTag(context, input);
    } catch (error) {
        translateConstraintError(error, '当前机构已存在同名标签');
    }
}

export async function updateTag(context, tagId, rawPatch) {
    const patch = parse(parseAssetTagPatch, rawPatch);
    try {
        const result = await repo.updateTag(context, tagId, patch);
        if (result.status === 'not-found') throw assetNotFound('标签不存在');
        if (result.status === 'conflict') throwRevisionConflict(result.current);
        return result.tag;
    } catch (error) {
        translateConstraintError(error, '当前机构已存在同名标签');
    }
}

export async function deleteTag(context, tagId, baseRevision) {
    const revision = Number(baseRevision);
    if (!Number.isInteger(revision) || revision < 1) throw assetValidation('baseRevision 必须是正整数');
    const result = await repo.deleteTag(context, tagId, revision);
    if (result.status === 'not-found') throw assetNotFound('标签不存在');
    if (result.status === 'conflict') throwRevisionConflict(result.current);
    return { id: tagId };
}

export async function initUpload(context, rawInput) {
    const input = parse(parseAssetUploadInit, rawInput);
    const existingUpload = await repo.findUploadByMutation(context, input.clientMutationId);
    if (existingUpload) {
        const asset = existingUpload.asset_id ? await repo.getAsset(context, existingUpload.asset_id) : null;
        return existingUpload.status === 'completed'
            ? { mode: 'deduplicated', uploadId: existingUpload.id, asset }
            : {
                mode: 'multipart',
                uploadId: existingUpload.id,
                partSize: Number(existingUpload.part_size),
                expectedParts: existingUpload.expected_parts,
                expiresAt: existingUpload.expires_at,
            };
    }
    const { library, folderId } = await resolveLibraryAndFolder(context, input);
    const object = await repo.findObject(context, input.sha256.toLowerCase(), input.size);
    const kind = assetKindFromMimeType(input.mimeType, input.fileName);
    if (object) {
        const result = await repo.createDeduplicatedAsset(context, {
            libraryId: library.id,
            folderId,
            objectId: object.id,
            fileName: input.fileName,
            mimeType: input.mimeType,
            size: input.size,
            sha256: input.sha256.toLowerCase(),
            clientMutationId: input.clientMutationId,
            kind,
            source: 'deduplicated',
        });
        return { mode: 'deduplicated', uploadId: result.upload.id, asset: result.asset };
    }

    const expectedParts = Math.ceil(input.size / PART_SIZE);
    const upload = await repo.createUpload(context, {
        libraryId: library.id,
        folderId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        sha256: input.sha256.toLowerCase(),
        partSize: PART_SIZE,
        expectedParts,
        clientMutationId: input.clientMutationId,
        expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
    });
    return { mode: 'multipart', uploadId: upload.id, partSize: PART_SIZE, expectedParts, expiresAt: upload.expires_at };
}

export async function initVersionUpload(context, assetId, rawInput) {
    const input = parse(parseAssetVersionUploadInit, rawInput);
    const existingUpload = await repo.findUploadByMutation(context, input.clientMutationId);
    if (existingUpload) {
        if (existingUpload.asset_id !== assetId) throw assetValidation('clientMutationId 已用于其他素材');
        const asset = existingUpload.asset_id ? await repo.getAsset(context, existingUpload.asset_id) : null;
        return existingUpload.status === 'completed'
            ? { mode: 'deduplicated', uploadId: existingUpload.id, asset }
            : { mode: 'multipart', uploadId: existingUpload.id, partSize: Number(existingUpload.part_size), expectedParts: existingUpload.expected_parts, expiresAt: existingUpload.expires_at };
    }
    const asset = await repo.getAsset(context, assetId);
    if (!asset || asset.deletedAt) throw assetNotFound();
    if (asset.revision !== input.baseRevision) throwRevisionConflict(asset);
    const object = await repo.findObject(context, input.sha256.toLowerCase(), input.size);
    const kind = assetKindFromMimeType(input.mimeType, input.fileName);
    if (object) {
        const result = await repo.createDeduplicatedVersion(context, {
            assetId,
            baseRevision: input.baseRevision,
            objectId: object.id,
            fileName: input.fileName,
            mimeType: input.mimeType,
            size: input.size,
            sha256: input.sha256.toLowerCase(),
            clientMutationId: input.clientMutationId,
            kind,
        });
        if (result.status === 'not-found') throw assetNotFound();
        if (result.status === 'conflict') throwRevisionConflict(result.current);
        return { mode: 'deduplicated', uploadId: result.upload.id, asset: result.asset };
    }
    const expectedParts = Math.ceil(input.size / PART_SIZE);
    const upload = await repo.createUpload(context, {
        libraryId: asset.libraryId,
        folderId: asset.folderId,
        assetId,
        baseRevision: input.baseRevision,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        sha256: input.sha256.toLowerCase(),
        partSize: PART_SIZE,
        expectedParts,
        clientMutationId: input.clientMutationId,
        expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
    });
    return { mode: 'multipart', uploadId: upload.id, partSize: PART_SIZE, expectedParts, expiresAt: upload.expires_at };
}

function assertUploadWritable(upload) {
    if (!upload) throw assetNotFound('上传任务不存在');
    if (new Date(upload.expires_at).getTime() <= Date.now()) throw assetError(410, 'ASSET_UPLOAD_EXPIRED', '上传任务已过期');
    if (!['pending', 'uploading'].includes(upload.status)) throw assetError(409, 'ASSET_UPLOAD_STATE_INVALID', `当前上传状态不允许写入: ${upload.status}`);
}

export async function uploadPart(context, uploadId, rawPartNumber, file) {
    const upload = await repo.getUpload(context, uploadId);
    assertUploadWritable(upload);
    const partNumber = Number(rawPartNumber);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > upload.expected_parts) {
        throw assetValidation('分片编号超出范围');
    }
    if (!file?.buffer?.length) throw assetValidation('分片内容为空');
    const isLast = partNumber === upload.expected_parts;
    if ((!isLast && file.buffer.length !== Number(upload.part_size)) || file.buffer.length > Number(upload.part_size)) {
        throw assetValidation('分片大小与上传协议不一致');
    }
    const saved = await storage.saveUploadPart({ uploadId, partNumber, buffer: file.buffer });
    const row = await repo.saveUploadPart(uploadId, { partNumber, ...saved });
    return { partNumber: row.part_number, etag: row.etag, size: Number(row.size) };
}

async function createThumbnail(assembled, upload) {
    if (!String(upload.mime_type).startsWith('image/')) return { thumbnailKey: null, width: null, height: null };
    const image = sharp(assembled.filePath, { failOn: 'none' });
    const metadata = await image.metadata();
    const buffer = await image.rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const thumbnailKey = storage.buildObjectKey({ orgId: upload.org_id, sha256: upload.sha256, suffix: 'thumbnail.webp' });
    await storage.putObjectBuffer({ objectKey: thumbnailKey, buffer, mimeType: 'image/webp' });
    return { thumbnailKey, width: metadata.width || null, height: metadata.height || null };
}

export async function completeUpload(context, uploadId, rawInput) {
    const input = parse(parseAssetUploadComplete, rawInput);
    const upload = await repo.getUpload(context, uploadId);
    if (!upload) throw assetNotFound('上传任务不存在');
    if (upload.status === 'completed' && upload.asset_id) return repo.getAsset(context, upload.asset_id);
    assertUploadWritable(upload);
    const storedParts = await repo.listUploadParts(uploadId);
    if (storedParts.length !== upload.expected_parts || input.parts.length !== upload.expected_parts) {
        throw assetValidation('上传分片不完整', { expected: upload.expected_parts, actual: storedParts.length });
    }
    for (let index = 0; index < storedParts.length; index += 1) {
        const stored = storedParts[index];
        const submitted = input.parts[index];
        if (stored.part_number !== submitted.partNumber || stored.etag !== submitted.etag) {
            throw assetValidation('分片校验失败', { partNumber: stored.part_number });
        }
    }

    let assembled;
    let objectKey;
    let thumbnailKey;
    let createdObject = false;
    try {
        assembled = await storage.assembleUpload({
            uploadId,
            parts: storedParts.map((part) => ({ ...part, tempPath: part.temp_path })),
        });
        if (assembled.size !== Number(upload.size) || assembled.sha256 !== upload.sha256) {
            await repo.markUploadFailed(context, uploadId);
            throw assetError(422, 'ASSET_HASH_MISMATCH', '完整文件的 SHA-256 与上传声明不一致', {
                expected: upload.sha256,
                actual: assembled.sha256,
            });
        }
        const existingObject = await repo.findObject(context, upload.sha256, upload.size);
        let media = { thumbnailKey: existingObject?.thumbnail_key || null, width: existingObject?.width || null, height: existingObject?.height || null };
        objectKey = existingObject?.object_key || storage.buildObjectKey({ orgId: context.orgId, sha256: upload.sha256 });
        if (!existingObject) {
            await storage.putObjectFromFile({ objectKey, filePath: assembled.filePath, size: assembled.size, mimeType: upload.mime_type });
            createdObject = true;
            media = await createThumbnail(assembled, upload);
            thumbnailKey = media.thumbnailKey;
        }
        const completed = await repo.completeUpload(context, upload, {
            objectKey,
            ...media,
            kind: assetKindFromMimeType(upload.mime_type, upload.file_name),
        });
        if (completed.status === 'not-found') throw assetNotFound();
        if (completed.status === 'conflict') throwRevisionConflict(completed.current);
        await storage.cleanupUpload(uploadId);
        return completed.asset;
    } catch (error) {
        if (error?.publicCode) {
            if (createdObject && objectKey) await storage.removeObject(objectKey).catch(() => {});
            if (thumbnailKey) await storage.removeObject(thumbnailKey).catch(() => {});
            throw error;
        }
        if (createdObject && objectKey) await storage.removeObject(objectKey).catch(() => {});
        if (thumbnailKey) await storage.removeObject(thumbnailKey).catch(() => {});
        throw assetError(503, 'ASSET_STORAGE_UNAVAILABLE', '素材存储暂时不可用', { cause: error?.message });
    }
}

export async function patchAsset(context, assetId, rawPatch) {
    const patch = parse(parseAssetPatch, rawPatch);
    const result = await repo.updateAsset(context, assetId, patch);
    if (result.status === 'not-found') throw assetNotFound();
    if (result.status === 'invalid-tags') throw assetValidation('标签不属于当前机构');
    if (result.status === 'conflict') throw assetError(409, 'ASSET_REVISION_CONFLICT', '素材已被其他成员修改', { currentAsset: result.current });
    return result.asset;
}

export async function deleteAsset(context, assetId, baseRevision) {
    const revision = Number(baseRevision);
    if (!Number.isInteger(revision) || revision < 1) throw assetValidation('baseRevision 必须是正整数');
    const result = await repo.softDeleteAsset(context, assetId, revision);
    if (result.status === 'not-found') throw assetNotFound();
    if (result.status === 'conflict') throw assetError(409, 'ASSET_REVISION_CONFLICT', '素材已被其他成员修改', { currentAsset: result.current });
    return { id: assetId, revision: result.revision };
}

export async function pullChanges(context, rawQuery) {
    const limit = Math.min(Math.max(Number(rawQuery.limit || 100), 1), 500);
    const result = await repo.listChanges(context, rawQuery.cursor, limit);
    return { ...result, serverTime: new Date().toISOString() };
}

export async function pushChanges(context, rawInput) {
    const input = parse(parseAssetChangePush, rawInput);
    const results = [];
    for (const change of input.changes) {
        if (change.operation === 'delete') results.push(await deleteAsset(context, change.assetId, change.baseRevision));
        else results.push(await patchAsset(context, change.assetId, { ...change.patch, baseRevision: change.baseRevision }));
    }
    return { clientMutationId: input.clientMutationId, results };
}

export async function getAssetBinary(context, assetId, variant = 'original') {
    const object = await repo.getAssetObject(context, assetId);
    if (!object || object.deleted_at) throw assetNotFound();
    const objectKey = variant === 'thumbnail' ? object.thumbnail_key : object.object_key;
    if (!objectKey) throw assetNotFound(variant === 'thumbnail' ? '缩略图尚未生成' : '素材文件不存在');
    try {
        return {
            stream: await storage.getObjectStream(objectKey),
            mimeType: variant === 'thumbnail' ? 'image/webp' : object.mime_type,
            fileName: object.name,
            size: variant === 'thumbnail' ? null : Number(object.size),
        };
    } catch (error) {
        throw assetError(503, 'ASSET_STORAGE_UNAVAILABLE', '素材存储暂时不可用', { cause: error?.message });
    }
}

export async function listAssetVersions(context, assetId) {
    const versions = await repo.listAssetVersions(context, assetId);
    if (!versions) throw assetNotFound();
    return { items: versions };
}

export async function getAssetVersionBinary(context, assetId, versionId) {
    const object = await repo.getAssetVersionObject(context, assetId, versionId);
    if (!object) throw assetNotFound('素材版本不存在');
    try {
        return {
            stream: await storage.getObjectStream(object.object_key),
            mimeType: object.mime_type,
            fileName: object.file_name,
            size: Number(object.size),
        };
    } catch (error) {
        throw assetError(503, 'ASSET_STORAGE_UNAVAILABLE', '素材存储暂时不可用', { cause: error?.message });
    }
}

export { PART_SIZE };
