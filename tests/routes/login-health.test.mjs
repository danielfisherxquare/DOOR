import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('login status reflects the live backend instead of a static success claim', async () => {
  const source = await readFile(new URL('src/views/Login.jsx', rootUrl), 'utf8')
  const styles = await readFile(new URL('src/styles/login.css', rootUrl), 'utf8')

  assert.match(source, /requestRaw/)
  assert.match(source, /\.get\('\/health\/live'/)
  assert.doesNotMatch(source, /\bfetch\s*\(/)
  assert.match(source, /serviceStatus/)
  assert.doesNotMatch(source, />当前服务正常</)
  assert.match(styles, /login-brand__status-dot--offline/)
  assert.match(styles, /login-brand__status-dot--checking/)
})
