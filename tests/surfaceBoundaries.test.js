import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function collectFiles(root, extensions = new Set(['.js', '.jsx'])) {
  const files = []

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        walk(path)
        continue
      }
      const ext = path.slice(path.lastIndexOf('.'))
      if (extensions.has(ext)) {
        files.push(path)
      }
    }
  }

  walk(root)
  return files
}

function read(path) {
  return readFileSync(path, 'utf8')
}

describe('surface boundaries', () => {
  it('does not import admin views from app or ops components', () => {
    const files = [
      ...collectFiles('src/components/app'),
      ...collectFiles('src/components/ops'),
    ]

    const offenders = files.filter((file) => read(file).includes('views/admin'))

    assert.deepEqual(offenders, [])
  })

  it('does not expose cross-surface links inside ops navigation config', () => {
    const source = read('src/components/ops/opsConfig.js')

    assert.equal(source.includes('/app/'), false)
    assert.equal(source.includes('/admin/'), false)
  })

  it('does not render cross-surface switch stacks inside business sidebars', () => {
    const files = [
      'src/components/app/AppLayout.jsx',
      'src/components/ops/OpsLayout.jsx',
      'src/components/admin/AdminLayout.jsx',
    ]
    const offenders = files.filter((file) => read(file).includes('workspace-sidebar__switch-stack'))

    assert.deepEqual(offenders, [])
  })

  it('does not expose credential rule configuration in app navigation', () => {
    const source = read('src/components/app/appConfig.js')

    for (const path of [
      '/credential/access-areas',
      '/credential/categories',
      '/credential/styles',
      '/credential/issue',
    ]) {
      assert.equal(source.includes(path), false)
    }
  })

  it('does not import app inventory views directly from execute warehouse pages', () => {
    const files = collectFiles('src/views/ops/warehouse')
    const offenders = files.filter((file) => read(file).includes('../../inventory'))

    assert.deepEqual(offenders, [])
  })

  it('does not redirect admin business routes back into app routes', () => {
    const adminLayout = read('src/components/admin/AdminLayout.jsx')
    const adminConfig = read('src/components/admin/adminConfig.js')

    assert.equal(adminLayout.includes('buildAppHref'), false)
    assert.equal(adminLayout.includes('/app/events'), false)
    assert.equal(adminLayout.includes('/app/inventory'), false)
    assert.equal(adminConfig.includes('/app/credential'), false)
  })

  it('does not remap app or ops business calls to admin APIs', () => {
    const source = read('src/utils/request.js')

    for (const path of ['/records', '/lottery', '/bib', '/clothing', '/import-sessions']) {
      assert.equal(source.includes(path), false)
    }
  })
})
