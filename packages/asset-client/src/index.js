import { ApiError } from '@arcspro/contracts'

function unwrap(response) {
  if (response?.success === true) return response.data
  if (response?.data?.success === true) return response.data.data
  throw new ApiError(response?.error?.message || '素材服务返回了无效响应', {
    code: response?.error?.code || 'ASSET_INVALID_RESPONSE',
    details: response,
  })
}

async function sha256Hex(file) {
  if (!globalThis.crypto?.subtle) throw new ApiError('当前运行环境无法计算 SHA-256', { code: 'ASSET_HASH_UNAVAILABLE' })
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function mutationId(prefix = 'asset') {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

async function uploadThroughProtocol({ request, file, initRoute, initPayload, onProgress }) {
  onProgress({ phase: 'hashing', loaded: 0, total: file.size })
  const sha256 = await sha256Hex(file)
  const initialized = unwrap(await request.post(initRoute, {
    ...initPayload,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    sha256,
    modifiedAt: new Date(file.lastModified || Date.now()).toISOString(),
  }))
  if (initialized.mode === 'deduplicated') {
    onProgress({ phase: 'completed', loaded: file.size, total: file.size })
    return initialized.asset
  }
  const parts = []
  for (let offset = 0, partNumber = 1; offset < file.size; offset += initialized.partSize, partNumber += 1) {
    const form = new FormData()
    form.append('partNumber', String(partNumber))
    form.append('part', file.slice(offset, Math.min(offset + initialized.partSize, file.size)), `${file.name}.part-${partNumber}`)
    const part = unwrap(await request.post(`/app/assets/uploads/${initialized.uploadId}/parts`, form))
    parts.push(part)
    onProgress({ phase: 'uploading', loaded: Math.min(offset + initialized.partSize, file.size), total: file.size, partNumber })
  }
  const asset = unwrap(await request.post(`/app/assets/uploads/${initialized.uploadId}/complete`, { parts, clientMutationId: initPayload.clientMutationId }))
  onProgress({ phase: 'completed', loaded: file.size, total: file.size })
  return asset
}

export function createAssetClient({ request, rawRequest }) {
  if (!request || typeof request.get !== 'function' || typeof request.post !== 'function') {
    throw new TypeError('createAssetClient requires a request transport')
  }

  return Object.freeze({
    async getContext() {
      return unwrap(await request.get('/app/assets/context'))
    },

    async listAssets(query = {}) {
      return unwrap(await request.get('/app/assets', { params: query }))
    },

    async createFolder(input) {
      return unwrap(await request.post('/app/assets/folders', input))
    },

    async patchFolder(folderId, patch) {
      return unwrap(await request.patch(`/app/assets/folders/${folderId}`, patch))
    },

    async deleteFolder(folderId, baseRevision) {
      return unwrap(await request.delete(`/app/assets/folders/${folderId}`, { params: { baseRevision } }))
    },

    async createTag(input) {
      return unwrap(await request.post('/app/assets/tags', input))
    },

    async patchTag(tagId, patch) {
      return unwrap(await request.patch(`/app/assets/tags/${tagId}`, patch))
    },

    async deleteTag(tagId, baseRevision) {
      return unwrap(await request.delete(`/app/assets/tags/${tagId}`, { params: { baseRevision } }))
    },

    async uploadFile(file, { libraryId, folderId = null, onProgress = () => {} } = {}) {
      const clientMutationId = mutationId('upload')
      return uploadThroughProtocol({ request, file, initRoute: '/app/assets/uploads/init', initPayload: { libraryId, folderId, clientMutationId }, onProgress })
    },

    async uploadNewVersion(assetId, baseRevision, file, { onProgress = () => {} } = {}) {
      const clientMutationId = mutationId('version')
      return uploadThroughProtocol({
        request,
        file,
        initRoute: `/app/assets/${assetId}/versions/uploads/init`,
        initPayload: { baseRevision, clientMutationId },
        onProgress,
      })
    },

    async patchAsset(assetId, patch) {
      return unwrap(await request.patch(`/app/assets/${assetId}`, patch))
    },

    async deleteAsset(assetId, baseRevision) {
      return unwrap(await request.delete(`/app/assets/${assetId}`, { params: { baseRevision } }))
    },

    async pullChanges(cursor = '0', limit = 100) {
      return unwrap(await request.get('/app/assets/sync', { params: { cursor, limit } }))
    },

    async pushChanges(changes) {
      return unwrap(await request.post('/app/assets/sync/changes', { clientMutationId: mutationId('sync'), changes }))
    },

    async downloadAsset(asset) {
      if (!rawRequest) throw new ApiError('当前客户端未配置二进制下载', { code: 'ASSET_DOWNLOAD_UNAVAILABLE' })
      return rawRequest.get(`/app/assets/${asset.id}/download`, { responseType: 'blob' })
    },

    async listVersions(assetId) {
      return unwrap(await request.get(`/app/assets/${assetId}/versions`))
    },

    async downloadVersion(assetId, versionId) {
      if (!rawRequest) throw new ApiError('当前客户端未配置二进制下载', { code: 'ASSET_DOWNLOAD_UNAVAILABLE' })
      return rawRequest.get(`/app/assets/${assetId}/versions/${versionId}/download`, { responseType: 'blob' })
    },

    async getThumbnail(assetId) {
      if (!rawRequest) throw new ApiError('当前客户端未配置二进制请求', { code: 'ASSET_THUMBNAIL_UNAVAILABLE' })
      const response = await rawRequest.get(`/app/assets/${assetId}/thumbnail`, { responseType: 'blob' })
      return response.data
    },
  })
}

export { sha256Hex }
