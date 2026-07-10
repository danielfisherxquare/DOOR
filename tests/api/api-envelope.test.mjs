import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('pipeline API returns the canonical response envelope without guessing', async () => {
  const source = await readFile(new URL('src/api/pipeline.js', rootUrl), 'utf8')

  assert.doesNotMatch(source, /unwrapData/)
  assert.doesNotMatch(source, /\.then\(/)
  assert.match(source, /request\.get/)
  assert.match(source, /request\.post/)
})
