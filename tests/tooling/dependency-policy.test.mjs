import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJsonUrl = new URL('../../package.json', import.meta.url)

async function readPackageJson() {
  return JSON.parse(await readFile(packageJsonUrl, 'utf8'))
}

test('Pascal packages use one peer-compatible release family', async () => {
  const pkg = await readPackageJson()

  assert.equal(pkg.dependencies['@pascal-app/core'], '^0.6.0')
  assert.equal(pkg.dependencies['@pascal-app/viewer'], '^0.6.0')
  assert.equal(pkg.dependencies.three, '^0.184.0')
})

test('React types and quality tools match the application runtime', async () => {
  const pkg = await readPackageJson()

  assert.equal(pkg.dependencies['react-leaflet'], '^5.0.0')
  assert.match(pkg.devDependencies['@types/react'], /^\^19\./)
  assert.match(pkg.devDependencies['@types/react-dom'], /^\^19\./)
  assert.ok(pkg.devDependencies['@typescript-eslint/eslint-plugin'])
  assert.ok(pkg.devDependencies['@typescript-eslint/parser'])
  assert.ok(pkg.devDependencies.eslint)
  assert.ok(pkg.devDependencies.prettier)
  assert.ok(pkg.devDependencies.typescript)
})

test('root scripts expose one repeatable verification entry point', async () => {
  const pkg = await readPackageJson()

  assert.ok(pkg.scripts.test)
  assert.ok(pkg.scripts.lint)
  assert.ok(pkg.scripts['format:check'])
  assert.ok(pkg.scripts.typecheck)
})
