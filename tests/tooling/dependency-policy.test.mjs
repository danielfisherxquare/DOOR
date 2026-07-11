import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
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
  assert.equal(pkg.scripts.build, 'vite build && node scripts/check-build-boundaries.mjs')
})

test('workspace uses one lockfile and patched dependency releases', async () => {
  const pkg = await readPackageJson()

  await assert.rejects(access(new URL('../../server/package-lock.json', import.meta.url)), {
    code: 'ENOENT',
  })
  assert.equal(pkg.dependencies.xlsx, 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz')
  assert.equal(pkg.devDependencies.vite, '^8.1.4')
  assert.equal(pkg.devDependencies['@vitejs/plugin-react'], '^6.0.3')
  assert.equal(pkg.overrides.exceljs.uuid, '^11.1.1')
})

test('document tooling keeps independent formats in independent chunks', async () => {
  const pkg = await readPackageJson()
  const viteConfig = await readFile(new URL('../../vite.config.js', import.meta.url), 'utf8')

  assert.equal(pkg.dependencies.docxtemplater, undefined)
  assert.equal(pkg.dependencies['file-saver'], undefined)
  assert.match(viteConfig, /return 'vendor-xlsx'/)
  assert.match(viteConfig, /return 'vendor-pizzip'/)
  assert.doesNotMatch(viteConfig, /return 'vendor-docs'/)
})

test('React Three follows route boundaries instead of a forced shared chunk', async () => {
  const viteConfig = await readFile(new URL('../../vite.config.js', import.meta.url), 'utf8')
  const externalStoreRule = viteConfig.indexOf("id.includes('/use-sync-external-store/')")

  assert.ok(externalStoreRule >= 0)
  assert.match(viteConfig.slice(externalStoreRule), /return 'vendor-react'/)
  assert.doesNotMatch(viteConfig, /id\.includes\(['"]\/zustand\//)
  assert.doesNotMatch(viteConfig, /id\.includes\(['"]\/@react-three\//)
})
