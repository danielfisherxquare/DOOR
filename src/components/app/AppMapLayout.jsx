import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMapStore } from '../../stores/mapStore'
import MapErrorBoundary from '../map/MapErrorBoundary'
import MapControls from '../map/MapControls'
import MapOnboarding from '../map/MapOnboarding'
import { useLegacyTileCacheMigration } from '../../hooks/useLegacyTileCacheMigration'
import siteModeApi from '../../services/siteModeApi'
import { createSiteProjectSnapshot } from '../../utils/map/siteModePersistence'
import { showSuccess } from '../../utils/toast'
import { buildAppHref } from './appConfig'
import SpatialProjectCreateDialog from './spatial/SpatialProjectCreateDialog'
import SpatialProjectViewSwitch from './spatial/SpatialProjectViewSwitch'
import './app-map-layout.css'

const MapView = lazy(() => import('../map/MapView'))
const QUALITY_PRESET_OPTIONS = [
  { value: 'performance', label: '性能' },
  { value: 'balanced', label: '平衡' },
  { value: 'quality', label: '高画质' },
  { value: 'ultra', label: '极致' },
]
const TERRAIN_SSE_MIN = 1.5
const TERRAIN_SSE_MAX = 8
const OSM_SSE_MIN = 4
const OSM_SSE_MAX = 32

function toInverseSliderValue(value, min, max) {
  return Math.round(((max - value) / (max - min)) * 100)
}

function fromInverseSliderValue(value, min, max) {
  return Number((max - (value / 100) * (max - min)).toFixed(2))
}

function getPresetLabel(preset) {
  return QUALITY_PRESET_OPTIONS.find((option) => option.value === preset)?.label || '自定义'
}

function getTerrainDetailLabel(value) {
  if (value <= 2) return '极高'
  if (value <= 3.5) return '高'
  if (value <= 5.5) return '中'
  return '低'
}

function getOsmDetailLabel(value) {
  if (value <= 6) return '极高'
  if (value <= 12) return '高'
  if (value <= 20) return '中'
  return '低'
}

function normalizeStudioProjectId(projectId) {
  const normalized = String(projectId || '').trim()
  if (!normalized || normalized === 'new') return null
  return normalized
}

export default function AppMapLayout({ context }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const renderFps = useMapStore((state) => state.renderFps)
  const viewMode = useMapStore((state) => state.viewMode)
  const browseState = useMapStore((state) => state.browseState)
  const renderQuality = useMapStore((state) => state.renderQuality)
  const sidebarOpen = useMapStore((state) => state.sidebarOpen)
  const toggleSidebar = useMapStore((state) => state.toggleSidebar)
  const setRenderQualityPreset = useMapStore((state) => state.setRenderQualityPreset)
  const updateRenderQuality = useMapStore((state) => state.updateRenderQuality)
  const [qualityPanelOpen, setQualityPanelOpen] = useState(false)
  const [createProjectSubmitting, setCreateProjectSubmitting] = useState(false)
  const [createProjectError, setCreateProjectError] = useState(null)
  const qualityPanelRef = useRef(null)
  useLegacyTileCacheMigration('AppMapLayout')

  const fpsValue = viewMode === '3DGlobe' && Number.isFinite(renderFps) ? Math.round(renderFps) : null
  const fpsToneClass = fpsValue == null
    ? ''
    : fpsValue >= 75
      ? 'is-good'
      : fpsValue >= 45
        ? 'is-warn'
        : 'is-bad'
  const terrainSliderValue = toInverseSliderValue(
    renderQuality.terrainScreenSpaceError,
    TERRAIN_SSE_MIN,
    TERRAIN_SSE_MAX,
  )
  const osmSliderValue = toInverseSliderValue(
    renderQuality.osmScreenSpaceError,
    OSM_SSE_MIN,
    OSM_SSE_MAX,
  )
  const projectId = normalizeStudioProjectId(searchParams.get('projectId'))
  const createSiteDialogOpen = searchParams.get('createMode') === 'event-site' && !projectId
  const modelHref = projectId ? buildAppHref(`/3d-studio/${projectId}`, context) : buildAppHref('/3d-studio', context)
  const projectHint = projectId
    ? '当前编辑会同步到项目与工作区'
    : '当前处于草图模式，进入 3D 前请先打开一个项目'
  const defaultProjectName = context?.raceName ? `${context.raceName} 赛事场地` : '赛事场地项目'

  const handleCreateSiteProject = useCallback(async (name) => {
    setCreateProjectSubmitting(true)
    setCreateProjectError(null)
    try {
      const [latitude, longitude] = browseState.centerWgs84
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error('当前地图中心无效，请返回空间项目后重试')
      }

      const createdProject = await siteModeApi.createProject({
        name,
        sceneType: 'outdoor-event',
        projectType: 'site',
        status: 'draft',
        sourceType: 'blank',
        geoAnchor: {
          longitude,
          latitude,
          height: 0,
        },
        snapshotJson: createSiteProjectSnapshot({ name }),
      }, context?.orgId || undefined)

      const nextUrl = new URL(buildAppHref('/map', context), window.location.origin)
      nextUrl.searchParams.set('projectId', createdProject.id)
      navigate(`${nextUrl.pathname}${nextUrl.search}`, { replace: true })
      showSuccess(`空间项目“${createdProject.name}”已创建`)
    } catch (error) {
      setCreateProjectError(error instanceof Error ? error.message : '创建空间项目失败，请稍后重试')
    } finally {
      setCreateProjectSubmitting(false)
    }
  }, [browseState.centerWgs84, context, navigate])

  const handleCancelSiteProject = useCallback(() => {
    navigate(buildAppHref('/3d-studio', context), { replace: true })
  }, [context, navigate])

  useEffect(() => {
    if (!qualityPanelOpen) return

    const handlePointerDown = (event) => {
      if (qualityPanelRef.current?.contains(event.target)) return
      setQualityPanelOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setQualityPanelOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [qualityPanelOpen])

  return (
    <div className="app-map-layout">
      <main className="app-map-layout__content">
        <section className="app-map-layout__canvas-shell">
          <div className="app-map-layout__canvas-header">
            <div className="app-map-layout__canvas-heading">
              <Link
                to={buildAppHref('/3d-studio', context)}
                className="app-map-layout__back"
                title="返回空间项目"
              >
                <span className="material-symbols-outlined">arrow_back</span>
                <span className="app-map-layout__back-text">返回空间项目</span>
              </Link>
              <div className="app-map-layout__title-block">
                <div className="app-map-layout__title-row">
                  <span className="app-map-layout__eyebrow">空间项目</span>
                  <h1 className="app-map-layout__title">地图规划</h1>
                  <span className="app-map-layout__badge is-accent">
                    {viewMode === '3DGlobe' ? '三维场景' : '二维规划'}
                  </span>
                </div>
                <div className={`app-map-layout__hint ${projectId ? 'is-project' : 'is-draft'}`.trim()}>
                  {projectHint}
                </div>
              </div>
              <SpatialProjectViewSwitch
                activeView="map"
                mapHref={`${location.pathname}${location.search}`}
                modelHref={modelHref}
              />
              <button
                type="button"
                className="app-map-layout__sidebar-toggle"
                title={sidebarOpen ? '收起地图侧栏' : '展开地图侧栏'}
                aria-label={sidebarOpen ? '收起地图侧栏' : '展开地图侧栏'}
                aria-pressed={sidebarOpen}
                onClick={toggleSidebar}
              >
                <span className="material-symbols-outlined">{sidebarOpen ? 'menu_open' : 'menu'}</span>
              </button>
            </div>
            <div className="app-map-layout__canvas-meta">
              <MapControls variant="inline" showHint={false} />
              {viewMode === '3DGlobe' && (
                <>
                  <div ref={qualityPanelRef} className="app-map-layout__quality-entry">
                <button
                  type="button"
                  className={`app-map-layout__canvas-chip app-map-layout__canvas-chip--action ${qualityPanelOpen ? 'is-active' : ''}`.trim()}
                  title="调节 3D 画质"
                  aria-expanded={qualityPanelOpen}
                  onClick={() => setQualityPanelOpen((value) => !value)}
                >
                  <span className="material-symbols-outlined">tune</span>
                  画质 {getPresetLabel(renderQuality.preset)}
                </button>

                {qualityPanelOpen && (
                  <div className="app-map-layout__quality-panel">
                    <div className="app-map-layout__quality-panel-header">
                      <div>
                        <div className="app-map-layout__panel-label">图形设置</div>
                        <strong>3D 画质</strong>
                      </div>
                      <span className="app-map-layout__quality-cap">上限 120 FPS</span>
                    </div>

                    <div className="app-map-layout__quality-presets">
                      {QUALITY_PRESET_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`app-map-layout__quality-preset ${renderQuality.preset === option.value ? 'is-active' : ''}`.trim()}
                          onClick={() => setRenderQualityPreset(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <label className="app-map-layout__quality-row">
                      <div className="app-map-layout__quality-row-copy">
                        <span>渲染倍率</span>
                        <strong>{Math.round(renderQuality.resolutionScale * 100)}%</strong>
                      </div>
                      <input
                        type="range"
                        min="70"
                        max="150"
                        step="5"
                        value={Math.round(renderQuality.resolutionScale * 100)}
                        onChange={(event) => {
                          updateRenderQuality({ resolutionScale: Number(event.target.value) / 100 })
                        }}
                      />
                    </label>

                    <label className="app-map-layout__quality-row">
                      <div className="app-map-layout__quality-row-copy">
                        <span>地形细节</span>
                        <strong>{getTerrainDetailLabel(renderQuality.terrainScreenSpaceError)}</strong>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={terrainSliderValue}
                        onChange={(event) => {
                          updateRenderQuality({
                            terrainScreenSpaceError: fromInverseSliderValue(
                              Number(event.target.value),
                              TERRAIN_SSE_MIN,
                              TERRAIN_SSE_MAX,
                            ),
                          })
                        }}
                      />
                    </label>

                    <label className="app-map-layout__quality-row">
                      <div className="app-map-layout__quality-row-copy">
                        <span>白模细节</span>
                        <strong>{getOsmDetailLabel(renderQuality.osmScreenSpaceError)}</strong>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={osmSliderValue}
                        onChange={(event) => {
                          updateRenderQuality({
                            osmScreenSpaceError: fromInverseSliderValue(
                              Number(event.target.value),
                              OSM_SSE_MIN,
                              OSM_SSE_MAX,
                            ),
                          })
                        }}
                      />
                    </label>

                    <label className="app-map-layout__quality-toggle">
                      <input
                        type="checkbox"
                        checked={renderQuality.fxaaEnabled}
                        onChange={(event) => updateRenderQuality({ fxaaEnabled: event.target.checked })}
                      />
                      <div>
                        <strong>抗锯齿</strong>
                        <span>边缘更平滑，略增 GPU 开销</span>
                      </div>
                    </label>

                    <label className="app-map-layout__quality-toggle">
                      <input
                        type="checkbox"
                        checked={renderQuality.showOsmOutline}
                        onChange={(event) => updateRenderQuality({ showOsmOutline: event.target.checked })}
                      />
                      <div>
                        <strong>白模描边</strong>
                        <span>让楼体边缘更清楚，便于观察轮廓</span>
                      </div>
                    </label>
                  </div>
                )}
                  </div>

                  <span
                    className={`app-map-layout__canvas-chip app-map-layout__canvas-chip--metric ${fpsToneClass}`.trim()}
                    title="Cesium 3D 实时帧率"
                  >
                    FPS {fpsValue == null ? '--' : fpsValue}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="app-map-layout__canvas-frame">
            <MapErrorBoundary>
              <Suspense fallback={<div className="app-map-layout__loader">正在准备地图工作台…</div>}>
                <MapView
                  controlsVariant="hidden"
                  projectId={projectId}
                  orgId={context?.orgId || null}
                  raceId={context?.raceId || null}
                />
                <MapOnboarding />
              </Suspense>
            </MapErrorBoundary>
          </div>
        </section>
      </main>
      <SpatialProjectCreateDialog
        open={createSiteDialogOpen}
        defaultName={defaultProjectName}
        submitting={createProjectSubmitting}
        error={createProjectError}
        onSubmit={handleCreateSiteProject}
        onCancel={handleCancelSiteProject}
      />
    </div>
  )
}
