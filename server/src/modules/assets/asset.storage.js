import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const STORAGE_ROOT = path.resolve(process.env.ASSET_LIBRARY_STORAGE_PATH || 'storage/asset-library');
const TEMP_ROOT = path.join(STORAGE_ROOT, 'uploads');
const FILESYSTEM_OBJECT_ROOT = path.join(STORAGE_ROOT, 'objects');

function safeSegment(value) {
    const segment = String(value);
    if (!/^[a-zA-Z0-9._-]+$/.test(segment)) throw new TypeError('Unsafe storage path segment');
    return segment;
}

function localObjectPath(objectKey) {
    const target = path.resolve(FILESYSTEM_OBJECT_ROOT, objectKey);
    if (!target.startsWith(`${FILESYSTEM_OBJECT_ROOT}${path.sep}`)) {
        throw new TypeError('Unsafe object key');
    }
    return target;
}

async function ensureDirectory(directory) {
    await fsp.mkdir(directory, { recursive: true });
}

function providerName() {
    return (process.env.ASSET_OBJECT_STORAGE_PROVIDER || 'filesystem').toLowerCase();
}

let minioClientPromise;
async function getMinioClient() {
    if (!minioClientPromise) {
        minioClientPromise = import('minio').then(({ Client }) => new Client({
            endPoint: process.env.MINIO_ENDPOINT || 'minio',
            port: Number(process.env.MINIO_PORT || 9000),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'arcspro',
            secretKey: process.env.MINIO_SECRET_KEY || 'arcspro_dev_only',
        }));
    }
    return minioClientPromise;
}

async function ensureMinioBucket(client) {
    const bucket = process.env.MINIO_BUCKET || 'arcspro-assets';
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket);
    return bucket;
}

export function buildObjectKey({ orgId, sha256, suffix = 'original' }) {
    const org = safeSegment(orgId);
    const hash = safeSegment(sha256.toLowerCase());
    const safeSuffix = safeSegment(suffix);
    return `orgs/${org}/${hash.slice(0, 2)}/${hash}/${safeSuffix}`;
}

export async function saveUploadPart({ uploadId, partNumber, buffer }) {
    const uploadDirectory = path.join(TEMP_ROOT, safeSegment(uploadId));
    await ensureDirectory(uploadDirectory);
    const tempPath = path.join(uploadDirectory, `${Number(partNumber)}.part`);
    await fsp.writeFile(tempPath, buffer, { mode: 0o600 });
    return {
        tempPath,
        size: buffer.length,
        etag: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
}

export async function assembleUpload({ uploadId, parts }) {
    const outputPath = path.join(TEMP_ROOT, safeSegment(uploadId), 'assembled.bin');
    await ensureDirectory(path.dirname(outputPath));
    const output = fs.createWriteStream(outputPath, { mode: 0o600 });
    const hash = crypto.createHash('sha256');
    let size = 0;

    for (const part of parts) {
        const input = fs.createReadStream(part.tempPath);
        for await (const chunk of input) {
            size += chunk.length;
            hash.update(chunk);
            if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve));
        }
    }
    await new Promise((resolve, reject) => {
        output.end(resolve);
        output.on('error', reject);
    });
    return { filePath: outputPath, size, sha256: hash.digest('hex') };
}

export async function putObjectFromFile({ objectKey, filePath, size, mimeType }) {
    if (providerName() === 'minio') {
        const client = await getMinioClient();
        const bucket = await ensureMinioBucket(client);
        await client.fPutObject(bucket, objectKey, filePath, { 'Content-Type': mimeType });
        return { provider: 'minio', objectKey, size };
    }
    const target = localObjectPath(objectKey);
    await ensureDirectory(path.dirname(target));
    await fsp.copyFile(filePath, target);
    return { provider: 'filesystem', objectKey, size };
}

export async function putObjectBuffer({ objectKey, buffer, mimeType }) {
    if (providerName() === 'minio') {
        const client = await getMinioClient();
        const bucket = await ensureMinioBucket(client);
        await client.putObject(bucket, objectKey, buffer, buffer.length, { 'Content-Type': mimeType });
        return;
    }
    const target = localObjectPath(objectKey);
    await ensureDirectory(path.dirname(target));
    await fsp.writeFile(target, buffer, { mode: 0o600 });
}

export async function getObjectStream(objectKey) {
    if (providerName() === 'minio') {
        const client = await getMinioClient();
        const bucket = await ensureMinioBucket(client);
        return client.getObject(bucket, objectKey);
    }
    return fs.createReadStream(localObjectPath(objectKey));
}

export async function objectExists(objectKey) {
    if (providerName() === 'minio') {
        const client = await getMinioClient();
        const bucket = await ensureMinioBucket(client);
        try {
            await client.statObject(bucket, objectKey);
            return true;
        } catch (error) {
            if (error?.statusCode === 404 || ['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(error?.code)) return false;
            throw error;
        }
    }
    try {
        await fsp.access(localObjectPath(objectKey), fs.constants.R_OK);
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
    }
}

export async function removeObject(objectKey) {
    if (!objectKey) return;
    if (providerName() === 'minio') {
        const client = await getMinioClient();
        const bucket = await ensureMinioBucket(client);
        await client.removeObject(bucket, objectKey);
        return;
    }
    await fsp.rm(localObjectPath(objectKey), { force: true });
}

export async function cleanupUpload(uploadId) {
    await fsp.rm(path.join(TEMP_ROOT, safeSegment(uploadId)), { recursive: true, force: true });
}

export async function streamObjectToResponse(stream, response) {
    await pipeline(stream, response);
}

export const storageRuntime = Object.freeze({
    provider: providerName(),
    root: STORAGE_ROOT,
});
