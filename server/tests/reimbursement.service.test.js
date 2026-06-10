import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

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

const { default: knex } = await import('../src/db/knex.js');
const reimbursementService = await import('../src/modules/reimbursement/reimbursement.service.js');

describe('reimbursement payment persistence', () => {
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
        await knex('users').where('email', 'like', 'reimbursement-service-%').del();
        await knex('organizations').where('slug', 'like', 'reimbursement-service-%').del();

        const [organization] = await knex('organizations')
            .insert({
                name: 'Reimbursement Service Test Org',
                slug: `reimbursement-service-${Date.now()}`,
            })
            .returning('*');
        orgId = organization.id;

        const [user] = await knex('users')
            .insert({
                org_id: orgId,
                username: `reimbursement-service-${Date.now()}`,
                email: `reimbursement-service-${Date.now()}@test.local`,
                password_hash: 'hashed-password',
                role: 'org_admin',
            })
            .returning('*');
        userId = user.id;

        const project = await reimbursementService.createProject(userId, orgId, {
            name: 'Payment Record Project',
            description: 'test',
            shortName: 'PRJ',
        });
        projectId = project.id;
    });

    after(async () => {
        await knex.destroy();
    });

    it('creates a standalone payment record and updates project totals', async () => {
        const record = await reimbursementService.createStandalonePaymentRecord(projectId, userId, {
            amount: '128.50',
            date: '2026 年 4 月 3 日',
            category: '交通费',
            payee: '上海虹桥站',
        });

        const storedRecord = await knex('reimbursement_records')
            .select('*', knex.raw('payment_date::text as payment_date_text'))
            .where({ id: record.id })
            .first();
        const project = await knex('reimbursement_projects')
            .where({ id: projectId })
            .first();

        assert.equal(storedRecord.project_id, projectId);
        assert.equal(storedRecord.user_id, userId);
        assert.equal(storedRecord.payment_date_text, '2026-04-03');
        assert.equal(storedRecord.category, '交通费');
        assert.equal(storedRecord.sub_category, '付款凭证');
        assert.equal(storedRecord.description, '上海虹桥站');
        assert.equal(Number(storedRecord.expense), 128.5);
        assert.equal(storedRecord.has_invoice, false);
        assert.equal(storedRecord.company, '上海虹桥站');
        assert.equal(storedRecord.remarks, '由付款凭证识别生成');

        assert.equal(project.record_count, 1);
        assert.equal(Number(project.total_expense), 128.5);
    });

    it('persists uploaded payment proof files and attaches them to the created record', async () => {
        const [processedFile] = await knex('reimbursement_processed_files')
            .insert({
                project_id: projectId,
                file_name: `payment-${Date.now()}.png`,
                file_type: 'payment',
                file_hash: `hash-${Date.now()}`,
                status: 'completed',
            })
            .returning('*');

        const storedPaths = await reimbursementService.persistProcessedPaymentUpload(projectId, processedFile.id, {
            fileBuffer: ONE_PIXEL_PNG,
            mimeType: 'image/png',
            originalName: 'payment-proof.png',
        });

        const record = await reimbursementService.createStandalonePaymentRecord(projectId, userId, {
            amount: '88.00',
            date: '2026-04-04',
            category: '餐费',
            payee: '测试商户',
        });

        const attachment = await reimbursementService.attachProcessedPayment(record.id, {
            processedFileId: processedFile.id,
            fileName: 'payment-proof.png',
            originalName: 'payment-proof.png',
            mimeType: 'image/png',
            fileSize: ONE_PIXEL_PNG.length,
        });

        const storedAttachment = await knex('reimbursement_attachments')
            .where({ id: attachment.id })
            .first();

        assert.ok(storedPaths.originalPath);
        assert.ok(storedPaths.thumbnailPath);
        assert.equal(storedAttachment.record_id, record.id);
        assert.equal(storedAttachment.file_type, 'payment');
        assert.equal(storedAttachment.original_name, 'payment-proof.png');
        assert.equal(storedAttachment.mime_type, 'image/png');
        assert.equal(Number(storedAttachment.file_size), ONE_PIXEL_PNG.length);
        assert.equal(storedAttachment.original_path, storedPaths.originalPath);
        assert.ok(storedAttachment.thumbnail_data);
    });

    it('deduplicates by file hash instead of file name', async () => {
        const first = await reimbursementService.startProcessingFile(projectId, userId, {
            fileName: 'same-name.png',
            fileType: 'payment',
            fileHash: 'hash-a',
        });
        const second = await reimbursementService.startProcessingFile(projectId, userId, {
            fileName: 'same-name.png',
            fileType: 'payment',
            fileHash: 'hash-b',
        });
        const duplicate = await reimbursementService.startProcessingFile(projectId, userId, {
            fileName: 'renamed.png',
            fileType: 'payment',
            fileHash: 'hash-a',
        });

        assert.equal(first.skipped, false);
        assert.equal(second.skipped, false);
        assert.equal(duplicate.skipped, true);
        assert.ok(duplicate.record);
        assert.equal(duplicate.record.status, 'skipped');

        const stored = await knex('reimbursement_processed_files')
            .where({ project_id: projectId, file_name: 'same-name.png' })
            .orderBy('processed_at', 'asc');

        assert.equal(stored.length, 2);
        assert.equal(stored[0].file_hash, 'hash-a');
        assert.equal(stored[1].file_hash, 'hash-b');
    });

    it('serializes concurrent processing claims for the same file hash', async () => {
        const fileHash = `concurrent-hash-${Date.now()}`;

        const results = await Promise.all([
            reimbursementService.startProcessingFile(projectId, userId, {
                fileName: 'concurrent-a.png',
                fileType: 'invoice',
                fileHash,
            }),
            reimbursementService.startProcessingFile(projectId, userId, {
                fileName: 'concurrent-b.png',
                fileType: 'invoice',
                fileHash,
            }),
        ]);

        const activeClaims = results.filter(result => !result.skipped);
        const skippedClaims = results.filter(result => result.skipped);
        const stored = await knex('reimbursement_processed_files')
            .where({ project_id: projectId, file_hash: fileHash, file_type: 'invoice' })
            .orderBy('processed_at', 'asc');

        assert.equal(activeClaims.length, 1);
        assert.equal(skippedClaims.length, 1);
        assert.equal(skippedClaims[0].existing.id, activeClaims[0].record.id);
        assert.deepEqual(stored.map(row => row.status).sort(), ['processing', 'skipped']);
    });

    it('allows retry after a previous OCR processing error', async () => {
        const fileHash = `retry-error-hash-${Date.now()}`;
        const first = await reimbursementService.startProcessingFile(projectId, userId, {
            fileName: 'retry-error.png',
            fileType: 'payment',
            fileHash,
        });

        await reimbursementService.updateProcessingStatus(first.record.id, 'error', {
            errorMessage: 'upstream timeout',
        });

        const retry = await reimbursementService.startProcessingFile(projectId, userId, {
            fileName: 'retry-error-again.png',
            fileType: 'payment',
            fileHash,
        });

        assert.equal(first.skipped, false);
        assert.equal(retry.skipped, false);
        assert.notEqual(retry.record.id, first.record.id);
    });

    it('stores error messages when processing status is updated to error', async () => {
        const { record } = await reimbursementService.startProcessingFile(projectId, userId, {
            fileName: `error-${Date.now()}.png`,
            fileType: 'payment',
            fileHash: `error-hash-${Date.now()}`,
        });

        await reimbursementService.updateProcessingStatus(record.id, 'error', {
            errorMessage: 'OCR upstream timeout',
        });

        const stored = await knex('reimbursement_processed_files')
            .where({ id: record.id })
            .first();

        assert.equal(stored.status, 'error');
        assert.equal(stored.error_message, 'OCR upstream timeout');
    });

    it('persists invoice code and invoice number for manually added records', async () => {
        const record = await reimbursementService.addRecord(projectId, userId, {
            payment_date: '2026-04-05',
            invoice_code: '123456789012',
            invoice_number: '87654321',
            category: '交通费',
            sub_category: '高铁费',
            description: '上海-杭州 高铁',
            expense: 66,
            company: '测试购票方',
            has_invoice: true,
        });

        const stored = await knex('reimbursement_records')
            .where({ id: record.id })
            .first();

        assert.equal(stored.invoice_code, '123456789012');
        assert.equal(stored.invoice_number, '87654321');
    });

    it('attaches processed invoice files when importing invoice records', async () => {
        const [processedFile] = await knex('reimbursement_processed_files')
            .insert({
                project_id: projectId,
                file_name: `invoice-${Date.now()}.png`,
                file_type: 'invoice',
                file_hash: `invoice-hash-${Date.now()}`,
                status: 'completed',
                original_path: 'C:/tmp/invoice-original.png',
                thumbnail_path: 'C:/tmp/invoice-thumb.jpg',
                ocr_result: { invoiceNumber: 'INV-001' },
            })
            .returning('*');

        const invoiceThumbBuffer = Buffer.from('invoice-thumb');
        const fsModule = await import('fs');
        const originalReadFileFn = fsModule.default.promises.readFile;
        fsModule.default.promises.readFile = async (targetPath) => {
            if (targetPath === 'C:/tmp/invoice-thumb.jpg') {
                return invoiceThumbBuffer;
            }
            return originalReadFileFn(targetPath);
        };

        try {
            const record = await reimbursementService.addRecord(projectId, userId, {
                payment_date: '2026-04-06',
                invoice_code: 'INV-CODE-01',
                invoice_number: 'INV-001',
                category: '住宿费',
                sub_category: '酒店',
                description: '测试酒店',
                expense: 300,
                company: '测试酒店',
                has_invoice: true,
                processed_file_id: processedFile.id,
                file_type: 'invoice',
                file_name: processedFile.file_name,
                mime_type: 'image/png',
                file_size: 1234,
            });

            const attachment = await knex('reimbursement_attachments')
                .where({ record_id: record.id, file_type: 'invoice' })
                .first();

            assert.equal(attachment.original_path, 'C:/tmp/invoice-original.png');
            assert.equal(attachment.invoice_number, 'INV-001');
            assert.deepEqual(attachment.thumbnail_data, invoiceThumbBuffer);
        } finally {
            fsModule.default.promises.readFile = originalReadFileFn;
        }
    });

    it('merges an imported invoice into an existing payment record and reuses the same index', async () => {
        const paymentRecord = await reimbursementService.createStandalonePaymentRecord(projectId, userId, {
            amount: '88.00',
            date: '2026-04-07',
            category: '交通费',
            payee: '滴滴出行',
        });

        const countAfterPayment = await knex('reimbursement_records')
            .where({ project_id: projectId })
            .count('* as count')
            .first();

        const [processedFile] = await knex('reimbursement_processed_files')
            .insert({
                project_id: projectId,
                file_name: `invoice-merge-${Date.now()}.png`,
                file_type: 'invoice',
                file_hash: `invoice-merge-hash-${Date.now()}`,
                status: 'completed',
                original_path: 'C:/tmp/invoice-merge-original.png',
                thumbnail_path: 'C:/tmp/invoice-merge-thumb.jpg',
                ocr_result: { invoiceNumber: 'MERGE-001' },
            })
            .returning('*');

        const mergeThumbBuffer = Buffer.from('merge-thumb');
        const fsModule = await import('fs');
        const originalReadFileFn = fsModule.default.promises.readFile;
        fsModule.default.promises.readFile = async (targetPath) => {
            if (targetPath === 'C:/tmp/invoice-merge-thumb.jpg') {
                return mergeThumbBuffer;
            }
            return originalReadFileFn(targetPath);
        };

        try {
            const mergedRecord = await reimbursementService.addRecord(projectId, userId, {
                payment_date: '2026-04-07',
                invoice_code: 'MERGE-CODE',
                invoice_number: 'MERGE-001',
                category: '交通费',
                sub_category: '打车费',
                description: '滴滴出行行程单',
                expense: 88,
                company: '滴滴出行',
                has_invoice: true,
                processed_file_id: processedFile.id,
                file_type: 'invoice',
                file_name: processedFile.file_name,
                mime_type: 'image/png',
                file_size: 456,
            });

            const countAfterMerge = await knex('reimbursement_records')
                .where({ project_id: projectId })
                .count('* as count')
                .first();
            const storedRecord = await knex('reimbursement_records')
                .where({ id: paymentRecord.id })
                .first();
            const invoiceAttachment = await knex('reimbursement_attachments')
                .where({ record_id: paymentRecord.id, file_type: 'invoice' })
                .first();

            assert.equal(mergedRecord.id, paymentRecord.id);
            assert.equal(mergedRecord.index, paymentRecord.index);
            assert.equal(Number(countAfterMerge.count), Number(countAfterPayment.count));
            assert.equal(storedRecord.has_invoice, true);
            assert.equal(storedRecord.invoice_code, 'MERGE-CODE');
            assert.equal(storedRecord.invoice_number, 'MERGE-001');
            assert.equal(storedRecord.sub_category, '打车费');
            assert.equal(storedRecord.description, '滴滴出行行程单');
            assert.ok(invoiceAttachment);
            assert.equal(invoiceAttachment.invoice_number, 'MERGE-001');
            assert.deepEqual(invoiceAttachment.thumbnail_data, mergeThumbBuffer);
        } finally {
            fsModule.default.promises.readFile = originalReadFileFn;
        }
    });

    it('refreshes grouped payment review metadata after merging an invoice', async () => {
        const paymentRecord = await reimbursementService.createStandalonePaymentRecord(
            projectId,
            userId,
            {
                amount: '88.00',
                category: '交通费',
                subCategory: '打车费',
                payee: '滴滴出行',
            },
            {
                ocrMeta: {
                    modelCallCount: 1,
                    usage: { totalTokens: 420 },
                },
            }
        );

        assert.equal(paymentRecord.ocr_meta.review.status, 'needs_review');

        const merged = await reimbursementService.mergeInvoiceIntoRecord(
            paymentRecord.id,
            {
                date: '2026-04-07',
                invoiceNumber: 'MERGE-REFRESH-001',
                category: '交通费',
                subCategory: '打车费',
                details: '滴滴出行行程单',
                amount: 88,
                buyer: '滴滴出行',
            },
            {
                ocrMeta: {
                    modelCallCount: 1,
                    usage: { totalTokens: 510 },
                },
            }
        );

        assert.equal(merged.ocr_meta.payment.modelCallCount, 1);
        assert.equal(merged.ocr_meta.payment.usage.totalTokens, 420);
        assert.equal(merged.ocr_meta.payment.review.status, 'ready');
        assert.equal(merged.ocr_meta.payment.review.issueCount, 0);
        assert.equal(merged.ocr_meta.invoice.review.status, 'ready');
    });

    it('reorders record indexes after category and sub-category changes', async () => {
        const hotelRecord = await reimbursementService.addRecord(projectId, userId, {
            payment_date: '2026-04-08',
            category: '住宿费',
            sub_category: '酒店',
            description: '酒店住宿',
            expense: 300,
            has_invoice: true,
        });
        const taxiRecord = await reimbursementService.addRecord(projectId, userId, {
            payment_date: '2026-04-09',
            category: '交通费',
            sub_category: '打车费',
            description: '机场打车',
            expense: 80,
            has_invoice: true,
        });

        const initialRecords = await knex('reimbursement_records')
            .where({ project_id: projectId })
            .whereIn('id', [hotelRecord.id, taxiRecord.id])
            .orderBy('index', 'asc');

        assert.equal(initialRecords[0].id, taxiRecord.id);
        assert.equal(initialRecords[1].id, hotelRecord.id);
        assert.ok(initialRecords[0].index < initialRecords[1].index);

        await reimbursementService.updateRecord(hotelRecord.id, {
            category: '办公费',
            sub_category: '办公用品',
            payment_date: '2026-04-07',
        });

        const reorderedRecords = await knex('reimbursement_records')
            .where({ project_id: projectId })
            .whereIn('id', [hotelRecord.id, taxiRecord.id])
            .orderBy('index', 'asc');

        assert.equal(reorderedRecords[0].id, hotelRecord.id);
        assert.equal(reorderedRecords[1].id, taxiRecord.id);
        assert.ok(reorderedRecords[0].index < reorderedRecords[1].index);
    });

    it('updates every business field exposed by the reimbursement table editor', async () => {
        const record = await reimbursementService.addRecord(projectId, userId, {
            payment_date: '2026-04-10',
            category: '办公费',
            sub_category: '办公用品',
            description: '原摘要',
            expense: 42,
            reporter: '原报销人',
            has_invoice: false,
            company: '原公司',
            unit: '项',
            quantity: 1,
        });

        await reimbursementService.updateRecord(record.id, {
            description: '新摘要',
            reporter: '新报销人',
            has_invoice: true,
            company: '新公司',
            unit: '张',
            quantity: 2,
        });

        const stored = await knex('reimbursement_records')
            .where({ id: record.id })
            .first();

        assert.equal(stored.description, '新摘要');
        assert.equal(stored.reporter, '新报销人');
        assert.equal(stored.has_invoice, true);
        assert.equal(stored.company, '新公司');
        assert.equal(stored.unit, '张');
        assert.equal(stored.quantity, 2);
    });

    it('refreshes OCR review metadata when an operator fixes missing invoice fields', async () => {
        const [record] = await knex('reimbursement_records')
            .insert({
                project_id: projectId,
                user_id: userId,
                index: 1,
                payment_date: '2026-04-11',
                category: '办公费',
                sub_category: '办公用品',
                description: '复核测试',
                expense: 42,
                company: '测试公司',
                has_invoice: true,
                ocr_meta: {
                    modelCallCount: 1,
                    durationMs: 1200,
                    usage: { totalTokens: 960 },
                    review: {
                        status: 'needs_review',
                        issueCount: 1,
                        issues: [
                            {
                                field: 'invoice_number',
                                code: 'missing_invoice_identifier',
                                label: '发票号码',
                                message: '识别结果缺少发票号码或发票代码',
                            },
                        ],
                    },
                },
            })
            .returning('*');

        await reimbursementService.updateRecord(record.id, {
            invoice_number: 'INV-20260411-001',
        });

        const stored = await knex('reimbursement_records')
            .where({ id: record.id })
            .first();

        assert.equal(stored.ocr_meta.modelCallCount, 1);
        assert.equal(stored.ocr_meta.usage.totalTokens, 960);
        assert.equal(stored.ocr_meta.review.status, 'ready');
        assert.equal(stored.ocr_meta.review.issueCount, 0);
        assert.deepEqual(stored.ocr_meta.review.issues, []);
    });

    it('refreshes OCR review metadata after batch field fixes', async () => {
        const records = await knex('reimbursement_records')
            .insert([
                {
                    project_id: projectId,
                    user_id: userId,
                    index: 1,
                    payment_date: '2026-04-12',
                    description: '批量复核测试 A',
                    expense: 64,
                    company: '测试公司',
                    has_invoice: true,
                    invoice_number: 'INV-A',
                    ocr_meta: {
                        modelCallCount: 1,
                        review: {
                            status: 'needs_review',
                            issueCount: 2,
                            issues: [
                                { field: 'category', code: 'missing_category', label: '大类', message: '识别结果缺少费用大类' },
                                { field: 'sub_category', code: 'missing_sub_category', label: '子类', message: '识别结果缺少费用子类' },
                            ],
                        },
                    },
                },
                {
                    project_id: projectId,
                    user_id: userId,
                    index: 2,
                    payment_date: '2026-04-12',
                    description: '批量复核测试 B',
                    expense: 88,
                    company: '测试公司',
                    has_invoice: true,
                    invoice_number: 'INV-B',
                    ocr_meta: {
                        modelCallCount: 1,
                        review: {
                            status: 'needs_review',
                            issueCount: 1,
                            issues: [
                                { field: 'category', code: 'missing_category', label: '大类', message: '识别结果缺少费用大类' },
                            ],
                        },
                    },
                },
            ])
            .returning('*');

        await reimbursementService.batchUpdateRecords(
            records.map((record) => record.id),
            { category: '办公费', sub_category: '耗材' }
        );

        const stored = await knex('reimbursement_records')
            .whereIn('id', records.map((record) => record.id))
            .orderBy('index', 'asc');

        assert.equal(stored[0].ocr_meta.modelCallCount, 1);
        assert.equal(stored[0].ocr_meta.review.status, 'ready');
        assert.equal(stored[0].ocr_meta.review.issueCount, 0);
        assert.deepEqual(stored[0].ocr_meta.review.issues, []);
        assert.equal(stored[1].ocr_meta.review.status, 'ready');
        assert.equal(stored[1].ocr_meta.review.issueCount, 0);
    });
});
