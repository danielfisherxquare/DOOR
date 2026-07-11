import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('design request workspace delegates static configuration to a focused module', async () => {
  const source = await readFile(new URL('src/views/design-requests/DesignRequestWorkspace.jsx', rootUrl), 'utf8')
  const lineCount = source.split('\n').length

  assert.ok(lineCount <= 1550, `DesignRequestWorkspace.jsx has ${lineCount} lines; expected no more than 1550`)
  assert.match(source, /from '\.\/designRequestWorkspaceConfig'/)
})
