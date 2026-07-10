import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('router opts into the supported v7 transition behavior', async () => {
  const source = await readFile(new URL('../../src/main.jsx', import.meta.url), 'utf8')

  assert.match(source, /v7_startTransition: true/)
  assert.match(source, /v7_relativeSplatPath: true/)
})
