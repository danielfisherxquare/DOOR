import { CredentialsMethod, OpenFgaClient } from '@openfga/sdk';

export function readOpenFgaConfig(env = process.env) {
  return {
    apiUrl: env.FGA_API_URL || env.OPENFGA_API_URL || '',
    storeId: env.FGA_STORE_ID || env.OPENFGA_STORE_ID || '',
    authorizationModelId: env.FGA_MODEL_ID || env.OPENFGA_AUTHORIZATION_MODEL_ID || '',
    apiToken: env.FGA_API_TOKEN || env.OPENFGA_API_TOKEN || '',
  };
}

export function validateOpenFgaConfig(config = {}) {
  const missing = [];
  if (!config.apiUrl) missing.push('apiUrl');
  if (!config.storeId) missing.push('storeId');
  if (!config.authorizationModelId) missing.push('authorizationModelId');
  if (missing.length > 0) {
    throw new Error(`OpenFGA config missing: ${missing.join(', ')}`);
  }
}

export function openFgaOptions(config = {}) {
  validateOpenFgaConfig(config);
  return { authorizationModelId: config.authorizationModelId };
}

export function createOpenFgaClient(config = {}) {
  validateOpenFgaConfig(config);

  const clientConfig = {
    apiUrl: config.apiUrl,
    storeId: config.storeId,
    authorizationModelId: config.authorizationModelId || undefined,
  };

  if (config.apiToken) {
    clientConfig.credentials = {
      method: CredentialsMethod.ApiToken,
      config: { token: config.apiToken },
    };
  }

  return new OpenFgaClient(clientConfig);
}
