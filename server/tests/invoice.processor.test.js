import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
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

resolveSafeTestDatabaseUrl();

const originalAxiosPost = axios.post;
const { default: knex } = await import('../src/db/knex.js');
const reimbursementService = await import('../src/modules/reimbursement/reimbursement.service.js');
const {
    processInvoiceWithProgress,
    updateInvoiceOCR,
} = await import('../src/modules/reimbursement/invoice.processor.js');

const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=',
    'base64'
);

function mockInvoiceOcrResponse() {
    axios.post = async () => ({
        data: {
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            date: '2026-05-10',
                            category: '办公费',
                            subCategory: '办公用品',
                            itemName: '打印纸',
                            amount: 88,
                            buyer: '广西赛事公司',
                            seller: '南宁办公用品店',
                            details: [{ name: '打印纸', quantity: 1, amount: 88 }],
                        }),
                    },
                },
            ],
            usage: {
                prompt_tokens: 1200,
                completion_tokens: 80,
                total_tokens: 1280,
            },
        },
    });
}

async function resetReimbursementTables() {
    await knex('reimbursement_attachments').del();
    await knex('reimbursement_pending_matches').del();
    await knex('reimbursement_preview_files').del();
    await knex('reimbursement_processed_files').del();
    await knex('reimbursement_records').del();
    await knex('reimbursement_projects').del();
    await knex('reimbursement_user_settings').del();
    await knex('users').where('email', 'like', 'invoice-processor-%').del();
    await knex('organizations').where('slug', 'like', 'invoice-processor-%').del();
}

describe('invoice processor OCR observability', () => {
    let userId;
    let orgId;
    let projectId;

    before(async () => {
        await knex.migrate.latest();
    });

    beforeEach(async () => {
        await resetReimbursementTables();
        axios.post = originalAxiosPost;

        const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const [organization] = await knex('organizations')
            .insert({
                name: 'Invoice Processor Test Org',
                slug: `invoice-processor-${stamp}`,
            })
            .returning('*');
        orgId = organization.id;

        const [user] = await knex('users')
            .insert({
                org_id: orgId,
                username: `invoice-processor-${stamp}`,
                email: `invoice-processor-${stamp}@test.local`,
                password_hash: 'hashed-password',
                role: 'org_admin',
            })
            .returning('*');
        userId = user.id;

        const project = await reimbursementService.createProject(userId, orgId, {
            name: 'Processor Observability Project',
            description: 'test',
            shortName: 'POP',
        });
        projectId = project.id;
    });

    after(async () => {
        axios.post = originalAxiosPost;
        await resetReimbursementTables();
        await knex.destroy();
    });

    it('stores OCR token usage and latency on the processed invoice record', async () => {
        mockInvoiceOcrResponse();
        const fileHash = crypto.createHash('sha256').update(onePixelPng).digest('hex');
        const [processedFile] = await knex('reimbursement_processed_files')
            .insert({
                project_id: projectId,
                file_name: 'invoice-observability.png',
                file_type: 'invoice',
                file_hash: fileHash,
                status: 'processing',
                started_at: knex.fn.now(),
            })
            .returning('*');

        await processInvoiceWithProgress({
            projectId,
            invoiceId: processedFile.id,
            fileBuffer: onePixelPng,
            mimeType: 'image/png',
            originalName: 'invoice-observability.png',
            config: {
                provider: 'paid-provider',
                baseUrl: 'https://paid.example/v1',
                apiKey: 'paid-key',
                modelName: 'paid-model',
            },
        });

        const stored = await knex('reimbursement_processed_files')
            .where({ id: processedFile.id })
            .first();
        const ocrCompletedLog = stored.processing_log.find((entry) => entry.step === 'ocr_processing' && entry.usage);

        assert.equal(stored.status, 'completed');
        assert.equal(stored.ocr_meta.modelCallCount, 1);
        assert.equal(stored.ocr_meta.usage.totalTokens, 1280);
        assert.ok(stored.ocr_meta.durationMs >= 0);
        assert.equal(stored.ocr_meta.review.status, 'needs_review');
        assert.deepEqual(stored.ocr_meta.review.issues.map((issue) => issue.code), ['missing_invoice_identifier']);
        assert.equal(ocrCompletedLog.usage.totalTokens, 1280);
        assert.equal(ocrCompletedLog.modelCallCount, 1);
    });

    it('refreshes OCR review metadata when a processed invoice result is corrected', async () => {
        const [processedFile] = await knex('reimbursement_processed_files')
            .insert({
                project_id: projectId,
                file_name: 'invoice-review-correction.png',
                file_type: 'invoice',
                file_hash: crypto.createHash('sha256').update('invoice-review-correction').digest('hex'),
                status: 'completed',
                ocr_result: {
                    amount: 88,
                    date: '2026-05-10',
                    buyer: '广西赛事公司',
                    category: '办公费',
                    subCategory: '办公用品',
                },
                ocr_meta: {
                    modelCallCount: 1,
                    usage: {
                        totalTokens: 1280,
                    },
                    durationMs: 1200,
                    review: {
                        status: 'needs_review',
                        issueCount: 1,
                        issues: [{ code: 'missing_invoice_identifier' }],
                    },
                },
                started_at: knex.fn.now(),
                processed_at: knex.fn.now(),
            })
            .returning('*');

        const correctedOcrResult = {
            amount: 88,
            date: '2026-05-10',
            invoiceNumber: '25123456789012345678',
            buyer: '广西赛事公司',
            category: '办公费',
            subCategory: '办公用品',
        };

        const result = await updateInvoiceOCR(processedFile.id, correctedOcrResult);

        const stored = await knex('reimbursement_processed_files')
            .where({ id: processedFile.id })
            .first();

        assert.equal(result.success, true);
        assert.equal(result.ocrMeta.review.status, 'ready');
        assert.equal(result.ocrMeta.review.issueCount, 0);
        assert.deepEqual(result.ocrMeta.review.issues, []);
        assert.equal(stored.ocr_result.invoiceNumber, '25123456789012345678');
        assert.equal(stored.ocr_meta.usage.totalTokens, 1280);
        assert.equal(stored.ocr_meta.review.status, 'ready');
    });
});
