import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('terrain page delegates status presentation to focused components', async () => {
  const source = await readFile(new URL('src/views/app/terrain-model/TerrainModelPage.jsx', rootUrl), 'utf8')
  const lineCount = source.split('\n').length

  assert.ok(lineCount <= 3250, `TerrainModelPage.jsx has ${lineCount} lines; expected no more than 3250`)
  assert.match(source, /from '\.\/TerrainStatusPanels'/)
  assert.match(source, /from '\.\/TerrainDeliveryPanel'/)
  assert.match(source, /from '\.\/terrainModelPageConfig'/)
})
