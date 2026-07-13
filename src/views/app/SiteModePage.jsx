import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Studio3DApp } from '../../3d-studio'
import { buildFocusZoneStudioScene } from '../../utils/map/focusZoneStudioScene'
import { extractFocusZoneWorkbenchScene } from '../../utils/map/focusZoneContext'
import { normalizeEditorDocument } from '../../3d-studio/model/editorDocument'
import {
  buildSiteBackdropData,
  mergeSiteImageryRuntime,
  summarizeSiteImageryRuntime,
} from '../../3d-studio/model/siteBackdrop'
import { runWithEditorMutationLock } from '../../3d-studio/savePersistence'
import {
  buildSiteModeSaveRequest,
  hydrateSiteFocusZone,
  resolveSiteBakePresentation,
} from '../../utils/map/siteModePersistence'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../utils/surfaceContext'
import useAuthStore from '../../stores/authStore'
import { buildAppHref } from '../../components/app/appConfig'
import siteModeApi, {
  createSiteMutationId,
  isRevisionConflict,
} from '../../services/siteModeApi'
import SiteModeStatusRail from './SiteModeStatusRail'
import './site-mode.css'

const EMPTY_SAVE_STATE = {
  status: 'saved',
  revision: 0,
  lastSavedAt: null,
  error: null,
  dirty: false,
  changeVersion: 0,
}

function normalizeScene(scene) {
  if (!scene || typeof scene !== 'object') return null
  if (!scene.editorDocument) return scene
  return {
    ...scene,
    editorDocument: normalizeEditorDocument(scene.editorDocument || {}),
  }
}

function buildSceneAndBackdrop(focusZone, responseScene = null) {
  const persistedScene = normalizeScene(
    responseScene || extractFocusZoneWorkbenchScene(focusZone)
  )
  if (persistedScene) {
    return {
      scene: persistedScene,
      backdrop: buildSiteBackdropData(focusZone),
    }
  }

  const sceneFocusZone = {
    ...focusZone,
    snapshotJson: {
      ...(focusZone.snapshotJson || {}),
      osmBuildings: { buildings: [] },
    },
  }
  const built = buildFocusZoneStudioScene({ focusZone: sceneFocusZone })
  const document = built.editorDocument || {}
  const cleanedDocument = normalizeEditorDocument({
    ...document,
    terrainMeshes: [],
    solids: (document.solids || []).filter(
      (solid) => solid?.metadata?.compatType !== 'focus-zone-floor'
    ),
  })
  return {
    scene: { ...built, editorDocument: cleanedDocument },
    backdrop: buildSiteBackdropData(focusZone),
  }
}

export default function SiteModePage() {
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const orgId = resolveSurfaceOrgId(searchParams, user)
  const raceId = resolveSurfaceRaceId(searchParams, user, orgId)
  const projectId = searchParams.get('projectId')
  const focusZoneId = searchParams.get('focusZoneId')

  const [status, setStatus] = useState('loading')
  const [project, setProject] = useState(null)
  const [focusZone, setFocusZone] = useState(null)
  const [scene, setScene] = useState(null)
  const [backdrop, setBackdrop] = useState(null)
  const [revision, setRevision] = useState(0)
  const [providerStatus, setProviderStatus] = useState(null)
  const [imageryRuntime, setImageryRuntime] = useState(null)
  const [imageryReloadToken, setImageryReloadToken] = useState(0)
  const [bakeStatus, setBakeStatus] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState(EMPTY_SAVE_STATE)
  const [rebaking, setRebaking] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [sceneGeneration, setSceneGeneration] = useState(0)
  const revisionRef = useRef(0)
  const rebakingRef = useRef(false)
  const studioMutationRef = useRef(null)

  const applyServerRecords = useCallback(({
    nextProject,
    nextFocusZone,
    sceneSnapshot = null,
    nextProviderStatus = null,
    nextBakeStatus = null,
    nextWarnings = null,
  }) => {
    const hydratedFocusZone = hydrateSiteFocusZone(nextFocusZone)
    const built = buildSceneAndBackdrop(hydratedFocusZone, sceneSnapshot)
    const bakePresentation = resolveSiteBakePresentation({
      focusZone: hydratedFocusZone,
      providerStatus: nextProviderStatus,
      bakeStatus: nextBakeStatus,
      warnings: nextWarnings,
    })
    setProject(nextProject)
    setFocusZone(hydratedFocusZone)
    setScene(built.scene)
    setBackdrop(built.backdrop)
    setImageryRuntime(summarizeSiteImageryRuntime({
      total: Array.isArray(built.backdrop?.tiles) ? built.backdrop.tiles.length : 0,
    }))
    setImageryReloadToken((value) => value + 1)
    const nextRevision = Number(nextProject?.revision) || 0
    revisionRef.current = nextRevision
    setRevision(nextRevision)
    setProviderStatus(bakePresentation.providerStatus)
    setBakeStatus(bakePresentation.bakeStatus)
    setWarnings(bakePresentation.warnings)
  }, [])

  useEffect(() => {
    if (!projectId || !focusZoneId) {
      setStatus('missing-context')
      return undefined
    }

    let active = true
    setStatus('loading')
    setError('')
    siteModeApi.loadSiteMode(projectId, focusZoneId, orgId || undefined)
      .then((result) => {
        if (!active) return
        const nextProject = result.project
        const nextFocusZone = result.focusZone || result.workZone
        if (nextFocusZone.projectId !== nextProject.id) {
          throw new Error('场地工作区不属于当前项目')
        }
        applyServerRecords({
          nextProject,
          nextFocusZone,
          sceneSnapshot: result.sceneSnapshot || null,
          nextProviderStatus: result.providerStatus,
          nextBakeStatus: result.bakeStatus,
          nextWarnings: result.warnings,
        })
        setSaveState({ ...EMPTY_SAVE_STATE, revision: result.revision })
        setStatus('ready')
      })
      .catch((requestError) => {
        if (!active) return
        setError(requestError?.message || '打开卫星场地失败')
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [applyServerRecords, focusZoneId, orgId, projectId, reloadToken])

  const handleBack = useCallback(() => {
    if ((saveState.dirty || saveState.status === 'saving') && !window.confirm('当前修改尚未保存，仍要返回 GIS 地图吗？')) {
      return
    }
    const href = buildAppHref('/map', {
      orgId: orgId || undefined,
      raceId: raceId || undefined,
    })
    const url = new URL(href, window.location.origin)
    if (projectId) url.searchParams.set('projectId', projectId)
    if (focusZoneId) url.searchParams.set('focusZoneId', focusZoneId)
    navigate(url.pathname + url.search)
  }, [focusZoneId, navigate, orgId, projectId, raceId, saveState.dirty, saveState.status])

  const handleRebake = useCallback(async () => {
    if (!projectId || !focusZoneId || rebakingRef.current) return
    rebakingRef.current = true
    setRebaking(true)
    setError('')
    try {
      const lockedMutation = await runWithEditorMutationLock({
        controller: studioMutationRef.current,
        mutation: async () => {
          const result = await siteModeApi.bakeProjectSite(projectId, {
            focusZoneId,
            expectedRevision: revisionRef.current,
            clientMutationId: createSiteMutationId(),
          }, orgId || undefined)
          // The editor document was flushed under the mutation lock. Keep its scene key
          // stable and refresh only the baked backdrop/provider records.
          applyServerRecords({
            nextProject: result.project,
            nextFocusZone: result.focusZone || result.workZone,
            sceneSnapshot: result.sceneSnapshot || null,
            nextProviderStatus: result.providerStatus,
            nextBakeStatus: result.bakeStatus,
            nextWarnings: result.warnings,
          })
          return result
        },
      })
      if (!lockedMutation.started) {
        setError(
          lockedMutation.reason === 'controller-unavailable'
            ? '3D 编辑器尚未就绪，请稍后重试'
            : '当前修改保存失败，已取消重新生成'
        )
      }
    } catch (requestError) {
      if (isRevisionConflict(requestError)) {
        setSaveState((current) => ({
          ...current,
          status: 'conflict',
          error: requestError?.message || '远端项目已有新版本',
        }))
      }
      setError(requestError?.message || '重新生成场地失败')
    } finally {
      rebakingRef.current = false
      setRebaking(false)
    }
  }, [applyServerRecords, focusZoneId, orgId, projectId])

  const handleSave = useCallback(async ({ snapshotJson, expectedRevision, clientMutationId }) => {
    if (!projectId || !focusZoneId) throw new Error('当前场地缺少项目绑定')
    const result = await siteModeApi.saveSiteMode(projectId, buildSiteModeSaveRequest({
      focusZoneId,
      snapshotJson,
      expectedRevision,
      clientMutationId,
    }), orgId || undefined)

    const nextFocusZone = hydrateSiteFocusZone(result.focusZone || result.workZone)
    setProject(result.project)
    setFocusZone(nextFocusZone)
    // A scene save does not change baked imagery, terrain or buildings. Keep the
    // existing backdrop identity so autosave cannot reload every satellite tile.
    revisionRef.current = result.revision
    setRevision(result.revision)
    setProviderStatus(result.providerStatus)
    setBakeStatus(result.bakeStatus)
    setWarnings(result.warnings)
    return {
      project: result.project,
      revision: result.revision,
      savedAt: result.project.updatedAt || new Date().toISOString(),
    }
  }, [focusZoneId, orgId, projectId])

  const handleReloadConflict = useCallback(() => {
    if (!window.confirm('重新载入会放弃当前未保存修改，是否继续？')) return
    setSaveState(EMPTY_SAVE_STATE)
    setSceneGeneration((value) => value + 1)
    setReloadToken((value) => value + 1)
  }, [])

  const handleImageryRuntimeChange = useCallback((nextRuntime) => {
    setImageryRuntime((current) => (
      current
      && current.loaded === nextRuntime.loaded
      && current.failed === nextRuntime.failed
      && current.total === nextRuntime.total
      && current.status === nextRuntime.status
      && current.message === nextRuntime.message
        ? current
        : nextRuntime
    ))
  }, [])

  const handleReloadImagery = useCallback(() => {
    const total = Array.isArray(backdrop?.tiles) ? backdrop.tiles.length : 0
    setImageryRuntime(summarizeSiteImageryRuntime({ total }))
    setImageryReloadToken((value) => value + 1)
  }, [backdrop])

  const effectiveProviderStatus = useMemo(
    () => mergeSiteImageryRuntime(providerStatus, imageryRuntime),
    [imageryRuntime, providerStatus]
  )

  const sceneKey = useMemo(
    () => `site:${projectId || 'missing'}:${focusZoneId || 'missing'}:${sceneGeneration}`,
    [focusZoneId, projectId, sceneGeneration]
  )

  if (status === 'missing-context') {
    return (
      <div className="site-mode__overlay">
        <div className="site-mode__error">
          <div className="site-mode__error-title">请先从 GIS 地图框选场地</div>
          <div className="site-mode__error-message">
            卫星场地必须绑定真实项目和重点区，不能再使用默认演示区域。
          </div>
          <button type="button" className="site-mode__button" onClick={handleBack}>
            返回 GIS 地图
          </button>
        </div>
      </div>
    )
  }

  if (status === 'loading') {
    return <div className="site-mode__overlay">正在读取项目、场地工作区与已保存场景…</div>
  }

  if (status === 'error' || !project || !focusZone || !scene) {
    return (
      <div className="site-mode__overlay">
        <div className="site-mode__error">
          <div className="site-mode__error-title">卫星场地打开失败</div>
          <div className="site-mode__error-message">{error || '服务端没有返回可编辑场景'}</div>
          <div className="site-mode__error-actions">
            <button type="button" className="site-mode__button" onClick={handleBack}>
              返回 GIS 地图
            </button>
            <button type="button" className="site-mode__button" onClick={() => setReloadToken((value) => value + 1)}>
              重新载入
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="site-mode">
      <Studio3DApp
        sceneKey={sceneKey}
        initialScene={scene}
        sceneType="outdoor-event"
        siteBackdrop={backdrop}
        siteBackdropReloadToken={imageryReloadToken}
        onSiteBackdropImageryRuntimeChange={handleImageryRuntimeChange}
        onBack={handleBack}
        warehouseMeta={{
          id: scene?.warehouse?.id || focusZone.id,
          name: project.name,
          orgId,
        }}
        sourceContext={{ label: `GIS 重点区 · ${focusZone.name}` }}
        onSave={handleSave}
        autoSaveDelayMs={1500}
        saveRevision={revision}
        onSaveStateChange={setSaveState}
        externalSaveConflict={saveState.status === 'conflict'}
        externalMutationRef={studioMutationRef}
      />

      <SiteModeStatusRail
        providerStatus={effectiveProviderStatus}
        imageryRuntime={imageryRuntime}
        canReloadImagery={Boolean(backdrop?.tiles?.length)}
        bakeStatus={bakeStatus}
        warnings={warnings}
        saveState={saveState.status}
        rebaking={rebaking}
        onRebake={handleRebake}
        onReloadImagery={handleReloadImagery}
      />

      {saveState.status === 'conflict' ? (
        <div className="site-mode__conflict" role="alert">
          <strong>远端项目已有新版本</strong>
          <span>自动保存已暂停，当前修改仍保留在本页。</span>
          <button type="button" onClick={handleReloadConflict}>重新载入远端版本</button>
        </div>
      ) : null}

      {error ? <div className="site-mode__warnings" role="alert">{error}</div> : null}
    </div>
  )
}
