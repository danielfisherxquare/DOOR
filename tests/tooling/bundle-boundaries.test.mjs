import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('tile cache manager does not mix static and ineffective dynamic imports', async () => {
  const source = await readFile(
    new URL('../../src/utils/cache/lruManager.ts', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(source, /import\('\.\/tileCacheApi'\)/)
  assert.match(source, /cacheTileBlob/)
  assert.match(source, /getTileBlob/)
})
