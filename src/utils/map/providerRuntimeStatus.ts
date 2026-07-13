export type MapProviderKey = 'imagery' | 'terrain' | 'buildings'

export type MapProviderStatus = 'loading' | 'ready' | 'degraded' | 'failed' | 'unavailable'

export type MapProviderErrorCode =
  | 'missing-credentials'
  | 'unauthorized'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'cors'
  | 'aborted'
  | 'unknown'

export interface MapProviderRuntimeEntry {
  provider: string
  status: MapProviderStatus
  itemCount?: number
  message?: string
  retryable: boolean
  requestedId?: string | null
  activeId?: string | null
  errorCode?: MapProviderErrorCode | null
  attempt: number
  generation: number
  pending?: number
}

export type MapProviderRuntimeSources = Record<MapProviderKey, MapProviderRuntimeEntry>

export interface MapProviderRuntimeSnapshot {
  sources: MapProviderRuntimeSources
  overall: MapProviderStatus
  requiredProviders: MapProviderKey[]
}

export interface ClassifiedProviderError {
  code: MapProviderErrorCode
  message: string
  retryable: boolean
  statusCode: number | null
}

export interface TilesetRuntimeEvidence {
  initialTilesLoaded: boolean
  failedTileCount: number
  timedOut: boolean
}

export interface TileRequestRuntimeEvidence {
  hasSuccessfulTile: boolean
  failedTileCount: number
}

export interface LatestRequestToken {
  generation: number
  bboxKey: string
}

export interface LatestRequestGate {
  begin: (_bboxKey: string) => LatestRequestToken
  isCurrent: (_token: LatestRequestToken) => boolean
  invalidate: () => void
}

const DEFAULT_PROVIDER_LABELS: Record<MapProviderKey, string> = {
  imagery: '底图影像',
  terrain: '地形',
  buildings: '建筑参考层',
}

export function createProviderRuntimeEntry(
  key: MapProviderKey,
  overrides: Partial<MapProviderRuntimeEntry> = {}
): MapProviderRuntimeEntry {
  return {
    provider: DEFAULT_PROVIDER_LABELS[key],
    status: key === 'buildings' ? 'unavailable' : 'loading',
    retryable: false,
    attempt: 0,
    generation: 0,
    requestedId: null,
    activeId: null,
    errorCode: null,
    ...overrides,
  }
}

export function createProviderRuntimeSources(): MapProviderRuntimeSources {
  return {
    imagery: createProviderRuntimeEntry('imagery'),
    terrain: createProviderRuntimeEntry('terrain'),
    buildings: createProviderRuntimeEntry('buildings', {
      message: '未启用建筑参考层',
    }),
  }
}

export function deriveProviderOverallStatus(
  sources: MapProviderRuntimeSources,
  buildingsRequired: boolean
): MapProviderRuntimeSnapshot {
  const requiredProviders: MapProviderKey[] = buildingsRequired
    ? ['imagery', 'terrain', 'buildings']
    : ['imagery', 'terrain']
  const requiredStatuses = requiredProviders.map((key) => sources[key].status)

  let overall: MapProviderStatus = 'ready'
  if (requiredStatuses.includes('failed')) {
    overall = 'failed'
  } else if (requiredStatuses.includes('unavailable')) {
    overall = 'unavailable'
  } else if (requiredStatuses.includes('loading')) {
    overall = 'loading'
  } else if (requiredStatuses.includes('degraded')) {
    overall = 'degraded'
  }

  return { sources, overall, requiredProviders }
}

/**
 * A presentation-only refresh must not erase evidence recorded by the tileset.
 * Only a real `initialTilesLoaded` event with no failures can report `ready`.
 */
export function deriveTilesetRuntimeStatus(evidence: TilesetRuntimeEvidence): MapProviderStatus {
  if (evidence.failedTileCount >= 3 && !evidence.initialTilesLoaded) return 'failed'
  if (evidence.failedTileCount > 0 || evidence.timedOut) return 'degraded'
  return evidence.initialTilesLoaded ? 'ready' : 'loading'
}

/**
 * Provider 创建成功不等于瓦片可用。只有真实瓦片请求完成后才能进入 successStatus。
 */
export function deriveTileRequestRuntimeStatus(
  evidence: TileRequestRuntimeEvidence,
  successStatus: Extract<MapProviderStatus, 'ready' | 'degraded'> = 'ready'
): MapProviderStatus {
  if (evidence.failedTileCount >= 3 && !evidence.hasSuccessfulTile) return 'failed'
  if (evidence.failedTileCount > 0) return 'degraded'
  return evidence.hasSuccessfulTile ? successStatus : 'loading'
}

/**
 * 保留 provider 原始请求 Promise，只在第一个成功解析的瓦片上记录一次成功证据。
 */
export function observeFirstSuccessfulTileRequest<TArgs extends unknown[], TResult>(
  requestTile: (..._args: TArgs) => Promise<TResult> | undefined,
  onFirstSuccess: () => void
): (..._args: TArgs) => Promise<TResult> | undefined {
  let observed = false
  return (...args) => {
    const request = requestTile(...args)
    if (request) {
      void request.then(
        () => {
          if (observed) return
          observed = true
          onFirstSuccess()
        },
        () => undefined
      )
    }
    return request
  }
}

/**
 * World Terrain 与 ArcGIS 备用源都失败时，以实际失败的备用源决定重试语义和错误码。
 */
export function classifyTerrainFallbackFailure(
  primaryError: unknown,
  fallbackError: unknown
): ClassifiedProviderError {
  const primary = classifyProviderError(primaryError)
  const fallback = classifyProviderError(fallbackError)
  return {
    ...fallback,
    message: `${primary.message}；ArcGIS 备用地形：${fallback.message}`,
  }
}

export function createLatestRequestGate(): LatestRequestGate {
  let generation = 0
  let activeBBoxKey: string | null = null

  return {
    begin(bboxKey) {
      generation += 1
      activeBBoxKey = bboxKey
      return { generation, bboxKey }
    },
    isCurrent(token) {
      return token.generation === generation && token.bboxKey === activeBBoxKey
    },
    invalidate() {
      generation += 1
      activeBBoxKey = null
    },
  }
}

function getUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function getErrorStatusCode(error: unknown): number | null {
  const record = getUnknownRecord(error)
  if (!record) return null

  const directStatus = Number(record.statusCode ?? record.status)
  if (Number.isFinite(directStatus) && directStatus > 0) return directStatus

  const response = getUnknownRecord(record.response)
  const responseStatus = Number(response?.status)
  if (Number.isFinite(responseStatus) && responseStatus > 0) return responseStatus

  const nestedError = getUnknownRecord(record.error)
  const nestedStatus = Number(nestedError?.statusCode ?? nestedError?.status)
  return Number.isFinite(nestedStatus) && nestedStatus > 0 ? nestedStatus : null
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.trim()
  if (typeof error === 'string') return error

  const record = getUnknownRecord(error)
  const nestedError = getUnknownRecord(record?.error)
  return [record?.name, record?.message, nestedError?.name, nestedError?.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

export function classifyProviderError(error: unknown): ClassifiedProviderError {
  const statusCode = getErrorStatusCode(error)
  const errorText = getErrorText(error).toLowerCase()

  if (errorText.includes('abort')) {
    return {
      code: 'aborted',
      message: '加载已取消',
      retryable: false,
      statusCode,
    }
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /unauthori[sz]ed|forbidden|invalid token/.test(errorText)
  ) {
    return {
      code: 'unauthorized',
      message: '访问凭据无效或没有权限',
      retryable: false,
      statusCode,
    }
  }

  if (statusCode === 429 || /rate.?limit|too many requests|quota/.test(errorText)) {
    return {
      code: 'rate-limited',
      message: '服务请求过于频繁，请稍后重试',
      retryable: true,
      statusCode,
    }
  }

  if (/timeout|timed out/.test(errorText)) {
    return {
      code: 'timeout',
      message: '服务响应超时',
      retryable: true,
      statusCode,
    }
  }

  if (/cors|cross-origin|cross origin/.test(errorText)) {
    return {
      code: 'cors',
      message: '服务拒绝了浏览器跨域请求',
      retryable: false,
      statusCode,
    }
  }

  if (
    (statusCode != null && statusCode >= 500) ||
    /network|failed to fetch|load failed|connection|request failed/.test(errorText)
  ) {
    return {
      code: 'network',
      message: '网络或上游服务暂时不可用',
      retryable: true,
      statusCode,
    }
  }

  return {
    code: 'unknown',
    message: '服务加载失败',
    retryable: true,
    statusCode,
  }
}
