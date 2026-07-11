import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import axios from 'axios';

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
const originalAxiosPost = axios.post;

function extractZipEntry(zipBuffer, matcher) {
    const eocdSignature = 0x06054b50;
    let eocdOffset = -1;

    for (let offset = zipBuffer.length - 22; offset >= 0; offset -= 1) {
        if (zipBuffer.readUInt32LE(offset) === eocdSignature) {
            eocdOffset = offset;
            break;
        }
    }

    if (eocdOffset === -1) {
        throw new Error('ZIP end of central directory not found');
    }

    const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
    let centralOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

    for (let i = 0; i < entryCount; i += 1) {
        assert.equal(zipBuffer.readUInt32LE(centralOffset), 0x02014b50);

        const compressionMethod = zipBuffer.readUInt16LE(centralOffset + 10);
        const compressedSize = zipBuffer.readUInt32LE(centralOffset + 20);
        const fileNameLength = zipBuffer.readUInt16LE(centralOffset + 28);
        const extraLength = zipBuffer.readUInt16LE(centralOffset + 30);
        const commentLength = zipBuffer.readUInt16LE(centralOffset + 32);
        const localHeaderOffset = zipBuffer.readUInt32LE(centralOffset + 42);
        const fileName = zipBuffer
            .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
            .toString('utf8');

        if (matcher(fileName)) {
            assert.equal(zipBuffer.readUInt32LE(localHeaderOffset), 0x04034b50);
            const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
            const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
            const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
            const compressed = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);

            if (compressionMethod === 0) return compressed;
            if (compressionMethod === 8) return inflateRawSync(compressed);
            throw new Error(`Unsupported ZIP compression method ${compressionMethod}`);
        }

        centralOffset += 46 + fileNameLength + extraLength + commentLength;
    }

    return null;
}

function listZipEntryNames(zipBuffer) {
    const eocdSignature = 0x06054b50;
    let eocdOffset = -1;

    for (let offset = zipBuffer.length - 22; offset >= 0; offset -= 1) {
        if (zipBuffer.readUInt32LE(offset) === eocdSignature) {
            eocdOffset = offset;
            break;
        }
    }

    if (eocdOffset === -1) {
        throw new Error('ZIP end of central directory not found');
    }

    const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
    let centralOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
    const names = [];

    for (let i = 0; i < entryCount; i += 1) {
        assert.equal(zipBuffer.readUInt32LE(centralOffset), 0x02014b50);

        const fileNameLength = zipBuffer.readUInt16LE(centralOffset + 28);
        const extraLength = zipBuffer.readUInt16LE(centralOffset + 30);
        const commentLength = zipBuffer.readUInt16LE(centralOffset + 32);
        const fileName = zipBuffer
            .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
            .toString('utf8');

        names.push(fileName);
        centralOffset += 46 + fileNameLength + extraLength + commentLength;
    }

    return names;
}

function mockPreviewInvoiceOcrResponse() {
    axios.post = async () => ({
        data: {
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            date: '2026-05-11',
                            category: '办公费',
                            subCategory: '办公用品',
                            itemName: '文件夹',
                            amount: 35,
                            buyer: '广西赛事公司',
                            seller: '南宁文具店',
                            details: [{ name: '文件夹', quantity: 1, amount: 35 }],
                        }),
                    },
                },
            ],
            usage: {
                prompt_tokens: 900,
                completion_tokens: 70,
                total_tokens: 970,
            },
        },
    });
}

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
        axios.post = originalAxiosPost;
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
        axios.post = originalAxiosPost;
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

    it('skips importing a duplicate that is currently being recognized', async () => {
        const firstImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'dup-processing.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');
        const previewFileId = firstImport.imported[0].id;

        await knex('reimbursement_preview_files')
            .where({ id: previewFileId })
            .update({ status: 'ocr_processing' });

        const secondImport = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'dup-processing.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');

        const storedPreviewFiles = await knex('reimbursement_preview_files')
            .where({ project_id: projectId, file_hash: FILE_HASH });

        assert.equal(secondImport.imported.length, 0);
        assert.equal(secondImport.duplicates.length, 1);
        assert.equal(secondImport.duplicates[0].source, 'preview');
        assert.equal(secondImport.duplicates[0].previewFileId, previewFileId);
        assert.equal(storedPreviewFiles.length, 1);
    });

    it('blocks discarding a preview file while OCR is in progress', async () => {
        const imported = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'discard-processing.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');
        const previewFileId = imported.imported[0].id;

        await knex('reimbursement_preview_files')
            .where({ id: previewFileId })
            .update({ status: 'ocr_processing' });

        await assert.rejects(
            previewService.discardPreviewFile(projectId, previewFileId),
            /正在识别/
        );

        const previewFile = await knex('reimbursement_preview_files')
            .where({ id: previewFileId })
            .first();
        const stats = await previewService.getPreviewStats(projectId);

        assert.equal(previewFile.status, 'ocr_processing');
        assert.equal(stats.processing, 1);
        assert.equal(stats.total, 1);
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

    it('stores OCR token usage and review issues on preview files and created reimbursement records', async () => {
        mockPreviewInvoiceOcrResponse();
        const imported = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'preview-ocr-meta.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');
        const previewFileId = imported.imported[0].id;

        const result = await previewService.recognizeFromPreview(projectId, userId, previewFileId, {
            provider: 'paid-provider',
            baseUrl: 'https://8.8.8.8/v1',
            apiKey: 'paid-key',
            modelName: 'paid-model',
        });

        const [previewFile, record] = await Promise.all([
            knex('reimbursement_preview_files').where({ id: previewFileId }).first(),
            knex('reimbursement_records').where({ id: result.recordId }).first(),
        ]);

        assert.equal(result.success, true);
        assert.equal(result.ocrMeta.usage.totalTokens, 970);
        assert.equal(previewFile.ocr_meta.modelCallCount, 1);
        assert.equal(previewFile.ocr_meta.usage.totalTokens, 970);
        assert.equal(record.ocr_meta.modelCallCount, 1);
        assert.equal(record.ocr_meta.usage.totalTokens, 970);
        assert.equal(result.ocrMeta.review.status, 'needs_review');
        assert.equal(result.ocrMeta.review.issueCount, 1);
        assert.deepEqual(result.ocrMeta.review.issues.map((issue) => issue.code), ['missing_invoice_identifier']);
        assert.equal(previewFile.ocr_meta.review.status, 'needs_review');
        assert.equal(record.ocr_meta.review.status, 'needs_review');
    });

    it('allows only one paid OCR call when the same preview file is submitted twice concurrently', async () => {
        const imported = await previewService.importToPreview(projectId, userId, [{
            buffer: ONE_PIXEL_PNG,
            originalname: 'concurrent-preview-ocr.png',
            mimetype: 'image/png',
            size: ONE_PIXEL_PNG.length,
        }], 'invoice');
        const previewFileId = imported.imported[0].id;
        const calls = [];

        axios.post = async () => {
            calls.push(Date.now());
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
                data: {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    date: '2026-05-12',
                                    category: '办公费',
                                    subCategory: '办公用品',
                                    itemName: '纸张',
                                    amount: 42,
                                    buyer: '广西赛事公司',
                                    seller: '南宁文具店',
                                    details: [{ name: '纸张', quantity: 1, amount: 42 }],
                                }),
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 880,
                        completion_tokens: 66,
                        total_tokens: 946,
                    },
                },
            };
        };

        const results = await Promise.allSettled([
            previewService.recognizeFromPreview(projectId, userId, previewFileId, {
                provider: 'paid-provider',
                baseUrl: 'https://8.8.8.8/v1',
                apiKey: 'paid-key',
                modelName: 'paid-model',
            }),
            previewService.recognizeFromPreview(projectId, userId, previewFileId, {
                provider: 'paid-provider',
                baseUrl: 'https://8.8.8.8/v1',
                apiKey: 'paid-key',
                modelName: 'paid-model',
            }),
        ]);

        const successful = results.filter((result) => result.status === 'fulfilled' && result.value.success);
        const rejected = results.filter((result) => result.status === 'rejected');
        const [{ count }] = await knex('reimbursement_records')
            .where({ project_id: projectId })
            .count({ count: '*' });

        assert.equal(calls.length, 1);
        assert.equal(successful.length, 1);
        assert.equal(rejected.length, 1);
        assert.match(rejected[0].reason.message, /正在识别|已识别/);
        assert.equal(Number(count), 1);
    });

    it('uses the final export attachment name inside the Excel attachment column', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'door-reimbursement-export-'));
        const attachmentPath = path.join(tempDir, 'original.pdf');

        await fs.writeFile(attachmentPath, ONE_PIXEL_PNG);

        try {
            const [record] = await knex('reimbursement_records')
                .insert({
                    project_id: projectId,
                    user_id: userId,
                    index: 1,
                    payment_date: '2026-01-13',
                    invoice_number: '265100001',
                    category: '日常运营',
                    sub_category: '日常运营',
                    description: '测试发票',
                    expense: 450,
                    reporter: '张三',
                    has_invoice: true,
                    company: '测试公司',
                })
                .returning('*');

            await knex('reimbursement_attachments')
                .insert({
                    record_id: record.id,
                    file_name: '450.pdf',
                    original_name: '450.pdf',
                    file_type: 'invoice',
                    file_size: ONE_PIXEL_PNG.length,
                    mime_type: 'application/pdf',
                    original_path: attachmentPath,
                });

            const zipBuffer = await previewService.generateExportZip(projectId, '测试项目');
            const exportedAttachmentName = listZipEntryNames(zipBuffer)
                .find((entryName) => entryName.startsWith('发票图片/'));
            assert.ok(exportedAttachmentName);

            const exportedAttachment = extractZipEntry(zipBuffer, (entryName) => entryName === exportedAttachmentName);
            assert.ok(exportedAttachment);

            const excelBuffer = extractZipEntry(zipBuffer, (entryName) => entryName.endsWith('_支出明细表.xlsx'));
            assert.ok(excelBuffer);

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(excelBuffer);
            const sheet = workbook.getWorksheet('项目支出具体明细表');

            assert.equal(sheet.getCell('P3').value, `1. ${path.basename(exportedAttachmentName)}`);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it('keeps duplicate generated attachment names unique in the ZIP and Excel export', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'door-reimbursement-export-'));
        const firstAttachmentPath = path.join(tempDir, 'first.pdf');
        const secondAttachmentPath = path.join(tempDir, 'second.pdf');

        await fs.writeFile(firstAttachmentPath, Buffer.from('first-attachment'));
        await fs.writeFile(secondAttachmentPath, Buffer.from('second-attachment'));

        try {
            const [record] = await knex('reimbursement_records')
                .insert({
                    project_id: projectId,
                    user_id: userId,
                    index: 1,
                    payment_date: '2026-01-15',
                    invoice_number: '265100002',
                    category: '日常运营',
                    sub_category: '日常运营',
                    description: '重复命名测试发票',
                    expense: 450,
                    reporter: '张三',
                    has_invoice: true,
                    company: '测试公司',
                })
                .returning('*');

            await knex('reimbursement_attachments')
                .insert([
                    {
                        record_id: record.id,
                        file_name: 'same.pdf',
                        original_name: 'same.pdf',
                        file_type: 'invoice',
                        file_size: 16,
                        mime_type: 'application/pdf',
                        original_path: firstAttachmentPath,
                    },
                    {
                        record_id: record.id,
                        file_name: 'same.pdf',
                        original_name: 'same.pdf',
                        file_type: 'invoice',
                        file_size: 17,
                        mime_type: 'application/pdf',
                        original_path: secondAttachmentPath,
                    },
                ]);

            const zipBuffer = await previewService.generateExportZip(projectId, '测试项目');
            const exportedAttachmentNames = listZipEntryNames(zipBuffer)
                .filter((entryName) => entryName.startsWith('发票图片/'));
            const exportedBaseNames = exportedAttachmentNames.map((entryName) => path.basename(entryName));

            assert.equal(exportedAttachmentNames.length, 2);
            assert.equal(new Set(exportedAttachmentNames).size, 2);
            assert.equal(new Set(exportedBaseNames).size, 2);

            const excelBuffer = extractZipEntry(zipBuffer, (entryName) => entryName.endsWith('_支出明细表.xlsx'));
            assert.ok(excelBuffer);

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(excelBuffer);
            const sheet = workbook.getWorksheet('项目支出具体明细表');

            assert.deepEqual(
                String(sheet.getCell('P3').value).split('\n'),
                exportedBaseNames.map((baseName, index) => `${index + 1}. ${baseName}`)
            );
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it('adds an expense total row to the exported Excel workbook', async () => {
        await knex('reimbursement_records')
            .insert([
                {
                    project_id: projectId,
                    user_id: userId,
                    index: 1,
                    payment_date: '2026-01-13',
                    category: '日常运营',
                    sub_category: '日常运营',
                    description: '发票 450',
                    expense: 450,
                    has_invoice: true,
                },
                {
                    project_id: projectId,
                    user_id: userId,
                    index: 2,
                    payment_date: '2026-01-14',
                    category: '日常运营',
                    sub_category: '日常运营',
                    description: '发票 130',
                    expense: 130,
                    has_invoice: true,
                },
            ]);

        const zipBuffer = await previewService.generateExportZip(projectId, '测试项目');
        const excelBuffer = extractZipEntry(zipBuffer, (entryName) => entryName.endsWith('_支出明细表.xlsx'));
        assert.ok(excelBuffer);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(excelBuffer);
        const sheet = workbook.getWorksheet('项目支出具体明细表');
        const totalRowNumber = 5;

        assert.equal(sheet.getCell(`A${totalRowNumber}`).value, '费用总计');
        assert.equal(Number(sheet.getCell(`L${totalRowNumber}`).value), 580);
    });

    it('adds an export check worksheet with row-level risks', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'door-reimbursement-export-check-'));
        const firstAttachmentPath = path.join(tempDir, 'first.png');
        const thirdAttachmentPath = path.join(tempDir, 'third.png');

        await fs.writeFile(firstAttachmentPath, ONE_PIXEL_PNG);
        await fs.writeFile(thirdAttachmentPath, ONE_PIXEL_PNG);

        try {
            const [reviewRecord, missingRecord, duplicateRecord] = await knex('reimbursement_records')
                .insert([
                    {
                        project_id: projectId,
                        user_id: userId,
                        index: 1,
                        payment_date: '2026-01-13',
                        invoice_number: 'DUP-001',
                        category: '交通费',
                        sub_category: '打车费',
                        description: '机场打车',
                        expense: 88,
                        reporter: '张三',
                        has_invoice: true,
                        company: '',
                        ocr_meta: {
                            review: {
                                status: 'needs_review',
                                issueCount: 1,
                                issues: [{ field: 'company', label: '开票公司', message: '缺少开票公司' }],
                            },
                        },
                    },
                    {
                        project_id: projectId,
                        user_id: userId,
                        index: 2,
                        payment_date: null,
                        invoice_number: '',
                        category: '',
                        sub_category: '餐费',
                        description: '晚餐',
                        expense: 0,
                        reporter: '',
                        has_invoice: true,
                        company: '餐厅',
                    },
                    {
                        project_id: projectId,
                        user_id: userId,
                        index: 3,
                        payment_date: '2026-01-14',
                        invoice_number: 'DUP-001',
                        category: '交通费',
                        sub_category: '打车费',
                        description: '市内打车',
                        expense: 66,
                        reporter: '李四',
                        has_invoice: true,
                        company: '出租车公司',
                    },
                    {
                        project_id: projectId,
                        user_id: userId,
                        index: 4,
                        payment_date: '2026-01-15',
                        invoice_number: '',
                        category: '办公费',
                        sub_category: '耗材',
                        description: '打印纸',
                        expense: 128,
                        reporter: '王五',
                        has_invoice: false,
                        company: '文具店',
                    },
                ])
                .returning('*');

            await knex('reimbursement_attachments')
                .insert([
                    {
                        record_id: reviewRecord.id,
                        file_name: 'first.png',
                        original_name: 'first.png',
                        file_type: 'invoice',
                        file_size: ONE_PIXEL_PNG.length,
                        mime_type: 'image/png',
                        original_path: firstAttachmentPath,
                    },
                    {
                        record_id: duplicateRecord.id,
                        file_name: 'third.png',
                        original_name: 'third.png',
                        file_type: 'invoice',
                        file_size: ONE_PIXEL_PNG.length,
                        mime_type: 'image/png',
                        original_path: thirdAttachmentPath,
                    },
                ]);

            const zipBuffer = await previewService.generateExportZip(projectId, '测试项目');
            const excelBuffer = extractZipEntry(zipBuffer, (entryName) => entryName.endsWith('_支出明细表.xlsx'));
            assert.ok(excelBuffer);

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(excelBuffer);
            const checkSheet = workbook.getWorksheet('导出检查');
            assert.ok(checkSheet);

            const exportedText = [];
            checkSheet.eachRow((row) => {
                exportedText.push(row.values.filter(Boolean).join('|'));
            });
            const joined = exportedText.join('\n');

            assert.match(joined, /第1行/);
            assert.match(joined, /OCR复核/);
            assert.match(joined, /缺少开票公司/);
            assert.match(joined, /第2行/);
            assert.match(joined, /缺少日期、大类、金额、报销人、发票号码\/代码/);
            assert.match(joined, /缺少发票附件/);
            assert.match(joined, /DUP-001/);
            assert.match(joined, /第4行/);
            assert.match(joined, /缺少付款凭证附件/);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it('includes export checks in the Excel-only workbook', async () => {
        await knex('reimbursement_records')
            .insert({
                project_id: projectId,
                user_id: userId,
                index: 1,
                payment_date: null,
                invoice_number: '',
                category: '',
                sub_category: '餐费',
                description: '晚餐',
                expense: 0,
                reporter: '',
                has_invoice: true,
                company: '餐厅',
            });

        const excelBuffer = await previewService.generateExportWorkbook(projectId);
        assert.ok(excelBuffer);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(excelBuffer);

        const detailSheet = workbook.getWorksheet('项目支出具体明细表');
        const checkSheet = workbook.getWorksheet('导出检查');

        assert.ok(detailSheet);
        assert.ok(checkSheet);

        const exportedText = [];
        checkSheet.eachRow((row) => {
            exportedText.push(row.values.filter(Boolean).join('|'));
        });

        const joined = exportedText.join('\n');
        assert.match(joined, /第1行/);
        assert.match(joined, /关键字段/);
        assert.match(joined, /缺少日期、大类、金额、报销人、发票号码\/代码/);
        assert.match(joined, /缺少发票附件/);
    });

    it('uses attachment metadata without reading attachment bytes for Excel-only export', async () => {
        const [record] = await knex('reimbursement_records')
            .insert({
                project_id: projectId,
                user_id: userId,
                index: 1,
                payment_date: '2026-01-13',
                invoice_number: '265100003',
                category: '日常运营',
                sub_category: '日常运营',
                description: '元数据附件测试',
                expense: 450,
                reporter: '张三',
                has_invoice: true,
                company: '测试公司',
            })
            .returning('*');

        await knex('reimbursement_attachments')
            .insert({
                record_id: record.id,
                file_name: 'missing-file.pdf',
                original_name: 'missing-file.pdf',
                file_type: 'invoice',
                file_size: 123,
                mime_type: 'application/pdf',
                original_path: path.join(os.tmpdir(), 'door-missing-export-attachment.pdf'),
            });

        const excelBuffer = await previewService.generateExportWorkbook(projectId);
        assert.ok(excelBuffer);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(excelBuffer);

        const detailSheet = workbook.getWorksheet('项目支出具体明细表');
        const attachmentCellValue = String(detailSheet.getCell('P3').value);
        assert.match(attachmentCellValue, /^1\. 发票-1-/);
        assert.match(attachmentCellValue, /265100003/);
        assert.match(attachmentCellValue, /450元\.pdf$/);

        const checkSheet = workbook.getWorksheet('导出检查');
        const exportedText = [];
        checkSheet.eachRow((row) => {
            exportedText.push(row.values.filter(Boolean).join('|'));
        });

        assert.doesNotMatch(exportedText.join('\n'), /缺少发票附件/);
    });
});
