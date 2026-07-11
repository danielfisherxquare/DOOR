import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPaymentReviewRecordData,
  buildSettingsUpdatePayload,
  mergeNonEmptyConfig,
  normalizeOcrError,
  resolveReimbursementOcrConfig,
  toSettingsResponse,
} from '../src/modules/reimbursement/reimbursement-ocr-config.js';

const defaults = {
  provider: 'qwen',
  baseUrl: 'https://default.example/v1',
  apiKey: '',
  modelName: 'default-model',
};

test('OCR config precedence keeps non-empty request and paid server values', () => {
  const resolved = resolveReimbursementOcrConfig({
    body: { baseUrl: ' https://request.example/v1 ', apiKey: 'request-key' },
    settings: { llm_config: { modelName: 'user-model', provider: 'user-provider' } },
    defaultConfig: defaults,
    serverConfig: { provider: 'server-provider', apiKey: 'server-key', modelName: 'server-model' },
  });

  assert.deepEqual(resolved, {
    provider: 'server-provider',
    baseUrl: 'https://request.example/v1',
    apiKey: 'server-key',
    modelName: 'server-model',
  });
  assert.deepEqual(mergeNonEmptyConfig({ apiKey: ' old ' }, { apiKey: ' ', modelName: ' next ' }), {
    apiKey: 'old',
    modelName: 'next',
  });
});

test('settings responses mask user secrets and expose server availability', () => {
  const response = toSettingsResponse(
    { llm_config: { provider: 'qwen', baseUrl: 'https://user.example', apiKey: 'secret', modelName: 'user-model' } },
    { provider: 'qwen', baseUrl: 'https://server.example', apiKey: 'paid-key', modelName: 'server-model' },
    defaults,
  );

  assert.equal(response.hasServerLlmConfig, true);
  assert.equal(response.hasUserLlmConfig, true);
  assert.notEqual(response.llmConfig.apiKey, 'secret');
  assert.ok(response.llmConfig.apiKey);
});

test('settings updates preserve stored API keys unless explicitly cleared', () => {
  const current = { llm_config: { ...defaults, apiKey: 'stored-key' } };
  assert.equal(buildSettingsUpdatePayload({ llmConfig: { modelName: 'next' } }, current, defaults).llm_config.apiKey, 'stored-key');
  assert.equal(buildSettingsUpdatePayload({ clearApiKey: true }, current, defaults).llm_config.apiKey, '');
});

test('payment review data and upstream OCR errors use stable public fields', () => {
  assert.deepEqual(buildPaymentReviewRecordData({
    payment_date: '2026-07-12',
    sub_category: '交通',
    expense: '-30',
    company: '测试商户',
  }), {
    payment_date: '2026-07-12',
    category: null,
    sub_category: '交通',
    expense: 30,
    company: '测试商户',
  });

  const normalized = normalizeOcrError({ response: { status: 401, data: { message: 'invalid token' } } }, '发票 OCR ');
  assert.equal(normalized.status, 502);
  assert.equal(normalized.expose, true);
  assert.match(normalized.message, /鉴权失败/);
  assert.match(normalized.message, /invalid token/);
});
