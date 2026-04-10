import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../src/utils/surfaceContext.js'

function createSearchParams(values = {}) {
  return {
    get(key) {
      return values[key] ?? null
    },
  }
}

describe('surface context helpers', () => {
  it('prefers explicit raceId from URL', () => {
    const searchParams = createSearchParams({ orgId: 'org-a', raceId: 'race-url' })
    const user = {
      preferences: { lastOrgId: 'org-a', lastRaceId: 'race-pref' },
    }

    assert.equal(resolveSurfaceRaceId(searchParams, user, 'org-a'), 'race-url')
  })

  it('does not restore lastRaceId across different orgs', () => {
    const searchParams = createSearchParams({ orgId: 'org-b' })
    const user = {
      orgId: 'org-a',
      preferences: { lastOrgId: 'org-a', lastRaceId: 42 },
    }

    assert.equal(resolveSurfaceOrgId(searchParams, user), 'org-b')
    assert.equal(resolveSurfaceRaceId(searchParams, user, 'org-b'), '')
  })

  it('restores lastRaceId when the preferred org matches current org', () => {
    const searchParams = createSearchParams({ orgId: 'org-a' })
    const user = {
      preferences: { lastOrgId: 'org-a', lastRaceId: 42 },
    }

    assert.equal(resolveSurfaceRaceId(searchParams, user, 'org-a'), '42')
  })
})
