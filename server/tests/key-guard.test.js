import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PII_ACTIVE_KEY_VERSION: process.env.PII_ACTIVE_KEY_VERSION,
  PII_ENCRYPTION_KEY_V1: process.env.PII_ENCRYPTION_KEY_V1,
  PII_HMAC_KEY_V1: process.env.PII_HMAC_KEY_V1,
  PII_ENCRYPTION_KEY_V2: process.env.PII_ENCRYPTION_KEY_V2,
  PII_HMAC_KEY_V2: process.env.PII_HMAC_KEY_V2,
};

const encryptionV1 = '11'.repeat(32);
const hmacV1 = '22'.repeat(32);
const encryptionV2 = '33'.repeat(32);
const hmacV2 = '44'.repeat(32);

function restoreEnvironment() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function createSettingsKnex() {
  const settings = new Map();

  function knex(tableName) {
    assert.equal(tableName, 'system_settings');
    let selectedKey = null;
    return {
      where(field, value) {
        assert.equal(field, 'key');
        selectedKey = value;
        return this;
      },
      async first() {
        return settings.has(selectedKey)
          ? { key: selectedKey, value: settings.get(selectedKey) }
          : undefined;
      },
      async update(payload) {
        settings.set(selectedKey, payload.value);
        return 1;
      },
      async insert(payload) {
        settings.set(payload.key, payload.value);
        return 1;
      },
    };
  }

  knex.schema = {
    async hasTable() {
      return true;
    },
  };
  knex.fn = {
    now() {
      return new Date(0);
    },
  };

  return { knex, settings };
}

before(() => {
  process.env.NODE_ENV = 'production';
  process.env.PII_ACTIVE_KEY_VERSION = 'v1';
  process.env.PII_ENCRYPTION_KEY_V1 = encryptionV1;
  process.env.PII_HMAC_KEY_V1 = hmacV1;
  process.env.PII_ENCRYPTION_KEY_V2 = encryptionV2;
  process.env.PII_HMAC_KEY_V2 = hmacV2;
});

after(restoreEnvironment);

test('fingerprints follow the active PII key version', async () => {
  const { getCurrentKeyFingerprints } = await import('../src/utils/key-guard.js');
  process.env.PII_ACTIVE_KEY_VERSION = 'v2';

  const fingerprints = getCurrentKeyFingerprints();

  assert.equal(fingerprints.version, 'v2');
  assert.equal(
    fingerprints.encryptionKeyFingerprint,
    crypto.createHash('sha256').update(encryptionV2).digest('hex').slice(0, 16),
  );
  assert.equal(
    fingerprints.hmacKeyFingerprint,
    crypto.createHash('sha256').update(hmacV2).digest('hex').slice(0, 16),
  );
});

test('canary migrates to the active version before the old key is retired', async () => {
  const { checkKeyHealth, verifyEncryptionKeys } = await import('../src/utils/key-guard.js');
  const { knex, settings } = createSettingsKnex();

  process.env.PII_ACTIVE_KEY_VERSION = 'v1';
  const firstRun = await verifyEncryptionKeys(knex);
  assert.equal(firstRun.status, 'first_run');
  assert.match(settings.get('pii_key_canary'), /^enc:v1:v1:/);

  process.env.PII_ACTIVE_KEY_VERSION = 'v2';
  const rotated = await verifyEncryptionKeys(knex);
  assert.equal(rotated.status, 'ok');
  assert.equal(rotated.details.canaryRotatedFrom, 'v1');
  assert.match(settings.get('pii_key_canary'), /^enc:v1:v2:/);

  delete process.env.PII_ENCRYPTION_KEY_V1;
  delete process.env.PII_HMAC_KEY_V1;
  const health = await checkKeyHealth(knex);
  assert.equal(health.healthy, true);
});

test('same-version HMAC drift fails startup and readiness', async () => {
  const { checkKeyHealth, verifyEncryptionKeys } = await import('../src/utils/key-guard.js');
  const { knex } = createSettingsKnex();

  process.env.PII_ACTIVE_KEY_VERSION = 'v2';
  process.env.PII_ENCRYPTION_KEY_V2 = encryptionV2;
  process.env.PII_HMAC_KEY_V2 = hmacV2;
  await verifyEncryptionKeys(knex);

  process.env.PII_HMAC_KEY_V2 = '55'.repeat(32);

  await assert.rejects(() => verifyEncryptionKeys(knex), /FATAL: PII key mismatch/);
  const health = await checkKeyHealth(knex);
  assert.equal(health.healthy, false);
  assert.equal(health.reason, 'hmac_key_mismatch');
});
