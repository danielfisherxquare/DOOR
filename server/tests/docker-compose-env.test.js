import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compose = readFileSync(resolve(serverRoot, 'docker-compose.yml'), 'utf8');

function serviceBlock(serviceName) {
  const marker = `  ${serviceName}:\n`;
  const start = compose.indexOf(marker);
  assert.notEqual(start, -1, `missing ${serviceName} service`);

  const remainder = compose.slice(start + marker.length);
  const nextService = remainder.search(/\n  [A-Za-z0-9_-]+:\n/);
  return nextService === -1 ? remainder : remainder.slice(0, nextService);
}

function environmentBlock(serviceName) {
  const block = serviceBlock(serviceName);
  const match = block.match(/\n    environment:\n([\s\S]*?)(?=\n    [A-Za-z0-9_-]+:|\n  [A-Za-z0-9_-]+:|$)/);
  assert.ok(match, `missing environment block for ${serviceName}`);
  return match[1];
}

test('worker receives the same PII key environment as app', () => {
  const appEnv = environmentBlock('app');
  const workerEnv = environmentBlock('worker');
  const piiKeys = [
    'PII_ACTIVE_KEY_VERSION',
    'PII_ENCRYPTION_KEY_V1',
    'PII_HMAC_KEY_V1',
    'PII_ENCRYPTION_KEY_V2',
    'PII_HMAC_KEY_V2',
  ];

  for (const key of piiKeys) {
    assert.match(appEnv, new RegExp(`\\n      ${key}: \\$`), `app missing ${key}`);
    assert.match(workerEnv, new RegExp(`\\n      ${key}: \\$`), `worker missing ${key}`);
  }
});
