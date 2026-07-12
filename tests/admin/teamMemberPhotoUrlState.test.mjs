import assert from 'node:assert/strict'
import test from 'node:test'

async function loadPhotoUrlState() {
  try {
    return await import('../../src/views/admin/teamMemberPhotoUrlState.js')
  } catch {
    return null
  }
}

test('photo URL state clears the previous identity and rejects stale responses', async () => {
  const photoUrlState = await loadPhotoUrlState()
  assert.ok(photoUrlState, 'team member photo URL state module must exist')

  const revoked = []
  const state = photoUrlState.createTeamMemberPhotoUrlState({
    createObjectUrl: (blob) => `blob:${blob.id}`,
    revokeObjectUrl: (url) => revoked.push(url),
  })

  const firstRequest = state.beginRequest()
  assert.equal(state.resolveRequest(firstRequest, { id: 'member-1' }), 'blob:member-1')
  assert.equal(state.currentUrl(), 'blob:member-1')

  const secondRequest = state.beginRequest()
  assert.equal(state.currentUrl(), '')
  assert.deepEqual(revoked, ['blob:member-1'])
  assert.equal(state.resolveRequest(firstRequest, { id: 'stale-member-1' }), '')
  assert.equal(state.resolveRequest(secondRequest, { id: 'member-2' }), 'blob:member-2')
  assert.equal(state.currentUrl(), 'blob:member-2')
})

test('photo URL state releases the current URL on unmount and invalidates pending work', async () => {
  const photoUrlState = await loadPhotoUrlState()
  assert.ok(photoUrlState, 'team member photo URL state module must exist')

  const revoked = []
  const state = photoUrlState.createTeamMemberPhotoUrlState({
    createObjectUrl: (blob) => `blob:${blob.id}`,
    revokeObjectUrl: (url) => revoked.push(url),
  })

  const request = state.beginRequest()
  assert.equal(state.resolveRequest(request, { id: 'member-1' }), 'blob:member-1')
  state.dispose()

  assert.equal(state.currentUrl(), '')
  assert.deepEqual(revoked, ['blob:member-1'])
  assert.equal(state.resolveRequest(request, { id: 'late-member-1' }), '')
})

test('photo visibility rejects an old URL during the first render of a new identity', async () => {
  const photoUrlState = await loadPhotoUrlState()
  assert.ok(photoUrlState, 'team member photo URL state module must exist')

  const previousIdentity = photoUrlState.createTeamMemberPhotoIdentity({
    teamMemberId: 1,
    orgId: 'org-1',
    token: 'token-1',
  })
  const nextIdentity = photoUrlState.createTeamMemberPhotoIdentity({
    teamMemberId: 2,
    orgId: 'org-1',
    token: 'token-1',
  })
  const previousPhoto = { identity: previousIdentity, src: 'blob:member-1' }

  assert.equal(
    photoUrlState.getVisibleTeamMemberPhotoSrc(previousPhoto, previousIdentity),
    'blob:member-1',
  )
  assert.equal(photoUrlState.getVisibleTeamMemberPhotoSrc(previousPhoto, nextIdentity), '')
})
