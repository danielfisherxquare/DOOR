import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dockerfile = readFileSync(resolve(serverRoot, 'Dockerfile'), 'utf8');
const compose = readFileSync(resolve(serverRoot, 'docker-compose.yml'), 'utf8');
const nginx = readFileSync(resolve(serverRoot, 'nginx.conf'), 'utf8');
const appSource = readFileSync(resolve(serverRoot, 'src/app.js'), 'utf8');

function serviceBlock(serviceName) {
  const marker = `  ${serviceName}:\n`;
  const start = compose.indexOf(marker);
  assert.notEqual(start, -1, `missing ${serviceName} service`);
  const remainder = compose.slice(start + marker.length);
  const nextService = remainder.search(/\n  [A-Za-z0-9_-]+:\n/);
  return nextService === -1 ? remainder : remainder.slice(0, nextService);
}

function environmentKeys(serviceName) {
  const block = serviceBlock(serviceName);
  const match = block.match(
    /\n    environment:\n([\s\S]*?)(?=\n    [A-Za-z0-9_-]+:|\n  [A-Za-z0-9_-]+:|$)/,
  );
  assert.ok(match, `missing environment block for ${serviceName}`);
  return new Set(
    [...match[1].matchAll(/^      ([A-Z][A-Z0-9_]*):/gm)].map((entry) => entry[1]),
  );
}

test('image liveness checks the unauthenticated live endpoint', () => {
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*127\.0\.0\.1:3001\/api\/health\/live/);
  assert.ok(appSource.indexOf("app.use('/api/health'") < appSource.indexOf('app.use(requireAuth)'));
});

test('compose readiness checks database and key readiness before nginx starts', () => {
  assert.match(serviceBlock('app'), /healthcheck:[\s\S]*\/api\/health\/ready/);
  assert.match(
    serviceBlock('nginx'),
    /depends_on:\s*\n\s+app:\s*\n\s+condition: service_healthy/,
  );
});

test('app and worker receive the same versioned PII key variables', () => {
  const appKeys = environmentKeys('app');
  const workerKeys = environmentKeys('worker');
  const requiredKeys = [
    'PII_ACTIVE_KEY_VERSION',
    'PII_ENCRYPTION_KEY_V1',
    'PII_HMAC_KEY_V1',
    'PII_ENCRYPTION_KEY_V2',
    'PII_HMAC_KEY_V2',
  ];

  for (const key of requiredKeys) {
    assert.equal(appKeys.has(key), true, `app missing ${key}`);
    assert.equal(workerKeys.has(key), true, `worker missing ${key}`);
  }
});

test('mounted nginx config contains no unresolved deployment placeholders', () => {
  assert.doesNotMatch(nginx, /\$\{NGINX_[A-Z0-9_]+\}/);
});
