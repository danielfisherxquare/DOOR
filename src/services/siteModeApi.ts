import { z } from 'zod'
import request from '../utils/request'
import type {
  MapProviderKey,
  MapProviderRuntimeEntry,
  MapProviderStatus,
} from '../utils/map/providerRuntimeStatus'

const SITE_BAKE_TIMEOUT_MS = 90000

export type JsonObject = Record<string, unknown>

export interface GeoAnchor {
  longitude: number
  latitude: number
  height?: number
}

export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export type SiteProviderItemStatus = Pick<
  MapProviderRuntimeEntry,
  'provider' | 'status' | 'itemCount' | 'message' | 'retryable'
>

export type SiteProviderStatus = Record<MapProviderKey, SiteProviderItemStatus>

export interface StudioProjectRecord {
  id: string
  orgId: string | null
  name: string
  sceneType: 'warehouse' | 'outdoor-event'
  projectType: 'warehouse' | 'venue' | 'site' | 'mixed' | 'asset'
  status: 'draft' | 'active' | 'archived'
  revision: number
  siteFocusZoneId?: string | null
  geoAnchor: GeoAnchor | null
  snapshotJson: JsonObject
  updatedAt: string | null
}

export interface TerrainWorkZoneRecord {
  id: string
  projectId: string
  name: string
  zoneType: string
  clipPolygonWgs84: GeoJsonPolygon
  originWgs84: GeoAnchor | null
  terrainResolution: number
  includedObjectIds: string[]
  snapshotJson: JsonObject
  orthophoto: JsonObject | null
  metadata: JsonObject
  updatedAt: string | null
}

export interface CreateSiteProjectInput {
  name: string
  sceneType: 'outdoor-event'
  projectType: 'site'
  status: 'draft'
  sourceType: 'blank'
  geoAnchor: GeoAnchor
  snapshotJson: JsonObject
}

export interface UpsertSiteFocusZoneInput {
  name: string
  zoneType: 'focus-zone'
  clipPolygonWgs84: GeoJsonPolygon
  originWgs84: GeoAnchor
  terrainResolution: number
  includedObjectIds: string[]
  publishTarget: JsonObject
  metadata: JsonObject
  status: 'ready'
}

export interface BakeProjectSiteInput {
  focusZoneId?: string
  focusZone?: UpsertSiteFocusZoneInput
  expectedRevision: number
  clientMutationId?: string
  orthophoto?: {
    zoom?: number
    maxTiles?: number
  }
}

export interface SaveSiteModeInput {
  focusZoneId: string
  snapshotJson: JsonObject
  warehouseId?: string
  expectedRevision: number
  clientMutationId?: string
}

export type SaveFocusZoneWorkbenchInput = SaveSiteModeInput

export interface SiteModeMutationResult {
  project: StudioProjectRecord
  workZone: TerrainWorkZoneRecord
  focusZone: TerrainWorkZoneRecord
  revision: number
  bakeStatus: 'ready' | 'degraded' | 'failed'
  providerStatus: SiteProviderStatus
  warnings: string[]
  sceneSnapshot?: JsonObject
}

const jsonObjectSchema = z.preprocess(
  (value) => value == null ? {} : value,
  z.record(z.string(), z.unknown()),
)
const geoAnchorSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
  height: z.number().optional(),
})
const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()))),
})
const projectSchema = z.object({
  id: z.string(),
  orgId: z.string().nullable().default(null),
  name: z.string(),
  sceneType: z.enum(['warehouse', 'outdoor-event']),
  projectType: z.enum(['warehouse', 'venue', 'site', 'mixed', 'asset']),
  status: z.enum(['draft', 'active', 'archived']),
  revision: z.number().int().nonnegative(),
  siteFocusZoneId: z.string().nullable().default(null),
  geoAnchor: geoAnchorSchema.nullable().default(null),
  snapshotJson: jsonObjectSchema.default({}),
  updatedAt: z.string().nullable().default(null),
}).passthrough()
const workZoneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  zoneType: z.string(),
  clipPolygonWgs84: polygonSchema,
  originWgs84: geoAnchorSchema.nullable().default(null),
  terrainResolution: z.number().default(2),
  includedObjectIds: z.array(z.string()).default([]),
  snapshotJson: jsonObjectSchema.default({}),
  orthophoto: jsonObjectSchema.nullable().default(null),
  metadata: jsonObjectSchema.default({}),
  updatedAt: z.string().nullable().default(null),
}).passthrough()

const providerStateSchema: z.ZodType<MapProviderStatus> = z.enum([
  'loading',
  'ready',
  'degraded',
  'failed',
  'unavailable',
])
const providerItemSchema = z.object({
  provider: z.string().default('unknown'),
  status: providerStateSchema.default('unavailable'),
  itemCount: z.number().optional(),
  message: z.string().optional(),
  retryable: z.boolean().default(false),
}).passthrough()
const unavailableProvider = {
  provider: 'unknown',
  status: 'unavailable',
  retryable: false,
} as const
const providerStatusSchema = z.object({
  imagery: providerItemSchema.default(unavailableProvider),
  terrain: providerItemSchema.default(unavailableProvider),
  buildings: providerItemSchema.default(unavailableProvider),
}).default({
  imagery: unavailableProvider,
  terrain: unavailableProvider,
  buildings: unavailableProvider,
})
const mutationResultSchema = z.object({
  project: projectSchema,
  workZone: workZoneSchema,
  focusZone: workZoneSchema,
  revision: z.number().int().nonnegative(),
  bakeStatus: z.enum(['ready', 'degraded', 'failed']).default('degraded'),
  providerStatus: providerStatusSchema,
  warnings: z.array(z.string()).default([]),
  sceneSnapshot: jsonObjectSchema.optional(),
}).passthrough()

function withOrgId(orgId?: string | null): { orgId?: string } {
  return orgId ? { orgId } : {}
}

function parseEnvelope<T>(raw: unknown, schema: z.ZodType<T>, operation: string): T {
  const envelope = z.object({ success: z.boolean(), data: z.unknown() }).safeParse(raw)
  if (!envelope.success || envelope.data.success !== true) {
    throw new Error(`${operation}返回格式无效`)
  }
  const parsed = schema.safeParse(envelope.data.data)
  if (!parsed.success) {
    throw new Error(`${operation}返回数据不完整：${parsed.error.issues[0]?.message || 'unknown'}`)
  }
  return parsed.data
}

export function createSiteMutationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function isRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as {
    status?: number
    code?: string
    apiCode?: string
    response?: { data?: { code?: string } }
  }
  return candidate.status === 409
    && (candidate.code === 'REVISION_CONFLICT'
      || candidate.apiCode === 'REVISION_CONFLICT'
      || candidate.response?.data?.code === 'REVISION_CONFLICT')
}

const siteModeApi = {
  async getProject(projectId: string, orgId?: string | null): Promise<StudioProjectRecord> {
    const raw: unknown = await request.get(`/app/3d-studio/projects/${projectId}`, {
      params: withOrgId(orgId),
    })
    return parseEnvelope(raw, projectSchema, '读取 3D 项目')
  },

  async createProject(
    data: CreateSiteProjectInput,
    orgId?: string | null,
  ): Promise<StudioProjectRecord> {
    const raw: unknown = await request.post('/app/3d-studio/projects', data, {
      params: withOrgId(orgId),
    })
    return parseEnvelope(raw, projectSchema, '创建场地项目')
  },

  async getFocusZone(focusZoneId: string, orgId?: string | null): Promise<TerrainWorkZoneRecord> {
    const raw: unknown = await request.get(
      `/app/3d-studio/terrain-work-zones/${focusZoneId}`,
      { params: withOrgId(orgId) },
    )
    return parseEnvelope(raw, workZoneSchema, '读取场地工作区')
  },

  async createFocusZone(
    projectId: string,
    data: UpsertSiteFocusZoneInput,
    orgId?: string | null,
  ): Promise<TerrainWorkZoneRecord> {
    const raw: unknown = await request.post(
      `/app/3d-studio/projects/${projectId}/terrain-work-zones`,
      data,
      { params: withOrgId(orgId) },
    )
    return parseEnvelope(raw, workZoneSchema, '创建场地工作区')
  },

  async updateFocusZone(
    focusZoneId: string,
    data: UpsertSiteFocusZoneInput,
    orgId?: string | null,
  ): Promise<TerrainWorkZoneRecord> {
    const raw: unknown = await request.put(
      `/app/3d-studio/terrain-work-zones/${focusZoneId}`,
      data,
      { params: withOrgId(orgId) },
    )
    return parseEnvelope(raw, workZoneSchema, '更新场地工作区')
  },

  async bakeProjectSite(
    projectId: string,
    data: BakeProjectSiteInput,
    orgId?: string | null,
  ): Promise<SiteModeMutationResult> {
    const raw: unknown = await request.post(
      `/app/3d-studio/projects/${projectId}/site-bake`,
      data,
      { params: withOrgId(orgId), timeout: SITE_BAKE_TIMEOUT_MS },
    )
    return parseEnvelope(raw, mutationResultSchema, '生成卫星场地')
  },

  async loadSiteMode(
    projectId: string,
    focusZoneId: string,
    orgId?: string | null,
  ): Promise<SiteModeMutationResult> {
    const raw: unknown = await request.get(
      `/app/3d-studio/projects/${projectId}/site-mode`,
      { params: { ...withOrgId(orgId), focusZoneId } },
    )
    return parseEnvelope(raw, mutationResultSchema, '读取卫星场地')
  },

  async saveSiteMode(
    projectId: string,
    data: SaveSiteModeInput,
    orgId?: string | null,
  ): Promise<SiteModeMutationResult> {
    const raw: unknown = await request.put(
      `/app/3d-studio/projects/${projectId}/site-mode`,
      data,
      { params: withOrgId(orgId) },
    )
    return parseEnvelope(raw, mutationResultSchema, '保存卫星场地')
  },

  async saveFocusZoneWorkbench(
    projectId: string,
    data: SaveFocusZoneWorkbenchInput,
    orgId?: string | null,
  ): Promise<SiteModeMutationResult> {
    const raw: unknown = await request.put(
      `/app/3d-studio/projects/${projectId}/focus-zone-workbench`,
      data,
      { params: withOrgId(orgId) },
    )
    return parseEnvelope(raw, mutationResultSchema, '保存重点区工作台')
  },
}

export default siteModeApi
