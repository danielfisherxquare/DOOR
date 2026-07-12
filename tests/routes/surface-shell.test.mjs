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

  it('exposes the surface launcher from desktop and mobile navigation', () => {
    const sidebar = readFileSync('src/components/surface/SurfaceSidebar.jsx', 'utf8')
    const mobileMenu = readFileSync('src/components/surface/SurfaceMobileMenu.jsx', 'utf8')

    for (const source of [sidebar, mobileMenu]) {
      assert.match(source, /to="\/launcher"/)
      assert.match(source, /切换入口/)
    }
  })

  it('routes platform app and ops requests through workspace selection', () => {
    const guard = readFileSync('src/components/SurfaceProtectedRoute.jsx', 'utf8')

    assert.match(guard, /resolveSurfaceWorkspaceRedirect/)
    assert.match(guard, /platformWorkspaceRedirect/)
  })
})
