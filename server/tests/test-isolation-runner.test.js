import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runnerUrl = new URL('./support/run-isolated-tests.mjs', import.meta.url);

test('isolated test database names are safe, stable, and bounded', async () => {
    const { buildIsolatedDatabaseName } = await import(runnerUrl);
    const first = buildIsolatedDatabaseName('tests/auth.test.js');
    const repeated = buildIsolatedDatabaseName('tests/auth.test.js');
    const other = buildIsolatedDatabaseName('tests/permissions.test.js');

    assert.match(first, /^arcspro_test_[a-f0-9]{12}$/);
    assert.equal(first, repeated);
    assert.notEqual(first, other);
    assert.ok(first.length <= 63);
});

test('isolated runner derives admin and child URLs without weakening credentials', async () => {
    const {
        buildAdminDatabaseUrl,
        buildIsolatedDatabaseUrl,
    } = await import(runnerUrl);
    const base = 'postgres://door:secret@127.0.0.1:5432/door_test?sslmode=disable';

    assert.equal(
        buildAdminDatabaseUrl(base),
        'postgres://door:secret@127.0.0.1:5432/postgres?sslmode=disable',
    );
    assert.equal(
        buildIsolatedDatabaseUrl(base, 'arcspro_test_0123456789ab'),
        'postgres://door:secret@127.0.0.1:5432/arcspro_test_0123456789ab?sslmode=disable',
    );
});

test('default server test command uses the isolated PostgreSQL runner', async () => {
    const packageJson = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );

    assert.match(packageJson.scripts.test, /run-isolated-tests\.mjs/);
    assert.doesNotMatch(packageJson.scripts.test, /tests\/\*\.test\.js/);
});
