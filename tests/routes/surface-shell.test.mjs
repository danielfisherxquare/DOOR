import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const layouts = [
  'src/components/app/AppLayout.jsx',
  'src/components/ops/OpsLayout.jsx',
  'src/components/admin/AdminLayout.jsx',
]

describe('shared surface shell', () => {
  it('owns the repeated sidebar and mobile menu markup', () => {
    for (const file of layouts) {
      const source = readFileSync(file, 'utf8')
      assert.match(source, /<SurfaceShell/)
      assert.equal(source.includes('<aside className="workspace-sidebar"'), false)
      assert.equal(source.includes('workspace-mobile-menu__panel'), false)
    }
  })

  it('replaces the unused legacy LayoutShell', () => {
    assert.equal(existsSync('src/components/shared/LayoutShell/LayoutShell.jsx'), false)
    const shell = readFileSync('src/components/surface/SurfaceShell.jsx', 'utf8')
    assert.match(shell, /<SurfaceSidebar/)
    assert.match(shell, /<SurfaceMobileMenu/)
    assert.match(shell, /workspace-main__content/)
  })
})
