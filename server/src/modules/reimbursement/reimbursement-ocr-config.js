import { env } from '../../config/env.js';
import {
  maskReimbursementLlmConfig,
  sanitizeReimbursementLlmRequestConfig,
} from './reimbursement-llm-secret.js';

export const DEFAULT_LLM_CONFIG = {
  provider: 'qwen',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  modelName: 'qwen3.5-plus',
};

export function getServerLlmConfig(runtimeEnv = env, defaultConfig = DEFAULT_LLM_CONFIG) {
  return {
    provider: runtimeEnv.REIMBURSEMENT_OCR_PROVIDER || defaultConfig.provider,
    baseUrl: runtimeEnv.REIMBURSEMENT_OCR_BASE_URL || defaultConfig.baseUrl,
    apiKey: runtimeEnv.REIMBURSEMENT_OCR_API_KEY || '',
    modelName: runtimeEnv.REIMBURSEMENT_OCR_MODEL_NAME || defaultConfig.modelName,
  };
}

export function buildPaymentReviewRecordData(paymentData = {}) {
  const rawExpense = paymentData.amount ?? paymentData.expense ?? null;
  return {
    payment_date: paymentData.date || paymentData.payment_date || null,
    category: paymentData.category || null,
    sub_category: paymentData.subCategory || paymentData.sub_category || null,
    expense: rawExpense != null ? Math.abs(Number(rawExpense) || 0) || null : null,
    company: paymentData.payee || paymentData.targetName || paymentData.company || null,
  };
}

export function mergeNonEmptyConfig(...configs) {
  const merged = {};

  for (const config of configs) {
    if (!config || typeof config !== 'object') continue;

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) merged[key] = trimmed;
      } else if (value != null) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

export function readRequestConfig(body = {}) {
  const directConfig = {
    provider: body?.provider,
    baseUrl: body?.baseUrl,
    apiKey: body?.apiKey,
    modelName: body?.modelName,
  };

  if (!body?.config) {
    return sanitizeReimbursementLlmRequestConfig(directConfig);
  }

  try {
    const parsed = typeof body.config === 'string' ? JSON.parse(body.config) : body.config;
    return sanitizeReimbursementLlmRequestConfig({ ...directConfig, ...(parsed || {}) });
  } catch {
    return sanitizeReimbursementLlmRequestConfig(directConfig);
  }
}

export function resolveReimbursementOcrConfig({
  body = {},
  settings = null,
  defaultConfig = DEFAULT_LLM_CONFIG,
  serverConfig = getServerLlmConfig(env, defaultConfig),
} = {}) {
  const serverOverride = serverConfig?.apiKey ? serverConfig : null;
  return mergeNonEmptyConfig(
    defaultConfig,
    settings?.llm_config,
    readRequestConfig(body),
    serverOverride,
  );
}

export function createMissingOcrConfigError() {
  const error = new Error(
    '缺少 OCR 模型配置，请在报销助手中填写模型配置，或由服务端配置 REIMBURSEMENT_OCR_* 环境变量',
  );
  error.status = 400;
  error.expose = true;
  return error;
}

export function normalizeOcrError(error, label) {
  const upstreamStatus = error?.response?.status;
  if (!upstreamStatus) return error;

  const upstreamData = error.response?.data;
  const rawDetail = typeof upstreamData === 'string'
    ? upstreamData
    : upstreamData?.message || upstreamData?.error?.message || upstreamData?.error || '';
  const detail = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
  const message = upstreamStatus === 401
    ? `${label}上游模型鉴权失败，请检查 API Key、Base URL 与模型配置`
    : `${label}上游模型调用失败 (${upstreamStatus})`;

  const normalized = new Error(detail ? `${message}: ${String(detail).slice(0, 240)}` : message);
  normalized.status = 502;
  normalized.expose = true;
  return normalized;
}

export function toSettingsResponse(
  settings,
  serverConfig = getServerLlmConfig(),
  defaultConfig = DEFAULT_LLM_CONFIG,
) {
  const userConfig = settings?.llm_config || {};
  const hasServerLlmConfig = Boolean(serverConfig.apiKey && serverConfig.baseUrl);
  const hasUserApiKey = Boolean(userConfig.apiKey?.trim());
  const maskedUserConfig = maskReimbursementLlmConfig(userConfig);
  const mergedConfig = {
    ...defaultConfig,
    provider: hasUserApiKey
      ? (userConfig.provider || defaultConfig.provider)
      : (hasServerLlmConfig ? serverConfig.provider : (userConfig.provider || defaultConfig.provider)),
    baseUrl: hasUserApiKey
      ? (userConfig.baseUrl || defaultConfig.baseUrl)
      : (hasServerLlmConfig
        ? serverConfig.baseUrl
        : (userConfig.baseUrl || serverConfig.baseUrl || defaultConfig.baseUrl)),
    apiKey: hasUserApiKey ? maskedUserConfig.apiKey : '',
    modelName: hasUserApiKey
      ? (userConfig.modelName || defaultConfig.modelName)
      : (hasServerLlmConfig
        ? serverConfig.modelName
        : (userConfig.modelName || serverConfig.modelName || defaultConfig.modelName)),
  };

  return {
    defaultReporter: settings?.default_reporter || '',
    watchDirectoryPath: settings?.watch_directory_path || '',
    llmConfig: mergedConfig,
    hasServerLlmConfig,
    hasUserLlmConfig: hasUserApiKey,
  };
}

export function buildSettingsUpdatePayload(
  body = {},
  current = {},
  defaultConfig = DEFAULT_LLM_CONFIG,
) {
  const requestConfig = body.llmConfig ?? body.llm_config;
  const submittedConfig = sanitizeReimbursementLlmRequestConfig(requestConfig);
  const currentConfig = current.llm_config || defaultConfig;

  return {
    default_reporter:
      body.defaultReporter ?? body.default_reporter ?? current.default_reporter ?? '',
    watch_directory_path:
      body.watchDirectoryPath ?? body.watch_directory_path ?? current.watch_directory_path ?? '',
    llm_config: {
      provider: submittedConfig.provider || currentConfig.provider || defaultConfig.provider,
      baseUrl: submittedConfig.baseUrl || currentConfig.baseUrl || defaultConfig.baseUrl,
      apiKey: body.clearApiKey === true ? '' : submittedConfig.apiKey || currentConfig.apiKey || '',
      modelName: submittedConfig.modelName || currentConfig.modelName || defaultConfig.modelName,
    },
  };
}
