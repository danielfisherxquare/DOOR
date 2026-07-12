/**
 * @param {{
 *   createObjectUrl: (blob: Blob) => string,
 *   revokeObjectUrl: (url: string) => void,
 * }} dependencies
 */
export function createTeamMemberPhotoUrlState({ createObjectUrl, revokeObjectUrl }) {
  let generation = 0
  let objectUrl = ''

  const releaseCurrentUrl = () => {
    if (!objectUrl) return
    revokeObjectUrl(objectUrl)
    objectUrl = ''
  }

  return {
    beginRequest() {
      generation += 1
      releaseCurrentUrl()
      return generation
    },

    /** @param {number} requestGeneration @param {Blob} blob */
    resolveRequest(requestGeneration, blob) {
      if (requestGeneration !== generation) return ''
      releaseCurrentUrl()
      objectUrl = createObjectUrl(blob)
      return objectUrl
    },

    currentUrl() {
      return objectUrl
    },

    dispose() {
      generation += 1
      releaseCurrentUrl()
    },
  }
}

/**
 * @param {{ teamMemberId: string | number, orgId?: string, token?: string }} identity
 */
export function createTeamMemberPhotoIdentity({ teamMemberId, orgId, token }) {
  return JSON.stringify([String(teamMemberId), orgId || '', token || ''])
}

/**
 * @param {{ identity: string, src: string }} photo
 * @param {string} currentIdentity
 */
export function getVisibleTeamMemberPhotoSrc(photo, currentIdentity) {
  return photo.identity === currentIdentity ? photo.src : ''
}
