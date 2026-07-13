import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('route owners import the styles used by their rendered markup', async () => {
  const [loginSource, appLayoutSource, mainSource] = await Promise.all([
    readFile(new URL('src/views/Login.jsx', rootUrl), 'utf8'),
    readFile(new URL('src/components/app/AppLayout.jsx', rootUrl), 'utf8'),
    readFile(new URL('src/main.jsx', rootUrl), 'utf8'),
  ])

  assert.match(loginSource, /import ['"]\.\.\/styles\/login\.css['"]/)
  assert.match(appLayoutSource, /import ['"]\.\.\/\.\.\/styles\/command-console\.css['"]/)
  assert.doesNotMatch(mainSource, /styles\/(?:login|command-console)\.css/)
})
