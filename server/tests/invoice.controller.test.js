import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import ExcelJS from 'exceljs';

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

const { default: knex } = await import('../src/db/knex.js');
const reimbursementService = await import('../src/modules/reimbursement/reimbursement.service.js');
const {
    uploadAndProcessInvoice,
    uploadAndProcessPayment,
} = await import('../src/modules/reimbursement/invoice.controller.js');
const {
    exportExcel,
    resolveOcrConfig,
} = await import('../src/modules/reimbursement/reimbursement.controller.js');
const { env } = await import('../src/config/env.js');

function createMockResponse() {
    return {
        statusCode: 200,
        body: null,
        rawBody: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        end(payload) {
            this.rawBody = payload;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

async function resetReimbursementTables() {
    await knex('reimbursement_attachments').del();
    await knex('reimbursement_pending_matches').del();
    await knex('reimbursement_preview_files').del();
    await knex('reimbursement_processed_files').del();
    await knex('reimbursement_records').del();
    await knex('reimbursement_projects').del();
    await knex('reimbursement_user_settings').del();
    await knex('users').where('email', 'like', 'invoice-controller-%').del();
    await knex('organizations').where('slug', 'like', 'invoice-controller-%').del();
}

describe('invoice async upload controller', () => {
    let userId;
    let orgId;
    let projectId;

    before(async () => {
        await knex.migrate.latest();
    });

    beforeEach(async () => {
        await resetReimbursementTables();

        const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const [organization] = await knex('organizations')
            .insert({
                name: 'Invoice Controller Test Org',
                slug: `invoice-controller-${stamp}`,
            })
            .returning('*');
        orgId = organization.id;

        const [user] = await knex('users')
            .insert({
                org_id: orgId,
                username: `invoice-controller-${stamp}`,
                email: `invoice-controller-${stamp}@test.local`,
                password_hash: 'hashed-password',
                role: 'org_admin',
            })
            .returning('*');
        userId = user.id;

        const project = await reimbursementService.createProject(userId, orgId, {
            name: 'Async Upload Project',
            description: 'test',
            shortName: 'AUP',
        });
        projectId = project.id;
    });

    after(async () => {
        await resetReimbursementTables();
        await knex.destroy();
    });

    it('skips duplicate invoice uploads before requiring OCR config', async () => {
        const fileBuffer = Buffer.from('duplicate invoice bytes');
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const [existing] = await knex('reimbursement_processed_files')
            .insert({
                project_id: projectId,
                file_name: 'existing-invoice.png',
                file_type: 'invoice',
                file_hash: fileHash,
                status: 'completed',
            })
            .returning('*');

        const req = {
            params: { projectId },
            user: { userId },
            authContext: { userId },
            body: {},
            file: {
                originalname: 'duplicate-invoice.png',
                mimetype: 'image/png',
                buffer: fileBuffer,
                size: fileBuffer.length,
            },
        };
        const res = createMockResponse();
        let nextError = null;

        await uploadAndProcessInvoice(req, res, (error) => {
            nextError = error;
        });

        const processingRows = await knex('reimbursement_processed_files')
            .where({ project_id: projectId, file_hash: fileHash, file_type: 'invoice', status: 'processing' });

        assert.equal(nextError, null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.skipped, true);
        assert.equal(res.body.existingInvoiceId, existing.id);
        assert.equal(processingRows.length, 0);
    });

    it('skips duplicate payment uploads before requiring OCR config', async () => {
        const fileBuffer = Buffer.from('duplicate payment bytes');
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        const [existing] = await knex('reimbursement_processed_files')
            .insert({
                project_id: projectId,
                file_name: 'existing-payment.png',
                file_type: 'payment',
                file_hash: fileHash,
                status: 'completed',
            })
            .returning('*');

        const req = {
            params: { projectId },
            user: { userId },
            authContext: { userId },
            body: {},
            file: {
                originalname: 'duplicate-payment.png',
                mimetype: 'image/png',
                buffer: fileBuffer,
                size: fileBuffer.length,
            },
        };
        const res = createMockResponse();
        let nextError = null;

        await uploadAndProcessPayment(req, res, (error) => {
            nextError = error;
        });

        const processingRows = await knex('reimbursement_processed_files')
            .where({ project_id: projectId, file_hash: fileHash, file_type: 'payment', status: 'processing' });

        assert.equal(nextError, null);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.skipped, true);
        assert.equal(res.body.existingPaymentId, existing.id);
        assert.equal(processingRows.length, 0);
    });

    it('uses server OCR config over saved and request keys when a paid API key is configured', async () => {
        const previousConfig = {
            provider: env.REIMBURSEMENT_OCR_PROVIDER,
            baseUrl: env.REIMBURSEMENT_OCR_BASE_URL,
            apiKey: env.REIMBURSEMENT_OCR_API_KEY,
            modelName: env.REIMBURSEMENT_OCR_MODEL_NAME,
        };

        try {
            env.REIMBURSEMENT_OCR_PROVIDER = 'paid-provider';
            env.REIMBURSEMENT_OCR_BASE_URL = 'https://paid.example/v1';
            env.REIMBURSEMENT_OCR_API_KEY = 'server-paid-key';
            env.REIMBURSEMENT_OCR_MODEL_NAME = 'paid-model';

            await reimbursementService.updateUserSettings(userId, {
                llm_config: {
                    provider: 'saved-provider',
                    baseUrl: 'https://saved.example/v1',
                    apiKey: 'saved-key',
                    modelName: 'saved-model',
                },
            });

            const config = await resolveOcrConfig({
                user: { userId },
                authContext: { userId },
                body: {
                    provider: 'request-provider',
                    baseUrl: 'https://request.example/v1',
                    apiKey: 'request-key',
                    modelName: 'request-model',
                },
            });

            assert.equal(config.provider, 'paid-provider');
            assert.equal(config.baseUrl, 'https://paid.example/v1');
            assert.equal(config.apiKey, 'server-paid-key');
            assert.equal(config.modelName, 'paid-model');
        } finally {
            env.REIMBURSEMENT_OCR_PROVIDER = previousConfig.provider;
            env.REIMBURSEMENT_OCR_BASE_URL = previousConfig.baseUrl;
            env.REIMBURSEMENT_OCR_API_KEY = previousConfig.apiKey;
            env.REIMBURSEMENT_OCR_MODEL_NAME = previousConfig.modelName;
        }
    });

    it('exports the same checked workbook from the Excel-only download endpoint', async () => {
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

        const req = { body: { projectId } };
        const res = createMockResponse();
        let nextError = null;

        await exportExcel(req, res, (error) => {
            nextError = error;
        });

        assert.equal(nextError, null);
        assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        assert.ok(res.rawBody);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(res.rawBody);

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
        assert.match(joined, /缺少日期、大类、金额、报销人、发票号码\/代码/);
        assert.match(joined, /缺少发票附件/);
    });
});
