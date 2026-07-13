import type { MapRenderQuality } from '../../stores/mapStore'
import type { MapProviderRuntimeSnapshot } from '../../utils/map/providerRuntimeStatus'

const RUNTIME_DEGRADE_FPS = 24
const RUNTIME_BALANCE_FPS = 36

export type TerrainWorkZoneRuntimeStrategy = 'template-fanout' | 'instanced-glb' | 'merged-glb'

export type TerrainWorkZoneRuntimePolicy = {
  strategy: TerrainWorkZoneRuntimeStrategy
  reason: string
  qualityPreset: string
  fpsBucket: 'idle' | 'degraded' | 'balanced' | 'quality'
}

export type TerrainRuntimeSourceSummary = {
  strategy: string
  instanceCount: number
  fallbackReason: string | null
}

export type TerrainWorkZoneRuntimeSummary = {
  zoneCount: number
  sourceCount: number
  strategyLabel: string
  requestedStrategyLabel: string
  fallbackReason: string | null
  qualityPreset: string
  fpsBucket: 'idle' | 'degraded' | 'balanced' | 'quality'
  renderFps: number | null
  instanceCount: number
  fallbackSourceCount: number
}

export type GlobeStatusTone = 'loading' | 'ready' | 'warn' | 'error'

export type GlobeExperienceStatus = {
  visible: boolean
  eyebrow: string
  title: string
  message: string
  detail: string | null
  tone: GlobeStatusTone
}

export function resolveTerrainWorkZoneRuntimePolicy(
  renderQuality: Pick<MapRenderQuality, 'preset'>,
  renderFps: number | null,
): TerrainWorkZoneRuntimePolicy {
  const fpsBucket = renderFps == null
    ? 'idle'
    : renderFps < RUNTIME_DEGRADE_FPS
      ? 'degraded'
      : renderFps < RUNTIME_BALANCE_FPS
        ? 'balanced'
        : 'quality'

  if (fpsBucket === 'degraded') {
    return {
      strategy: 'merged-glb',
      reason: `fps<${RUNTIME_DEGRADE_FPS}`,
      qualityPreset: renderQuality.preset,
      fpsBucket,
    }
  }

  if (renderQuality.preset === 'performance') {
    return {
      strategy: 'merged-glb',
      reason: 'quality-preset-performance',
      qualityPreset: renderQuality.preset,
      fpsBucket,
    }
  }

  if (renderQuality.preset === 'balanced' || fpsBucket === 'balanced') {
    return {
      strategy: 'instanced-glb',
      reason: renderQuality.preset === 'balanced' ? 'quality-preset-balanced' : `fps<${RUNTIME_BALANCE_FPS}`,
      qualityPreset: renderQuality.preset,
      fpsBucket,
    }
  }

  return {
    strategy: 'template-fanout',
    reason: 'quality-preset-high',
    qualityPreset: renderQuality.preset,
    fpsBucket,
  }
}

export function formatTerrainRuntimeStrategyLabel(strategy: string): string {
  switch (strategy) {
    case 'template-fanout':
      return '模板展开预览'
    case 'instanced-glb':
      return '实例化 GLB'
    case 'merged-glb':
      return '合批 GLB'
    case 'tileset':
      return 'Tileset'
    case 'glb':
      return '单体 GLB'
    case 'empty':
      return '无可用资源'
    default:
      return strategy || '未知策略'
  }
}

export function summarizeTerrainWorkZoneRuntimeHandles(
  handles: Iterable<{ sourceSummaries?: TerrainRuntimeSourceSummary[] }>,
  policy: TerrainWorkZoneRuntimePolicy,
  renderFps: number | null,
): TerrainWorkZoneRuntimeSummary {
  const runtimeHandles = Array.from(handles)
  const sourceSummaries = runtimeHandles.flatMap((handle) => handle.sourceSummaries || [])
  const strategyLabels = Array.from(
    new Set(
      sourceSummaries
        .map((item) => item.strategy)
        .filter(Boolean)
        .map((item) => formatTerrainRuntimeStrategyLabel(item)),
    ),
  )
  const fallbackReasons = sourceSummaries
    .map((item) => item.fallbackReason)
    .filter((item): item is string => Boolean(item))
  const fallbackSourceCount = sourceSummaries.filter((item) => Boolean(item.fallbackReason)).length
  const instanceCount = sourceSummaries.reduce((sum, item) => sum + Math.max(0, Number(item.instanceCount || 0)), 0)

  return {
    zoneCount: runtimeHandles.length,
    sourceCount: sourceSummaries.length,
    strategyLabel: strategyLabels.length > 0 ? strategyLabels.join(' + ') : formatTerrainRuntimeStrategyLabel(policy.strategy),
    requestedStrategyLabel: formatTerrainRuntimeStrategyLabel(policy.strategy),
    fallbackReason: fallbackReasons.length > 0 ? fallbackReasons[0] : (policy.strategy === 'merged-glb' ? policy.reason : null),
    qualityPreset: policy.qualityPreset,
    fpsBucket: policy.fpsBucket,
    renderFps,
    instanceCount,
    fallbackSourceCount,
  }
}

export function formatRuntimePolicyReason(reason: string | null): string | null {
  if (!reason) return null

  if (reason.startsWith('fps<')) {
    return '当前设备帧率偏低，系统已自动切到更稳的预览模式。'
  }

  switch (reason) {
    case 'quality-preset-performance':
      return '你当前选择了“性能”画质，系统会优先使用更轻的预览模式。'
    case 'quality-preset-balanced':
      return '你当前选择了“平衡”画质，系统默认优先使用实例化预览。'
    case 'instanced-glb-load-failed':
    case 'instanced-glb-fallback-load-failed':
      return '实例化资源暂时不可用，系统已自动回退到合批白模。'
    case 'template-fanout-load-failed':
      return '高精展开预览暂时不可用，系统已自动回退到更稳的模式。'
    case 'missing-fallback-url':
      return '当前重点区缺少备用资源，建议重新生成导出包。'
    default:
      return '系统已根据当前设备状态自动调整预览方式。'
  }
}

export function deriveGlobeExperienceStatus({
  hasRenderableSize,
  viewerReady,
  hasRenderedFrame,
  tileLoadCount,
  runtimeLoadingCount,
  expectedZoneCount,
  summary,
  providers,
}: {
  hasRenderableSize: boolean
  viewerReady: boolean
  hasRenderedFrame: boolean
  tileLoadCount: number
  runtimeLoadingCount: number
  expectedZoneCount: number
  summary: TerrainWorkZoneRuntimeSummary
  providers: MapProviderRuntimeSnapshot
}): GlobeExperienceStatus {
  if (!hasRenderableSize || !viewerReady) {
    return {
      visible: true,
      eyebrow: '三维场景',
      title: '正在启动地球视图',
      message: '正在初始化地形、底图和相机控制。',
      detail: '如果画面短时间内没有变化，请稍等几秒再观察。',
      tone: 'loading',
    }
  }

  if (providers.overall === 'failed' || providers.overall === 'unavailable') {
    const failedLabels = providers.requiredProviders
      .map((key) => providers.sources[key])
      .filter((entry) => entry.status === 'failed' || entry.status === 'unavailable')
      .map((entry) => entry.provider)
    return {
      visible: true,
      eyebrow: '三维资源',
      title: providers.overall === 'unavailable' ? '必要资源尚不可用' : '三维资源加载失败',
      message: failedLabels.length > 0
        ? `${failedLabels.join('、')}未能连接，场景不会标记为已就绪。`
        : '必要的三维资源未能连接，场景不会标记为已就绪。',
      detail: '请查看下方资源状态；可重试的服务会提供单独的重试入口。',
      tone: 'error',
    }
  }

  if (
    providers.overall === 'loading'
    || !hasRenderedFrame
    || tileLoadCount > 0
    || runtimeLoadingCount > 0
  ) {
    const hasPendingFocusZones = expectedZoneCount > 0 || summary.zoneCount > 0
    return {
      visible: true,
      eyebrow: hasPendingFocusZones ? '重点区预览' : '三维场景',
      title: hasPendingFocusZones ? '正在准备重点区预览' : '正在加载三维画面',
      message: hasPendingFocusZones
        ? '正在拉取地形、白模和重点区资源，首次进入可能需要几秒。'
        : '正在拉取底图和地形数据，首次进入可能需要几秒。',
      detail: '如果画面暂时发黑，请等待资源流入；仍无内容时可先切回 2D 或把画质调到“平衡”。',
      tone: 'loading',
    }
  }

  if (providers.overall === 'degraded') {
    return {
      visible: true,
      eyebrow: '三维资源',
      title: '场景正在降级运行',
      message: '至少一个必要资源正在使用备用数据或只完成了部分加载。',
      detail: '当前画面仍可浏览，但地形、底图或建筑可能不完整。',
      tone: 'warn',
    }
  }

  if (summary.fallbackSourceCount > 0 || summary.fallbackReason) {
    return {
      visible: true,
      eyebrow: '重点区预览',
      title: '已切到稳定预览',
      message: '系统已自动降低渲染复杂度，优先保证浏览稳定。',
      detail: formatRuntimePolicyReason(summary.fallbackReason),
      tone: 'warn',
    }
  }

  if (summary.zoneCount > 0) {
    return {
      visible: true,
      eyebrow: '重点区预览',
      title: '重点区白模已就绪',
      message: '可以继续在 GIS 里选对象，也可以直接进入工作台精修重点区。',
      detail: null,
      tone: 'ready',
    }
  }

  return {
    visible: true,
    eyebrow: '三维场景',
    title: '三维地球已就绪',
    message: '当前项目还没有可预览的重点区导出资源。',
    detail: '完成 terrain patch、发布清单和导出后，这里会自动出现重点区白模预览。',
    tone: 'ready',
  }
}
