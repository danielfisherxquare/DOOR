export interface AssetTag { id: string; name: string; color: string; revision: number }
export interface AssetFolder { id: string; libraryId: string; parentId: string | null; name: string; revision: number }
export interface AssetActor { id: string; username: string }
export interface AssetVersion {
  id: string
  version: number
  fileName: string
  size: number
  sha256: string
  mimeType: string
  width: number | null
  height: number | null
  createdBy: AssetActor | null
  createdAt: string
  downloadUrl: string
}
export interface AssetUploadProgress { phase: string; loaded: number; total: number; partNumber?: number }
export interface AssetItem {
  id: string
  orgId: string
  libraryId: string
  folderId: string | null
  name: string
  kind: string
  note: string | null
  rating: number | null
  revision: number
  currentVersion: number
  size: number
  sha256: string
  mimeType: string
  width: number | null
  height: number | null
  thumbnailUrl: string | null
  downloadUrl: string
  tags: AssetTag[]
  createdBy: AssetActor | null
  updatedBy: AssetActor | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
export interface AssetClient {
  getContext(): Promise<{ libraries: Array<{ id: string; name: string; isDefault: boolean }>; folders: AssetFolder[]; tags: AssetTag[] }>
  listAssets(query?: Record<string, unknown>): Promise<{ items: AssetItem[]; nextCursor: string | null; hasMore: boolean }>
  createFolder(input: { libraryId?: string; parentId?: string | null; name: string }): Promise<AssetFolder>
  patchFolder(folderId: string, patch: { baseRevision: number; name?: string; parentId?: string | null }): Promise<AssetFolder>
  deleteFolder(folderId: string, baseRevision: number): Promise<{ id: string }>
  createTag(input: { name: string; color?: string }): Promise<AssetTag>
  patchTag(tagId: string, patch: { baseRevision: number; name?: string; color?: string }): Promise<AssetTag>
  deleteTag(tagId: string, baseRevision: number): Promise<{ id: string }>
  uploadFile(file: File, options?: { libraryId?: string; folderId?: string | null; onProgress?: (event: AssetUploadProgress) => void }): Promise<AssetItem>
  uploadNewVersion(assetId: string, baseRevision: number, file: File, options?: { onProgress?: (event: AssetUploadProgress) => void }): Promise<AssetItem>
  patchAsset(assetId: string, patch: { baseRevision: number; name?: string; folderId?: string | null; note?: string | null; rating?: number | null; tagIds?: string[] }): Promise<AssetItem>
  deleteAsset(assetId: string, baseRevision: number): Promise<{ id: string; revision: number }>
  pullChanges(cursor?: string, limit?: number): Promise<{ changes: unknown[]; tombstones: unknown[]; nextCursor: string; hasMore: boolean; serverTime: string }>
  pushChanges(changes: unknown[]): Promise<unknown>
  downloadAsset(asset: { id: string }): Promise<{ data: Blob }>
  getPreview(assetId: string): Promise<Blob>
  listVersions(assetId: string): Promise<{ items: AssetVersion[] }>
  downloadVersion(assetId: string, versionId: string): Promise<{ data: Blob }>
  getThumbnail(assetId: string): Promise<Blob>
}
export function createAssetClient(options: { request: unknown; rawRequest?: unknown }): AssetClient
export function sha256Hex(file: Blob): Promise<string>
