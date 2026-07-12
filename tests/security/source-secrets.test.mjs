import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('MapView3D requires Cesium ion credentials from the build environment', () => {
  const source = readFileSync(
    new URL('../../src/components/map/MapView3D.tsx', import.meta.url),
    'utf8'
  )

  assert.match(source, /import\.meta\.env\.VITE_CESIUM_ION_TOKEN/)
  assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/)
})
