import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const navigation = await import('../../src/features/workspace/workspaceNavigation.js').catch(() => ({}))

describe('super admin surface navigation', () => {
  it('lands a platform super admin on the surface launcher', () => {
    assert.equal(typeof navigation.resolveLoginDestination, 'function')
    assert.equal(navigation.resolveLoginDestination({
      hasPlatformProfile: true,
      defaultLanding: '/admin',
    }), '/launcher')
  })

  it('preserves explicit protected route returns over the launcher default', () => {
    assert.equal(typeof navigation.resolveLoginDestination, 'function')
    assert.equal(navigation.resolveLoginDestination({
      hasPlatformProfile: true,
      defaultLanding: '/admin',
      protectedRouteReturn: '/admin/team',
    }), '/admin/team')
  })

  it('allows the platform workspace to return to the launcher', () => {
    assert.equal(typeof navigation.resolvePlatformWorkspaceTarget, 'function')
    assert.equal(navigation.resolvePlatformWorkspaceTarget('/launcher'), '/launcher')
    assert.equal(navigation.resolvePlatformWorkspaceTarget('/admin/team'), '/admin/team')
    assert.equal(navigation.resolvePlatformWorkspaceTarget('/app'), '/admin')
    assert.equal(navigation.resolvePlatformWorkspaceTarget('/ops'), '/admin')
  })

  it('requires a business workspace before opening app or ops from platform scope', () => {
    assert.equal(typeof navigation.resolveSurfaceWorkspaceRedirect, 'function')
    assert.equal(navigation.resolveSurfaceWorkspaceRedirect({ scopeType: 'platform', surface: 'app' }), '/workspaces/select?redirect=%2Fapp')
    assert.equal(navigation.resolveSurfaceWorkspaceRedirect({ scopeType: 'platform', surface: 'ops' }), '/workspaces/select?redirect=%2Fops')
    assert.equal(navigation.resolveSurfaceWorkspaceRedirect({ scopeType: 'platform', surface: 'admin' }), '')
    assert.equal(navigation.resolveSurfaceWorkspaceRedirect({ scopeType: 'race', surface: 'ops' }), '')
  })
})
