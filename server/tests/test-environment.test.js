import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const supportModuleUrl = new URL('./support/test-environment.mjs', import.meta.url);

test('accepts databases with an explicit test prefix or suffix', async () => {
  const { assertSafeTestDatabase } = await import(supportModuleUrl);

  assert.doesNotThrow(() =>
    assertSafeTestDatabase('postgres://door:x@localhost:5432/door_test'),
  );
  assert.doesNotThrow(() =>
    assertSafeTestDatabase('postgres://door:x@localhost:5432/test_door'),
  );
});

test('rejects production-like and malformed database URLs', async () => {
  const { assertSafeTestDatabase } = await import(supportModuleUrl);

  assert.throws(
    () => assertSafeTestDatabase('postgres://door:x@localhost:5432/door'),
    /Refusing to run destructive tests/,
  );
  assert.throws(
    () => assertSafeTestDatabase('not-a-database-url'),
    /Refusing to run destructive tests/,
  );
});

test('preloader exits before test code runs for a production-like database', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      fileURLToPath(supportModuleUrl),
      '--eval',
      "process.stdout.write('UNSAFE_TEST_BODY_RAN')",
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: 'postgres://door:x@localhost:5432/door',
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /UNSAFE_TEST_BODY_RAN/);
  assert.match(result.stderr, /Refusing to run destructive tests/);
  assert.doesNotMatch(result.stderr, /postgres:\/\//);
});

test('server test script performs one preflight before test discovery', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.match(
    packageJson.scripts.test,
    /^node \.\/tests\/support\/test-environment\.mjs && /,
  );
  assert.match(packageJson.scripts.test, /tests\/\*\.test\.js/);
  assert.match(packageJson.scripts.test, /tests\/\*\/\*\.test\.js/);
  assert.match(packageJson.scripts['test:runtime'], /tenant-isolation\.runtime\.js/);
  await assert.rejects(access(new URL('./tenant-isolation.test.js', import.meta.url)), {
    code: 'ENOENT',
  });
  await assert.doesNotReject(access(new URL('./tenant-isolation.runtime.js', import.meta.url)));
});
