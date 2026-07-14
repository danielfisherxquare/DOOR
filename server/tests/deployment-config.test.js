import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dockerfile = readFileSync(resolve(serverRoot, 'Dockerfile'), 'utf8');
const compose = readFileSync(resolve(serverRoot, 'docker-compose.yml'), 'utf8');
const composeOverride = readFileSync(
  resolve(serverRoot, 'docker-compose.override.yml'),
  'utf8',
);
const nginx = readFileSync(resolve(serverRoot, 'nginx.conf'), 'utf8');
const nginxLocal = readFileSync(resolve(serverRoot, 'nginx.local.conf'), 'utf8');
const appSource = readFileSync(resolve(serverRoot, 'src/app.js'), 'utf8');
const envSource = readFileSync(resolve(serverRoot, 'src/config/env.js'), 'utf8');
const superAdminBootstrap = readFileSync(
  resolve(serverRoot, 'src/bootstrap/ensure-super-admin.js'),
  'utf8',
);
const restoreScript = readFileSync(
  resolve(serverRoot, 'scripts/run-postgres-restore.sh'),
  'utf8',
);
const backupScript = readFileSync(
  resolve(serverRoot, 'scripts/run-postgres-backup.sh'),
  'utf8',
);
const serverPackage = JSON.parse(readFileSync(resolve(serverRoot, 'package.json'), 'utf8'));

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

function locationBlock(source, declaration) {
  const marker = `    location ${declaration} {\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing nginx location ${declaration}`);
  const end = source.indexOf('\n    }', start);
  assert.notEqual(end, -1, `unterminated nginx location ${declaration}`);
  return source.slice(start, end);
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

test('app and worker wait for a successful one-shot migration', () => {
  assert.match(serviceBlock('migrate'), /command:\s*\[\s*"npm",\s*"run",\s*"migrate"\s*\]/);
  assert.match(serviceBlock('migrate'), /healthcheck:\s*\n\s+disable: true/);
  for (const serviceName of ['app', 'worker']) {
    assert.match(
      serviceBlock(serviceName),
      /migrate:\s*\n\s+condition: service_completed_successfully/,
      `${serviceName} must wait for migrations`,
    );
  }
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

test('container build uses the canonical workspace lockfile', () => {
  assert.match(
    serviceBlock('app'),
    /build:\s*\n\s+context: \.\.\s*\n\s+dockerfile: server\/Dockerfile/,
  );
  assert.match(dockerfile, /COPY package\.json package-lock\.json/);
  assert.match(
    dockerfile,
    /npm ci --omit=dev --include=optional --workspace=arcspro-server/,
  );
  assert.match(dockerfile, /COPY packages\/contracts\/ packages\/contracts\//);
  assert.match(dockerfile, /WORKDIR \/app\/server/);
});

test('backup tooling uses the same PostgreSQL major version as the database', () => {
  assert.match(dockerfile, /apk add --no-cache bash postgresql16-client/);
  assert.match(serviceBlock('postgres'), /image: postgres:16-alpine/);
});

test('restore verification checks the current core table names', () => {
  assert.match(restoreScript, /'users', 'organizations', 'races', 'records'/);
  assert.doesNotMatch(restoreScript, /'users', 'orgs', 'races', 'records'/);
});

test('restore validates the target database name before interpolating SQL', () => {
  assert.match(restoreScript, /\^door_restore_\[A-Za-z0-9_\]/);
  assert.match(restoreScript, /Unsafe restore target database name/);
});

test('backup and restore use constrained PostgreSQL custom archives', () => {
  assert.match(backupScript, /\.dump/);
  assert.match(backupScript, /pg_dump[\s\S]*--format=custom/);
  assert.doesNotMatch(backupScript, /pg_dump[^\n]*\|\s*gzip/);

  assert.match(restoreScript, /Only PostgreSQL custom \.dump archives are supported/);
  assert.match(restoreScript, /pg_restore --list/);
  assert.match(restoreScript, /pg_restore[\s\S]*--exit-on-error/);
  assert.match(restoreScript, /Unsafe archive object type/);
  assert.doesNotMatch(restoreScript, /gzip -dc[\s\S]*\|\s*psql/);
});

test('test-database restore never replaces the running server environment', () => {
  assert.doesNotMatch(restoreScript, /cp\s+"?\$\{?ENV_FILE/);
  assert.doesNotMatch(restoreScript, /ENV_DST=.*\.env/);
  assert.match(restoreScript, /envSnapshotProvided/);
});

test('app and worker receive every production-required assessment secret', () => {
  const appKeys = environmentKeys('app');
  const workerKeys = environmentKeys('worker');
  const requiredKeys = [
    'ASSESSMENT_FIELD_ENCRYPTION_KEY',
    'ASSESSMENT_SESSION_JWT_SECRET',
    'ASSESSMENT_HASH_PEPPER',
  ];

  for (const key of requiredKeys) {
    assert.equal(appKeys.has(key), true, `app missing ${key}`);
    assert.equal(workerKeys.has(key), true, `worker missing ${key}`);
  }
});

test('compose services remain project-scoped instead of claiming global container names', () => {
  for (const serviceName of ['postgres', 'redis', 'app', 'worker', 'pg-backup', 'nginx']) {
    assert.doesNotMatch(serviceBlock(serviceName), /\n    container_name:/);
  }
});

test('production cannot bootstrap a super admin with a built-in password', () => {
  const appKeys = environmentKeys('app');
  for (const key of ['SUPER_ADMIN_USERNAME', 'SUPER_ADMIN_EMAIL', 'SUPER_ADMIN_PASSWORD']) {
    assert.equal(appKeys.has(key), true, `app missing ${key}`);
  }
  assert.doesNotMatch(envSource, /SUPER_ADMIN_PASSWORD:\s*process\.env\.SUPER_ADMIN_PASSWORD\s*\|\|\s*['"]admin123['"]/);
  assert.match(superAdminBootstrap, /if \(!env\.SUPER_ADMIN_PASSWORD\)/);
  assert.match(superAdminBootstrap, /must_change_password:\s*true/);
});

test('container migrations resolve knex through the npm workspace path', () => {
  assert.equal(serverPackage.scripts.migrate, 'knex migrate:latest --knexfile knexfile.js');
});

test('server declares every shared workspace package it imports at runtime', () => {
  assert.equal(serverPackage.dependencies['@arcspro/contracts'], '0.1.0');
  assert.equal(serverPackage.dependencies['@arcspro/studio-model'], '0.1.0');
});

test('non-HTTP worker processes do not inherit the app HTTP healthcheck', () => {
  for (const serviceName of ['worker', 'pg-backup']) {
    assert.match(serviceBlock(serviceName), /healthcheck:\s*\n\s+disable: true/);
  }
});

test('runtime storage is mounted at the server working directory', () => {
  for (const serviceName of ['app', 'worker']) {
    assert.match(serviceBlock(serviceName), /\.\/storage:\/app\/server\/storage/);
    assert.doesNotMatch(serviceBlock(serviceName), /\.\/storage:\/app\/storage/);
  }
});

test('automatic backup uses the image script path and a cross-container lock', () => {
  assert.match(serviceBlock('pg-backup'), /\/app\/server\/scripts\/run-postgres-backup\.sh/);
  assert.match(
    serviceBlock('app'),
    /DB_OPS_LOCK_DIR: \$\{DB_OPS_LOCK_DIR:-\/backups\/\.db-ops\.lock\}/,
  );
  assert.match(
    serviceBlock('pg-backup'),
    /DB_OPS_LOCK_DIR: \$\{DB_OPS_LOCK_DIR:-\/backups\/\.db-ops\.lock\}/,
  );
});

test('backup-capable services mount the environment file beside server scripts', () => {
  for (const serviceName of ['app', 'pg-backup']) {
    assert.match(serviceBlock(serviceName), /\.\/\.env:\/app\/server\/\.env:ro/);
  }
});

test('mounted nginx config contains no unresolved deployment placeholders', () => {
  assert.doesNotMatch(nginx, /\$\{NGINX_[A-Z0-9_]+\}/);
});

test('nginx re-resolves the app container after a rolling recreate', () => {
  for (const source of [nginx, nginxLocal]) {
    assert.match(source, /resolver 127\.0\.0\.11 valid=10s ipv6=off;/);
    assert.match(source, /zone app_backend 64k;/);
    assert.match(source, /server app:3001 resolve;/);
  }
});

test('cache-specific nginx locations preserve inherited security headers', () => {
  const productionHeaders = [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ];

  for (const declaration of ['/assets/', '= /vite.svg', '= /index.html']) {
    const block = locationBlock(nginx, declaration);
    for (const header of productionHeaders) {
      assert.match(block, new RegExp(`add_header ${header} `), `${declaration} missing ${header}`);
    }
    assert.match(
      locationBlock(nginxLocal, declaration),
      /add_header Permissions-Policy /,
      `${declaration} missing local Permissions-Policy`,
    );
  }
});

test('local HTTP-only nginx override does not publish a TLS port', () => {
  assert.match(composeOverride, /ports:\s*!override/);
  assert.match(composeOverride, /\$\{HTTP_PORT:-8080\}:80/);
  assert.doesNotMatch(composeOverride, /:443/);
});
