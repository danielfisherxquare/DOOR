import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('inventory spatial export delegates GLB encoding to a focused module', async () => {
  const source = await readFile(
    new URL('../src/modules/inventory/inventory.spatial.export.js', import.meta.url),
    'utf8',
  );
  const lineCount = source.split('\n').length;

  assert.ok(
    lineCount <= 1300,
    `inventory.spatial.export.js has ${lineCount} lines; expected no more than 1300`,
  );
  assert.match(source, /from '\.\/inventory\.spatial\.glb\.js'/);
});
