import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import axios from 'axios';
import sharp from 'sharp';

const ocrService = await import('../src/modules/reimbursement/ocr.service.js');

const ONE_PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN6kAAAAASUVORK5CYII=',
    'base64'
);

const originalPost = axios.post;

afterEach(() => {
    axios.post = originalPost;
});

function mockVisionResponses(responses) {
    const calls = [];
    axios.post = async (url, payload, options) => {
        calls.push({ url, payload, options });
        const response = responses[Math.min(calls.length - 1, responses.length - 1)];
        return {
            data: {
                choices: [
                    {
                        message: {
                            content: JSON.stringify(response),
                        },
                    },
                ],
            },
        };
    };
    return calls;
}

const TEST_CONFIG = {
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    modelName: 'vision-test',
};

describe('reimbursement OCR model calls', () => {
    it('does not spend a second vision call on ordinary incomplete invoices', async () => {
        const calls = mockVisionResponses([
            {
                amount: 128.5,
                date: '2026-05-01',
                buyer: '测试公司',
                category: '办公费',
                subCategory: '物资采购费',
            },
        ]);

        const result = await ocrService.processInvoice({
            fileBuffer: ONE_PIXEL_PNG,
            mimeType: 'image/png',
            filename: 'office-supply.png',
            config: TEST_CONFIG,
        });

        assert.equal(result.success, true);
        assert.equal(result.data.amount, 128.5);
        assert.equal(calls.length, 1);
    });

    it('uses the railway retry only when the first pass hints at a railway invoice', async () => {
        const calls = mockVisionResponses([
            {
                amount: null,
                date: '',
                buyer: '测试公司',
                subCategory: '高铁费',
                details: '',
            },
            {
                amount: 66,
                date: '2026年05月02日',
                buyer: '测试公司',
                details: '南宁东-广州南 G2345 二等座',
                subCategory: '高铁费',
                category: '交通费',
            },
        ]);

        const result = await ocrService.processInvoice({
            fileBuffer: ONE_PIXEL_PNG,
            mimeType: 'image/png',
            filename: 'railway-ticket.png',
            config: TEST_CONFIG,
        });

        assert.equal(result.success, true);
        assert.equal(result.data.amount, 66);
        assert.equal(result.data.subCategory, '高铁费');
        assert.equal(calls.length, 2);
        assert.equal(calls[0].payload.max_tokens, 700);
        assert.equal(calls[1].payload.max_tokens, 420);
    });

    it('caps completion tokens for OCR responses', async () => {
        const calls = mockVisionResponses([
            {
                amount: 12,
                date: '2026-05-03',
                buyer: '测试公司',
                details: '办公用品',
                subCategory: '物资采购费',
                category: '办公费',
            },
        ]);

        await ocrService.processInvoice({
            fileBuffer: ONE_PIXEL_PNG,
            mimeType: 'image/png',
            filename: 'invoice.png',
            config: TEST_CONFIG,
        });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].payload.max_tokens, 700);
    });

    it('does not repeat fixed railway amount instructions in the paid invoice prompt', async () => {
        const calls = mockVisionResponses([
            {
                amount: 12,
                date: '2026-05-03',
                buyer: '测试公司',
                details: '办公用品',
                subCategory: '物资采购费',
                category: '办公费',
            },
        ]);

        await ocrService.processInvoice({
            fileBuffer: ONE_PIXEL_PNG,
            mimeType: 'image/png',
            filename: 'invoice.png',
            config: TEST_CONFIG,
        });

        const promptText = calls[0].payload.messages[0].content[0].text;
        const railwayAmountRuleCount = promptText.match(/For railway e-ticket invoices, amount should come from/g)?.length || 0;
        assert.equal(railwayAmountRuleCount, 1);
    });

    it('uses a smaller completion token cap for payment proof OCR', async () => {
        const calls = mockVisionResponses([
            {
                amount: 88,
                date: '2026-05-03',
                payee: '滴滴出行',
                category: '交通费',
                targetName: '滴滴出行',
            },
        ]);

        await ocrService.processPayment({
            fileBuffer: ONE_PIXEL_PNG,
            mimeType: 'image/png',
            filename: 'payment.png',
            config: TEST_CONFIG,
        });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].payload.max_tokens, 260);
    });

    it('records image optimization savings before sending paid vision requests', async () => {
        const oversizedInvoice = await sharp({
            create: {
                width: 2600,
                height: 1800,
                channels: 3,
                background: '#ffffff',
            },
        })
            .jpeg({ quality: 98 })
            .toBuffer();
        const calls = mockVisionResponses([
            {
                amount: 12,
                date: '2026-05-04',
                buyer: '测试公司',
                details: '办公用品',
                subCategory: '物资采购费',
                category: '办公费',
            },
        ]);

        const result = await ocrService.processInvoice({
            fileBuffer: oversizedInvoice,
            mimeType: 'image/jpeg',
            filename: 'oversized-invoice.jpg',
            config: TEST_CONFIG,
        });

        const optimization = result.meta.imageOptimization;
        const sentUrl = calls[0].payload.messages[0].content.find((item) => item.type === 'image_url').image_url.url;
        const sentBytes = Buffer.from(sentUrl.split(',')[1], 'base64').length;

        assert.equal(result.success, true);
        assert.equal(optimization.imageCount, 1);
        assert.equal(optimization.originalBytes, oversizedInvoice.length);
        assert.equal(optimization.optimizedBytes, sentBytes);
        assert.ok(optimization.optimizedBytes < optimization.originalBytes);
        assert.ok(optimization.savedBytes > 0);
        assert.equal(result.meta.calls[0].imageOptimization.optimizedBytes, sentBytes);
    });
});
