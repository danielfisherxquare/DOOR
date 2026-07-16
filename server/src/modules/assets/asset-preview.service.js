import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import * as repo from './asset.repository.js';
import * as storage from './asset.storage.js';
import { assetError, assetNotFound } from './asset.errors.js';

const execFileAsync = promisify(execFile);
const PREVIEW_TIMEOUT_MS = Number(process.env.ASSET_PREVIEW_TIMEOUT_MS || 45_000);
const PREVIEW_MAX_BYTES = Number(process.env.ASSET_PREVIEW_MAX_BYTES || 256 * 1024 * 1024);
const POSTSCRIPT_EXTENSIONS = new Set(['ai', 'eps', 'ps']);
const RAW_EXTENSIONS = new Set(['rw2', 'nef', 'dng', 'crw', 'cr3', 'cr2', 'arw']);
const RASTER_EXTENSIONS = new Set([
    'psd', 'psb', 'psdt', 'heic', 'heif', 'tif', 'tiff', 'tga', 'hdr', 'exr', 'dds',
    'ppm', 'pnm', 'pgm', 'pdd', 'pcx', 'pbm', 'pam', 'mpo', 'mng', 'miff',
    'jpx', 'jps', 'jpf', 'jpc', 'jp2', 'j2k', 'j2c', 'dib', 'cur', 'cin', 'wmf', 'emf',
]);

function extensionOf(fileName) {
    const extension = path.extname(String(fileName || '')).slice(1).toLowerCase();
    return /^[a-z0-9]{1,12}$/.test(extension) ? extension : '';
}

export function previewPlanFor({ fileName, mimeType }) {
    const extension = extensionOf(fileName);
    const mime = String(mimeType || '').toLowerCase();
    if (POSTSCRIPT_EXTENSIONS.has(extension) || ['application/postscript', 'application/illustrator'].includes(mime)) {
        return { converter: 'ghostscript', sourceExtension: extension || 'ps', outputExtension: 'webp', mimeType: 'image/webp' };
    }
    if (RAW_EXTENSIONS.has(extension)) {
        return { converter: 'libraw', sourceExtension: extension, outputExtension: 'webp', mimeType: 'image/webp' };
    }
    if (RASTER_EXTENSIONS.has(extension) || mime === 'image/vnd.adobe.photoshop' || mime === 'image/heic' || mime === 'image/heif') {
        return { converter: 'imagemagick', sourceExtension: extension || 'bin', outputExtension: 'webp', mimeType: 'image/webp' };
    }
    return null;
}

async function run(command, args) {
    await execFileAsync(command, args, {
        timeout: PREVIEW_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
    });
}

async function convertPreview(plan, sourcePath, outputPath, tempDirectory) {
    if (plan.converter === 'ghostscript') {
        const vectorPng = path.join(tempDirectory, 'vector.png');
        await run('gs', [
            '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dEPSCrop',
            '-dFirstPage=1', '-dLastPage=1', '-r144', '-sDEVICE=pngalpha',
            `-sOutputFile=${vectorPng}`, sourcePath,
        ]);
        await run('magick', [vectorPng, '-auto-orient', '-thumbnail', '2000x2000>', '-strip', '-quality', '88', outputPath]);
        return;
    }
    if (plan.converter === 'libraw') {
        const decodedTiff = path.join(tempDirectory, 'raw.tiff');
        await run('dcraw_emu', ['-T', '-w', '-O', decodedTiff, sourcePath]);
        await run('magick', [decodedTiff, '-auto-orient', '-thumbnail', '2000x2000>', '-strip', '-quality', '88', outputPath]);
        return;
    }
    await run('magick', [
        `${sourcePath}[0]`, '-auto-orient', '-thumbnail', '2000x2000>',
        '-strip', '-quality', '88', outputPath,
    ]);
}

function previewUnavailable() {
    return assetError(503, 'ASSET_PREVIEW_UNAVAILABLE', '暂时无法生成该素材的预览，请稍后重试或下载原文件');
}

export async function getAssetPreview(context, assetId) {
    const object = await repo.getAssetObject(context, assetId);
    if (!object || object.deleted_at) throw assetNotFound();
    const plan = previewPlanFor({ fileName: object.name, mimeType: object.mime_type });
    if (!plan) throw assetError(422, 'ASSET_PREVIEW_UNSUPPORTED', '该文件格式暂不支持浏览器预览');
    if (Number(object.size) > PREVIEW_MAX_BYTES) {
        throw assetError(422, 'ASSET_PREVIEW_TOO_LARGE', `文件超过预览上限（${Math.floor(PREVIEW_MAX_BYTES / 1024 / 1024)} MB）`);
    }

    const previewKey = storage.buildObjectKey({
        orgId: context.orgId,
        sha256: object.sha256,
        suffix: `preview.${plan.outputExtension}`,
    });
    try {
        if (await storage.objectExists(previewKey)) {
            return { stream: await storage.getObjectStream(previewKey), mimeType: plan.mimeType, fileName: object.name };
        }
    } catch {
        throw previewUnavailable();
    }

    const tempDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'arcspro-preview-'));
    const sourcePath = path.join(tempDirectory, `source.${plan.sourceExtension}`);
    const outputPath = path.join(tempDirectory, `preview.${plan.outputExtension}`);
    try {
        await pipeline(await storage.getObjectStream(object.object_key), fs.createWriteStream(sourcePath, { mode: 0o600 }));
        await convertPreview(plan, sourcePath, outputPath, tempDirectory);
        const output = await fsp.stat(outputPath);
        if (!output.isFile() || output.size === 0) throw new Error('Preview converter returned an empty file');
        await storage.putObjectFromFile({ objectKey: previewKey, filePath: outputPath, size: output.size, mimeType: plan.mimeType });
        return { stream: await storage.getObjectStream(previewKey), mimeType: plan.mimeType, fileName: object.name };
    } catch {
        throw previewUnavailable();
    } finally {
        await fsp.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    }
}
