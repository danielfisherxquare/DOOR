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

test('push pull height label uses the browser document instead of the modeling document', async () => {
  const source = await readFile(new URL('src/3d-studio/tools/PushPullTool.jsx', rootUrl), 'utf8')

  assert.doesNotMatch(source, /<PushPullHeightLabel[^>]+document=\{document\}/)
  assert.match(source, /const domDocument = globalThis\.document/)
})

test('spatial project shell does not reuse the inner 3D editor shell class', async () => {
  const pageSource = await readFile(new URL('src/views/app/StudioProjectPage.jsx', rootUrl), 'utf8')
  const styles = await readFile(new URL('src/views/app/studio-workspace.css', rootUrl), 'utf8')

  assert.match(pageSource, /spatial-project-editor spatial-project-editor--direct/)
  assert.doesNotMatch(pageSource, /studio-shell studio-shell--direct/)
  assert.match(styles, /\.spatial-project-editor--direct/)
  assert.doesNotMatch(styles, /^\.studio-shell\s*\{/m)
})

test('new spatial projects do not leak the literal new route segment into map project state', async () => {
  const source = await readFile(new URL('src/views/app/StudioProjectPage.jsx', rootUrl), 'utf8')

  assert.match(source, /const isNewProjectRoute = mode === 'new' \|\| routeProjectId === 'new' \|\| projectId === 'new'/)
  assert.match(source, /const effectiveProjectId = isNewProjectRoute \? null : routeProjectId \|\| projectId/)
  assert.match(source, /if \(effectiveProjectId\) nextUrl\.searchParams\.set\('projectId', effectiveProjectId\)/)
})
