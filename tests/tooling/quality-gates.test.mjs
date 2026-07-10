import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('ESLint flat config parses TypeScript and checks React hooks', async () => {
  const config = await readFile(new URL('eslint.config.js', rootUrl), 'utf8')
  const packageJson = JSON.parse(await readFile(new URL('package.json', rootUrl), 'utf8'))

  assert.match(config, /@typescript-eslint\/parser/)
  assert.match(config, /eslint-plugin-react-hooks/)
  assert.match(config, /src\/\*\*\/\*\.\{ts,tsx\}/)
  assert.match(config, /packages\/\*\*\/\*\.\{js,mjs\}/)
  assert.match(packageJson.scripts.lint, /packages/)
})

test('TypeScript gate includes every TypeScript source file', async () => {
  const config = JSON.parse(await readFile(new URL('tsconfig.json', rootUrl), 'utf8'))

  assert.deepEqual(config.include, ['src/**/*.ts', 'src/**/*.tsx'])
  assert.equal(config.compilerOptions.noEmit, true)
  assert.equal(config.compilerOptions.moduleResolution, 'Bundler')
})

test('Prettier gate has an explicit legacy-debt boundary', async () => {
  const ignore = await readFile(new URL('.prettierignore', rootUrl), 'utf8')

  assert.match(ignore, /^dist\/$/m)
  assert.match(ignore, /^server\/$/m)
  assert.match(ignore, /^src\/$/m)
  assert.match(ignore, /Remove `src\/`/)
})
