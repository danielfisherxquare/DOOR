import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { resolveLlmConfig } = await import('../src/modules/reimbursement/preview.controller.js');

describe('preview OCR config resolution', () => {
    it('uses the server-paid OCR config when an API key is configured', () => {
        const config = resolveLlmConfig(
            {
                provider: 'legacy',
                baseUrl: 'https://legacy.example/v1',
                apiKey: 'old-browser-key',
                modelName: 'old-model',
            },
            {
                provider: 'qwen',
                baseUrl: 'https://paid.example/v1',
                apiKey: 'server-paid-key',
                modelName: 'paid-model',
            }
        );

        assert.deepEqual(config, {
            provider: 'qwen',
            baseUrl: 'https://paid.example/v1',
            apiKey: 'server-paid-key',
            modelName: 'paid-model',
        });
    });

    it('keeps project-level config as a fallback when the server has no API key', () => {
        const config = resolveLlmConfig(
            {
                provider: 'custom',
                baseUrl: 'https://custom.example/v1',
                apiKey: 'project-key',
                modelName: 'project-model',
            },
            {
                provider: 'qwen',
                baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                apiKey: '',
                modelName: 'qwen3.5-plus',
            }
        );

        assert.equal(config.provider, 'custom');
        assert.equal(config.baseUrl, 'https://custom.example/v1');
        assert.equal(config.apiKey, 'project-key');
        assert.equal(config.modelName, 'project-model');
    });
});
