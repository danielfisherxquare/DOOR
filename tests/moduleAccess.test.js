import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MODULES, hasModuleAccess } from '../src/utils/moduleAccess.js'

describe('module access helper', () => {
  it('allows default modules for scoped users', () => {
    const user = { role: 'user', moduleAccess: [] }

    for (const moduleId of DEFAULT_MODULES) {
      const [surface, id] = moduleId.split(':')
      assert.equal(hasModuleAccess(user, surface, id), true)
    }
  })

  it('uses explicit moduleAccess for non-default modules', () => {
    const user = { role: 'race_admin', moduleAccess: ['app:map', 'ops:scan'] }

    assert.equal(hasModuleAccess(user, 'app', 'map'), true)
    assert.equal(hasModuleAccess(user, 'ops', 'scan'), true)
    assert.equal(hasModuleAccess(user, 'admin', 'dashboard'), false)
  })

  it('keeps org_admin and super_admin on full access', () => {
    assert.equal(hasModuleAccess({ role: 'org_admin', moduleAccess: [] }, 'admin', 'dashboard'), true)
    assert.equal(hasModuleAccess({ role: 'super_admin', moduleAccess: [] }, 'ops', 'scan'), true)
  })
})
