import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('editor document delegates primitive geometry to focused modules', async () => {
  const source = await readFile(new URL('packages/studio-model/src/editorDocument.js', rootUrl), 'utf8')
  const lineCount = source.split('\n').length

  assert.ok(lineCount <= 3100, `editorDocument.js has ${lineCount} lines; expected no more than 3100`)
  assert.match(source, /from '\.\/value\.js'/)
  assert.match(source, /from '\.\/planeGeometry\.js'/)
  assert.match(source, /from '\.\/polygonGeometry\.js'/)
})
