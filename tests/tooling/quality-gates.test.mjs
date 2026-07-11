import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

test('ESLint flat config parses TypeScript and checks React JSX and hooks', async () => {
  const config = await readFile(new URL('eslint.config.js', rootUrl), 'utf8')
  const packageJson = JSON.parse(await readFile(new URL('package.json', rootUrl), 'utf8'))

  assert.match(config, /@typescript-eslint\/parser/)
  assert.match(config, /eslint-plugin-react'/)
  assert.match(config, /eslint-plugin-react-hooks/)
  assert.match(config, /react\/jsx-no-undef/)
  assert.match(config, /react\/jsx-uses-vars/)
  assert.match(config, /src\/\*\*\/\*\.\{ts,tsx\}/)
  assert.match(config, /packages\/\*\*\/\*\.\{js,mjs\}/)
  assert.match(packageJson.scripts.lint, /packages/)
  assert.match(packageJson.devDependencies['eslint-plugin-react'], /^\^7\./)
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

test('default frontend test gate includes route registry contracts', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', rootUrl), 'utf8'))

  assert.match(packageJson.scripts.test, /tests\/routes\/\*\.test\.mjs/)
  assert.match(packageJson.scripts.test, /tests\/3d-studio\/studioModelParity\.test\.mjs/)
})
