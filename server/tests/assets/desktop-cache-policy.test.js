import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const desktopRuntimeSource = readFileSync(
  fileURLToPath(new URL('../../../apps/asset-desktop/src-tauri/src/lib.rs', import.meta.url)),
  'utf8',
)

test('desktop clears stale WebView assets before reloading the bundled app', () => {
  assert.match(desktopRuntimeSource, /clear_all_browsing_data\(\)\?/)
  assert.match(desktopRuntimeSource, /reload\(\)\?/)
})
