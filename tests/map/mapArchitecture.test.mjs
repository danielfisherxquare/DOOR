import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('3D map delegates OSM building integration to a focused module', async () => {
  const source = await readFile(new URL('src/components/map/MapView3D.tsx', rootUrl), 'utf8')
  const lineCount = source.split('\n').length

  assert.ok(lineCount <= 2650, `MapView3D.tsx has ${lineCount} lines; expected no more than 2650`)
  assert.match(source, /from '\.\/osmBuildings'/)
})
