import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function readOrEmpty(path) {
  try {
    return await readFile(new URL(path, import.meta.url), 'utf8')
  } catch {
    return ''
  }
}

test('root verification includes team admin boundary tests', async () => {
  const packageJson = JSON.parse(await readOrEmpty('../../package.json'))
  assert.match(packageJson.scripts.test, /tests\/admin\/\*\.test\.mjs/)
})

test('team list page delegates data, workbook, and photo boundaries', async () => {
  const pageSource = await readOrEmpty('../../src/views/admin/TeamListPage.jsx')

  assert.doesNotMatch(pageSource, /from ['"]xlsx['"]/)
  assert.match(pageSource, /from ['"]\.\/teamListPageData\.js['"]/)
  assert.match(pageSource, /from ['"]\.\/teamMemberWorkbook\.js['"]/)
  assert.match(pageSource, /from ['"]\.\/TeamMemberPhoto['"]/)
  assert.doesNotMatch(pageSource, /function TeamMemberPhoto/)
  assert.ok(pageSource.split('\n').length <= 925)
})

test('team member photo component owns a typed URL lifecycle', async () => {
  const photoSource = await readOrEmpty('../../src/views/admin/TeamMemberPhoto.tsx')

  assert.match(photoSource, /interface TeamMemberPhotoProps/)
  assert.match(photoSource, /URL\.createObjectURL/)
  assert.match(photoSource, /URL\.revokeObjectURL/)
  assert.match(photoSource, /validatePortraitPhotoFile/)
})
