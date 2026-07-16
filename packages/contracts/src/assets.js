import { z } from 'zod'

export const ASSET_KINDS = Object.freeze([
  'image',
  'video',
  'audio',
  'document',
  'design',
  'archive',
  'other',
])

export const ASSET_SYNC_OPERATIONS = Object.freeze(['upsert', 'delete'])

export const ASSET_ERROR_CODES = Object.freeze({
  forbidden: 'ASSET_FORBIDDEN',
  notFound: 'ASSET_NOT_FOUND',
  conflict: 'ASSET_REVISION_CONFLICT',
  hashMismatch: 'ASSET_HASH_MISMATCH',
  quotaExceeded: 'ASSET_QUOTA_EXCEEDED',
  storageUnavailable: 'ASSET_STORAGE_UNAVAILABLE',
  uploadExpired: 'ASSET_UPLOAD_EXPIRED',
  validationFailed: 'ASSET_VALIDATION_FAILED',
  folderNotEmpty: 'ASSET_FOLDER_NOT_EMPTY',
})

const IdSchema = z.string().trim().min(1).max(128)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, '必须是 64 位 SHA-256')
const ColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, '必须是 6 位十六进制颜色')
const BaseRevisionSchema = z.coerce.number().int().positive()

export const AssetListQuerySchema = z.object({
  libraryId: IdSchema.optional(),
  folderId: z.union([IdSchema, z.literal('root')]).optional(),
  cursor: z.string().trim().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(48),
  search: z.string().trim().max(200).optional(),
  kinds: z.union([
    z.enum(ASSET_KINDS),
    z.array(z.enum(ASSET_KINDS)),
  ]).optional(),
  tags: z.union([IdSchema, z.array(IdSchema)]).optional(),
  sort: z.enum(['updated-desc', 'created-desc', 'name-asc', 'size-desc']).default('updated-desc'),
  deleted: z.coerce.boolean().default(false),
})

export const AssetUploadInitSchema = z.object({
  libraryId: IdSchema.optional(),
  folderId: IdSchema.nullish(),
  fileName: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(255),
  size: z.coerce.number().int().positive().max(10 * 1024 * 1024 * 1024),
  sha256: Sha256Schema,
  modifiedAt: z.string().datetime({ offset: true }).optional(),
  clientMutationId: IdSchema,
})

export const AssetUploadCompleteSchema = z.object({
  parts: z.array(z.object({
    partNumber: z.coerce.number().int().min(1).max(10000),
    etag: z.string().trim().min(1).max(128),
  })).min(1).max(10000),
  clientMutationId: IdSchema,
})

export const AssetVersionUploadInitSchema = AssetUploadInitSchema.omit({
  libraryId: true,
  folderId: true,
}).extend({
  baseRevision: BaseRevisionSchema,
})

export const AssetFolderCreateSchema = z.object({
  libraryId: IdSchema.optional(),
  parentId: IdSchema.nullish(),
  name: z.string().trim().min(1).max(200),
})

export const AssetFolderPatchSchema = z.object({
  baseRevision: BaseRevisionSchema,
  name: z.string().trim().min(1).max(200).optional(),
  parentId: IdSchema.nullable().optional(),
}).refine(
  (value) => value.name !== undefined || value.parentId !== undefined,
  { message: '至少提交一个可修改字段' },
)

export const AssetTagCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: ColorSchema.default('#d8262c'),
})

export const AssetTagPatchSchema = z.object({
  baseRevision: BaseRevisionSchema,
  name: z.string().trim().min(1).max(80).optional(),
  color: ColorSchema.optional(),
}).refine(
  (value) => value.name !== undefined || value.color !== undefined,
  { message: '至少提交一个可修改字段' },
)

const AssetPatchFieldsSchema = z.object({
  name: z.string().trim().min(1).max(512).optional(),
  folderId: IdSchema.nullable().optional(),
  note: z.string().trim().max(5000).nullable().optional(),
  rating: z.number().int().min(0).max(5).nullable().optional(),
  tagIds: z.array(IdSchema).max(100).optional(),
})

export const AssetPatchSchema = AssetPatchFieldsSchema.extend({
  baseRevision: z.number().int().positive(),
}).refine(
  (value) => Object.keys(value).some((key) => key !== 'baseRevision'),
  { message: '至少提交一个可修改字段' },
)

export const AssetChangePushSchema = z.object({
  clientMutationId: IdSchema,
  changes: z.array(z.object({
    assetId: IdSchema,
    operation: z.enum(ASSET_SYNC_OPERATIONS),
    baseRevision: z.number().int().positive(),
    patch: AssetPatchFieldsSchema.optional(),
  })).min(1).max(100),
})

function normalizeMultiValue(value) {
  if (value === undefined) return undefined
  const values = Array.isArray(value) ? value : String(value).split(',')
  return values.map((entry) => String(entry).trim()).filter(Boolean)
}

export function parseAssetListQuery(input) {
  return AssetListQuerySchema.parse({
    ...input,
    kinds: normalizeMultiValue(input?.kinds),
    tags: normalizeMultiValue(input?.tags),
  })
}

export function parseAssetUploadInit(input) {
  return AssetUploadInitSchema.parse(input)
}

export function parseAssetUploadComplete(input) {
  return AssetUploadCompleteSchema.parse(input)
}

export function parseAssetVersionUploadInit(input) {
  return AssetVersionUploadInitSchema.parse(input)
}

export function parseAssetFolderCreate(input) {
  return AssetFolderCreateSchema.parse(input)
}

export function parseAssetFolderPatch(input) {
  return AssetFolderPatchSchema.parse(input)
}

export function parseAssetTagCreate(input) {
  return AssetTagCreateSchema.parse(input)
}

export function parseAssetTagPatch(input) {
  return AssetTagPatchSchema.parse(input)
}

export function parseAssetPatch(input) {
  return AssetPatchSchema.parse(input)
}

export function parseAssetChangePush(input) {
  return AssetChangePushSchema.parse(input)
}

export function assetKindFromMimeType(mimeType = '', fileName = '') {
  const normalizedMime = String(mimeType).toLowerCase()
  const extension = String(fileName).split('.').pop()?.toLowerCase() || ''
  if (normalizedMime.startsWith('image/')) return 'image'
  if (normalizedMime.startsWith('video/')) return 'video'
  if (normalizedMime.startsWith('audio/')) return 'audio'
  if (['psd', 'ai', 'eps', 'sketch', 'fig', 'xd'].includes(extension)) return 'design'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'archive'
  if (
    normalizedMime.startsWith('text/')
    || normalizedMime.includes('pdf')
    || normalizedMime.includes('document')
    || normalizedMime.includes('spreadsheet')
    || normalizedMime.includes('presentation')
  ) return 'document'
  return 'other'
}
