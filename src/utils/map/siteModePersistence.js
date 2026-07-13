import { createBlankWarehouseScene } from '../studioProjectUtils.js'

export function createSiteProjectSnapshot({ name }) {
  return createBlankWarehouseScene({
    name,
    sceneType: 'outdoor-event',
  })
}

export function buildSiteModeSaveRequest({
  focusZoneId,
  snapshotJson,
  expectedRevision,
  clientMutationId,
}) {
  return {
    focusZoneId,
    snapshotJson,
    expectedRevision,
    ...(clientMutationId ? { clientMutationId } : {}),
  }
}

export function hydrateSiteFocusZone(focusZone) {
  if (!focusZone || typeof focusZone !== 'object') return focusZone
  return {
    ...focusZone,
    orthophoto: focusZone.orthophoto || focusZone.snapshotJson?.orthophoto || null,
  }
}

function getPersistedSiteBake(focusZone) {
  const siteBake = focusZone?.snapshotJson?.siteBake
  if (!siteBake || typeof siteBake !== 'object' || Array.isArray(siteBake)) return null
  return siteBake
}

function inferProviderStatus(focusZone) {
  const tiles = Array.isArray(focusZone?.orthophoto?.tiles) ? focusZone.orthophoto.tiles : []
  const terrainPatch = focusZone?.snapshotJson?.terrainPatch || null
  const osm = focusZone?.snapshotJson?.osmBuildings || null
  const hasBuildings = Boolean(osm?.source && osm.source !== 'none')
  const buildingCount = Array.isArray(osm?.buildings)
    ? osm.buildings.length
    : Number(osm?.count) || 0
  return {
    imagery: {
      provider: focusZone?.orthophoto?.provider || 'satellite',
      status: tiles.length > 0 ? 'ready' : 'unavailable',
      itemCount: tiles.length,
      message: tiles.length > 0 ? undefined : '当前工作区没有已生成的影像描述',
      retryable: true,
    },
    terrain: {
      provider: terrainPatch?.source || 'terrain',
      status: terrainPatch ? 'ready' : 'unavailable',
      message: terrainPatch ? undefined : '当前工作区没有地形采样',
      retryable: true,
    },
    buildings: {
      provider: osm?.source || 'osm',
      status: hasBuildings ? 'ready' : 'unavailable',
      itemCount: buildingCount,
      message: hasBuildings ? undefined : '当前工作区没有建筑白模数据',
      retryable: true,
    },
  }
}

function inferBakeStatus(providerStatus) {
  const statuses = ['imagery', 'terrain', 'buildings']
    .map((key) => providerStatus?.[key]?.status)
  if (statuses.every((providerState) => providerState === 'ready')) return 'ready'
  if (statuses.every((providerState) => ['failed', 'unavailable'].includes(providerState))) {
    return 'failed'
  }
  return 'degraded'
}

function normalizeProviderStatus(candidate, fallback) {
  const allowedStatuses = new Set(['loading', 'ready', 'degraded', 'failed', 'unavailable'])
  return Object.fromEntries(['imagery', 'terrain', 'buildings'].map((key) => {
    const entry = candidate?.[key]
    if (!entry || typeof entry !== 'object' || !allowedStatuses.has(entry.status)) {
      return [key, fallback[key]]
    }
    return [key, { ...fallback[key], ...entry }]
  }))
}

export function resolveSiteBakePresentation({
  focusZone,
  providerStatus = null,
  bakeStatus = null,
  warnings = null,
}) {
  const persistedBake = getPersistedSiteBake(focusZone)
  const fallbackProviderStatus = inferProviderStatus(focusZone)
  const resolvedProviderStatus = normalizeProviderStatus(
    providerStatus ?? persistedBake?.providerStatus,
    fallbackProviderStatus,
  )
  const persistedBakeStatus = ['ready', 'degraded', 'failed'].includes(persistedBake?.status)
    ? persistedBake.status
    : null
  return {
    providerStatus: resolvedProviderStatus,
    bakeStatus: bakeStatus ?? persistedBakeStatus ?? inferBakeStatus(resolvedProviderStatus),
    warnings: Array.isArray(warnings)
      ? warnings
      : Array.isArray(persistedBake?.warnings)
        ? persistedBake.warnings
        : [],
  }
}
