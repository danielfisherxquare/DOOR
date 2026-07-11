import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('terrain model delegates options, numeric, and geographic normalization', async () => {
  const source = await readFile(new URL('src/utils/terrainModel/model.js', rootUrl), 'utf8')
  const lineCount = source.split('\n').length

  assert.ok(lineCount <= 3300, `terrain model has ${lineCount} lines; expected no more than 3300`)
  assert.match(source, /from '\.\/modelOptions\.js'/)
  assert.match(source, /from '\.\/numeric\.js'/)
  assert.match(source, /from '\.\/geo\.js'/)
  assert.match(source, /from '\.\/export\.js'/)
})
