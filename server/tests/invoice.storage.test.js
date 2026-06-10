import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
    saveInvoiceFile,
} from '../src/modules/reimbursement/invoice.storage.js';

const ONE_PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN6kAAAAASUVORK5CYII=',
    'base64'
);

const createdProjectIds = [];

afterEach(async () => {
    await Promise.all(createdProjectIds.splice(0).map(async (projectId) => {
        const dir = path.resolve('storage', 'invoices', projectId);
        await fs.rm(dir, { recursive: true, force: true });
    }));
});

describe('invoice file storage', () => {
    it('stores PNG originals with a PNG extension and JPEG thumbnails at the path readers expect', async () => {
        const projectId = `storage-test-${Date.now()}`;
        const invoiceId = 'png-upload';
        createdProjectIds.push(projectId);

        const result = await saveInvoiceFile(projectId, invoiceId, ONE_PIXEL_PNG, 'receipt.png', 'image/png');

        assert.equal(path.basename(result.originalPath), 'original.png');
        assert.equal(path.basename(result.thumbnailPath), 'thumbnail.jpg');
        assert.ok(result.savedFiles.includes(result.originalPath));
        assert.ok(result.savedFiles.includes(result.thumbnailPath));

        await assert.doesNotReject(() => fs.access(result.originalPath));
        await assert.doesNotReject(() => fs.access(result.thumbnailPath));
    });
});
