import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

function resolveSafeTestDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
    const parsed = new URL(databaseUrl);
    const dbName = parsed.pathname.replace(/^\//, '');

    if (!/(^test$|_test$|test_)/i.test(dbName)) {
        throw new Error(`Refusing to run destructive tests against non-test database "${dbName}"`);
    }

    process.env.DATABASE_URL = databaseUrl;
    return databaseUrl;
}

const DATABASE_URL = resolveSafeTestDatabaseUrl();

const ONE_PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN6kAAAAASUVORK5CYII=',
    'base64'
);
const FILE_HASH = crypto.createHash('sha256').update(ONE_PIXEL_PNG).digest('hex');

const { default: knex } = await import('../src/db/knex.js');
const previewService = await import('../src/modules/reimbursement/preview.service.js');
const reimbursementService = await import('../src/modules/reimbursement/reimbursement.service.js');

describe('preview import deduplication', () => {
    let userId;
    let orgId;
    let projectId;

    before(async () => {
        await knex.migrate.latest();

        await knex('reimbursement_attachments').del();
        await knex('reimbursement_pending_matches').del();
        await knex('reimbursement_preview_files').del();
        await knex('reimbursement_processed_files').del();
        await knex('reimbursement_records').del();
        await knex('reimbursement_projects').del();
        await knex('reimbursement_user_settings').del();
        await knex('users').where('email', 'like', 'preview-service-%').del();
        await knex('organizations').where('slug', 'like', 'preview-service-%').del();

        const stamp = Date.now();
        const [organization] = await knex('organizations')
            .insert({
                name: 'Preview Service Test Org',
                slug: `preview-service-${stamp}`,
            })
            .returning('*');
        orgId = organization.id;

        const [user] = await knex('users')
            .insert({
                org_id: orgId,
                username: `preview-service-${stamp}`,
                email: `preview-service-${stamp}@test.local`,
                password_hash: 'hashed-password',
                role: 'org_admin',
            })
            .returning('*');
        userId = user.id;
    });

    beforeEach(async () => {
        const project = await reimbursementService.createProject(userId, orgId, {
            name: `Preview Dedupe Project ${Date.now()}`,
            description: 'test',
            shortName: 'PDP',
        });
        projectId = project.id;
    });

    afterEach(async () => {
        if (projectId) {
            await reimbursementService.deleteProject(projectId);
            projectId = null;
        }
    });

    after(async () => {
        await knex.destroy();
    });

    it('skips importing a duplicate that is already pending in preview', async () => {
        const firstImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'dup-preview.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');

        const secondImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'dup-preview.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');

        const storedPreviewFiles = await knex('reimbursement_preview_files')
            .where({ project_id: projectId, file_hash: FILE_HASH })
            .orderBy('created_at', 'asc');

        assert.equal(firstImport.imported.length, 1);
        assert.equal(firstImport.duplicates.length, 0);
        assert.equal(secondImport.imported.length, 0);
        assert.equal(secondImport.duplicates.length, 1);
        assert.equal(secondImport.duplicates[0].source, 'preview');
        assert.equal(secondImport.duplicates[0].previewFileId, firstImport.imported[0].id);
        assert.equal(secondImport.duplicates[0].recordId, null);
        assert.equal(storedPreviewFiles.length, 1);
    });

    it('blocks reimport while a preview-recognized record still exists, and allows it after record deletion', async () => {
        const initialImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'recognized-preview.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');
        const previewFileId = initialImport.imported[0].id;

        await knex('reimbursement_preview_files')
            .where({ id: previewFileId })
            .update({
                status: 'recognized',
                recognized_at: knex.fn.now(),
            });

        const [record] = await knex('reimbursement_records')
            .insert({
                project_id: projectId,
                user_id: userId,
                index: 1,
                payment_date: '2026-04-03',
                category: '交通费',
                sub_category: '打车费',
                description: '测试记录',
                expense: 10,
                has_invoice: true,
                preview_file_id: previewFileId,
            })
            .returning('*');

        const blockedImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'recognized-preview.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');

        await reimbursementService.deleteRecord(record.id);

        const allowedImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'recognized-preview.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');

        const storedPreviewFiles = await knex('reimbursement_preview_files')
            .where({ project_id: projectId, file_hash: FILE_HASH })
            .orderBy('created_at', 'asc');

        assert.equal(blockedImport.imported.length, 0);
        assert.equal(blockedImport.duplicates.length, 1);
        assert.equal(blockedImport.duplicates[0].source, 'record');
        assert.equal(blockedImport.duplicates[0].previewFileId, previewFileId);
        assert.equal(blockedImport.duplicates[0].recordId, record.id);
        assert.equal(blockedImport.duplicates[0].recordIndex, 1);
        assert.equal(allowedImport.imported.length, 1);
        assert.equal(allowedImport.duplicates.length, 0);
        assert.equal(storedPreviewFiles.length, 2);
    });

    it('blocks reimport when the same file is already attached through processed-file imports, and allows it after deletion', async () => {
        const [processedFile] = await knex('reimbursement_processed_files')
            .insert({
                project_id: projectId,
                file_name: 'processed-dup.png',
                file_type: 'invoice',
                file_hash: FILE_HASH,
                status: 'completed',
                original_path: 'C:/tmp/processed-dup-original.png',
                thumbnail_path: 'C:/tmp/processed-dup-thumb.jpg',
                ocr_result: { invoiceNumber: 'PROC-001' },
            })
            .returning('*');

        const fsModule = await import('fs');
        const originalReadFile = fsModule.default.promises.readFile;
        fsModule.default.promises.readFile = async (targetPath) => {
            if (targetPath === 'C:/tmp/processed-dup-thumb.jpg') {
                return Buffer.from('thumb');
            }
            return originalReadFile(targetPath);
        };

        let record;
        try {
            record = await reimbursementService.addRecord(projectId, userId, {
                payment_date: '2026-04-03',
                invoice_code: 'PROC-CODE',
                invoice_number: 'PROC-001',
                category: '交通费',
                sub_category: '打车费',
                description: '处理中心导入记录',
                expense: 20,
                has_invoice: true,
                processed_file_id: processedFile.id,
                file_type: 'invoice',
                file_name: processedFile.file_name,
                mime_type: 'image/png',
                file_size: ONE_PIXEL_PNG.length,
            });
        } finally {
            fsModule.default.promises.readFile = originalReadFile;
        }

        const blockedImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'processed-dup.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');

        await reimbursementService.deleteRecord(record.id);

        const allowedImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'processed-dup.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');

        assert.equal(blockedImport.imported.length, 0);
        assert.equal(blockedImport.duplicates.length, 1);
        assert.equal(blockedImport.duplicates[0].source, 'record');
        assert.equal(blockedImport.duplicates[0].previewFileId, null);
        assert.equal(blockedImport.duplicates[0].recordId, record.id);
        assert.equal(allowedImport.imported.length, 1);
        assert.equal(allowedImport.duplicates.length, 0);
    });

    it('blocks reimport when a recognized preview invoice has been merged into an existing payment record', async () => {
        const initialImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'merged-preview-invoice.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');
        const previewFileId = initialImport.imported[0].id;
        const previewFile = await knex('reimbursement_preview_files')
            .where({ id: previewFileId })
            .first();

        const paymentRecord = await reimbursementService.createStandalonePaymentRecord(projectId, userId, {
            amount: '10',
            date: '2026-04-03',
            category: '交通费',
            payee: '测试商户',
        });

        await knex('reimbursement_preview_files')
            .where({ id: previewFileId })
            .update({
                status: 'recognized',
                recognized_at: knex.fn.now(),
            });

        await knex('reimbursement_attachments')
            .insert({
                record_id: paymentRecord.id,
                file_name: previewFile.file_name,
                original_name: previewFile.original_name,
                file_type: 'invoice',
                file_size: previewFile.file_size,
                mime_type: previewFile.mime_type,
                thumbnail_data: previewFile.thumbnail_data,
                original_path: previewFile.original_path,
            });

        const blockedImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'merged-preview-invoice.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');

        assert.equal(blockedImport.imported.length, 0);
        assert.equal(blockedImport.duplicates.length, 1);
        assert.equal(blockedImport.duplicates[0].source, 'record');
        assert.equal(blockedImport.duplicates[0].previewFileId, previewFileId);
        assert.equal(blockedImport.duplicates[0].recordId, paymentRecord.id);
        assert.equal(blockedImport.duplicates[0].recordIndex, paymentRecord.index);
    });
});
