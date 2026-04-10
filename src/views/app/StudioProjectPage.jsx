import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Studio3DApp } from '../../3d-studio'
import { buildAppHref } from '../../components/app/appConfig'
import { BUILTIN_RACK_TEMPLATES } from '../../data/builtinRackTemplates'
import { twinApi } from '../../services/inventoryApi'
import studioProjectApi from '../../services/studioProjectApi'
import { getTemplateSceneSnapshot, inferObjectTypeFromText } from '../../utils/map/assetTemplates'
import useAuthStore from '../../stores/authStore'
import { buildFocusZoneWorkbenchContext, extractFocusZoneTerrainPatch, extractFocusZoneWorkbenchScene } from '../../utils/map/focusZoneContext'
import { buildFocusZoneObjectContext, summarizeFocusZoneObjects } from '../../utils/map/focusZoneSpatialObjects'
import { generateThumbnail } from '../../utils/shareUtils'
import {
  createBlankStudioScene,
  buildImportedWarehouseSnapshot,
  createStudioBuildingDraft,
  getProjectNameFromScene,
  getStudioHierarchy,
  getThumbnailScene,
  mergeWarehouseSceneIntoSnapshot,
  normalizeStudioSnapshot,
  setStudioSelection,
} from '../../utils/studioProjectUtils'
import { resolveSurfaceOrgId } from '../../utils/surfaceContext'
import { showError, showSuccess } from '../../utils/toast'
import './studio-workspace.css'

function inferSceneType(projectType) {
  if (projectType === 'asset') return 'outdoor-event'
  return projectType === 'warehouse' ? 'warehouse' : 'outdoor-event'
}

function getDirectEditorName(projectType) {
  if (projectType === 'asset') return '未命名3D资产'
  if (projectType === 'venue') return '未命名场馆白模'
  if (projectType === 'site') return '未命名场地白模'
  return '未命名仓储白模'
}

function getEditorModeLabel(projectType) {
  if (projectType === 'asset') return '3D 资产'
  return '3D 白模'
}

function ensureDirectEditorSnapshot(snapshot, options = {}) {
  const normalized = normalizeStudioSnapshot(snapshot, options)
  const hierarchy = getStudioHierarchy(normalized)
  const preferredWorkspace = {
    activeBuildingId: hierarchy.activeBuilding?.id || normalized.editorState?.activeBuildingId || null,
    activeLevelId: hierarchy.activeLevel?.id || normalized.editorState?.activeLevelId || null,
    activeWarehouseId: hierarchy.activeWarehouse?.id || normalized.editorState?.activeWarehouseId || null,
    activeWorkspaceMode: 'warehouse',
  }

  if (hierarchy.activeWarehouse) {
    return setStudioSelection(normalized, preferredWorkspace)
  }

  const seedBuilding = createStudioBuildingDraft({
    name: normalized.site?.name || options.name || '白模建筑',
    address: normalized.site?.geoAnchor?.address || '',
    widthMeters: options.sceneType === 'outdoor-event' ? 48 : 36,
    depthMeters: options.sceneType === 'outdoor-event' ? 32 : 24,
    floorCount: 1,
    floorHeight: options.sceneType === 'outdoor-event' ? 6 : 4.5,
    sceneType: options.sceneType || normalized.sceneType || 'warehouse',
  })
  const seeded = normalizeStudioSnapshot({
    ...normalized,
    site: {
      ...normalized.site,
      name: normalized.site?.name || options.name || '未命名项目',
      projectType: normalized.projectType || options.projectType || 'warehouse',
      geoAnchor: normalized.site?.geoAnchor || options.geoAnchor || null,
    },
    buildings: [...(normalized.buildings || []), seedBuilding],
  }, {
    sceneType: options.sceneType || normalized.sceneType,
    projectType: options.projectType || normalized.projectType,
    name: normalized.site?.name || options.name,
    geoAnchor: normalized.site?.geoAnchor || options.geoAnchor || null,
  })
  const level = seedBuilding.levels?.[0] || null
  const warehouse = level?.warehouses?.[0] || null

  return setStudioSelection(seeded, {
    activeBuildingId: seedBuilding.id,
    activeLevelId: level?.id || null,
    activeWarehouseId: warehouse?.id || null,
    activeWorkspaceMode: 'warehouse',
  })
}

function safeGenerateThumbnail(snapshot) {
  try {
    return generateThumbnail(getThumbnailScene(snapshot))
  } catch (error) {
    console.warn('Failed to generate studio thumbnail', error)
    return null
  }
}

export default function StudioProjectPage({ mode = 'existing', routeProjectId = null }) {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const effectiveProjectId = routeProjectId || projectId
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const orgId = resolveSurfaceOrgId(searchParams, user)
  const requestedProjectType = searchParams.get('projectType') || 'warehouse'
  const requestedSceneType = searchParams.get('sceneType') || inferSceneType(requestedProjectType)
  const requestedName = searchParams.get('name') || getDirectEditorName(requestedProjectType)
  const requestedWarehouseId = searchParams.get('warehouseId')
  const requestedFocusZoneId = searchParams.get('focusZoneId')
  const listHref = useMemo(() => buildAppHref('/3d-studio', { orgId }), [orgId])
  const mapHref = useMemo(() => {
    const href = buildAppHref('/map', { orgId })
    const nextUrl = new URL(href, window.location.origin)
    if (effectiveProjectId) nextUrl.searchParams.set('projectId', effectiveProjectId)
    if (requestedFocusZoneId) nextUrl.searchParams.set('focusZoneId', requestedFocusZoneId)
    return `${nextUrl.pathname}${nextUrl.search}`
  }, [effectiveProjectId, orgId, requestedFocusZoneId])
  const [loading, setLoading] = useState(mode === 'existing')
  const [project, setProject] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [focusZone, setFocusZone] = useState(null)
  const [focusZoneObjects, setFocusZoneObjects] = useState([])
  const [assetTemplates, setAssetTemplates] = useState([])
  const [terrainPatchGenerating, setTerrainPatchGenerating] = useState(false)
  const editorModeLabel = useMemo(() => getEditorModeLabel(project?.projectType || requestedProjectType), [project?.projectType, requestedProjectType])
  const focusZoneContext = useMemo(() => (
    focusZone ? buildFocusZoneWorkbenchContext(focusZone) : null
  ), [focusZone])
  const focusZoneObjectsContext = useMemo(() => (
    focusZoneContext ? buildFocusZoneObjectContext(focusZoneObjects, focusZoneContext) : []
  ), [focusZoneContext, focusZoneObjects])
  const focusZoneObjectSummary = useMemo(() => (
    summarizeFocusZoneObjects(focusZoneObjectsContext)
  ), [focusZoneObjectsContext])

  const buildProjectOptions = useCallback((projectRecord = null) => ({
    sceneType: projectRecord?.sceneType || requestedSceneType,
    projectType: projectRecord?.projectType || requestedProjectType,
    name: projectRecord?.name || requestedName,
    geoAnchor: projectRecord?.geoAnchor || null,
  }), [requestedName, requestedProjectType, requestedSceneType])

  const applyProjectData = useCallback((projectRecord) => {
    const nextSnapshot = ensureDirectEditorSnapshot(projectRecord?.snapshotJson, buildProjectOptions(projectRecord))
    setProject(projectRecord)
    setSnapshot(nextSnapshot)
    return nextSnapshot
  }, [buildProjectOptions])

  const loadProject = useCallback(async () => {
    if (!orgId && mode !== 'existing') {
      setSnapshot(ensureDirectEditorSnapshot(createBlankStudioScene(buildProjectOptions()), buildProjectOptions()))
      setLoading(false)
      return
    }

    if (mode === 'new') {
      setProject(null)
      if (requestedWarehouseId) {
        try {
          const twinSceneResult = await twinApi.getScene(requestedWarehouseId, orgId || undefined)
          const importedSnapshot = buildImportedWarehouseSnapshot({
            warehouseId: requestedWarehouseId,
            projectType: requestedProjectType,
            sceneType: requestedSceneType,
            payload: twinSceneResult?.data || {},
          })
          setSnapshot(ensureDirectEditorSnapshot(importedSnapshot, buildProjectOptions()))
        } catch (error) {
          showError(`加载仓库白模失败：${error.message}`)
          setSnapshot(ensureDirectEditorSnapshot(createBlankStudioScene(buildProjectOptions()), buildProjectOptions()))
        }
      } else {
        setSnapshot(ensureDirectEditorSnapshot(createBlankStudioScene(buildProjectOptions()), buildProjectOptions()))
      }
      setLoading(false)
      return
    }

    if (!effectiveProjectId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await studioProjectApi.getProject(effectiveProjectId, orgId || undefined)
      applyProjectData(result.data)
    } catch (error) {
      showError(`加载 3D 项目失败：${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [applyProjectData, buildProjectOptions, effectiveProjectId, mode, orgId, requestedProjectType, requestedSceneType, requestedWarehouseId])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  useEffect(() => {
    let active = true

    if (!orgId) {
      setAssetTemplates([])
      return () => {
        active = false
      }
    }

    studioProjectApi.listAssetTemplates(orgId || undefined)
      .then((result) => {
        if (!active) return
        setAssetTemplates(Array.isArray(result?.data) ? result.data : [])
      })
      .catch((error) => {
        if (!active) return
        console.warn('[StudioProjectPage] Failed to load asset templates', error)
        setAssetTemplates([])
      })

    return () => {
      active = false
    }
  }, [orgId])

  useEffect(() => {
    let active = true

    if (!effectiveProjectId || !requestedFocusZoneId) {
      setFocusZone(null)
      setFocusZoneObjects([])
      return () => {
        active = false
      }
    }

    Promise.all([
      studioProjectApi.getTerrainWorkZone(requestedFocusZoneId, orgId || undefined),
      studioProjectApi.listSpatialObjects(effectiveProjectId, { focusZoneId: requestedFocusZoneId }, orgId || undefined),
    ])
      .then(async ([zoneResult, objectsResult]) => {
        if (!active) return

        const zoneRecord = zoneResult?.data || null
        const scopedObjects = Array.isArray(objectsResult?.data) ? objectsResult.data : []
        const includedObjectIds = Array.isArray(zoneRecord?.includedObjectIds) ? zoneRecord.includedObjectIds : []
        const scopedObjectIds = new Set(scopedObjects.map((item) => item?.id).filter(Boolean))
        const missingIncludedIds = includedObjectIds.filter((id) => !scopedObjectIds.has(id))

        let nextObjects = scopedObjects
        if (missingIncludedIds.length > 0) {
          const allObjectsResult = await studioProjectApi.listSpatialObjects(effectiveProjectId, {}, orgId || undefined)
          const allObjects = Array.isArray(allObjectsResult?.data) ? allObjectsResult.data : []
          const includedObjects = allObjects.filter((item) => missingIncludedIds.includes(item?.id))
          nextObjects = [...scopedObjects, ...includedObjects]
        }

        if (!active) return
        setFocusZone(zoneRecord)
        setFocusZoneObjects(nextObjects)
      })
      .catch(() => {
        if (!active) return
        setFocusZone(null)
        setFocusZoneObjects([])
      })

    return () => {
      active = false
    }
  }, [effectiveProjectId, orgId, requestedFocusZoneId])

  useEffect(() => {
    let active = true

    if (!focusZone || !requestedFocusZoneId || terrainPatchGenerating || extractFocusZoneTerrainPatch(focusZone)) {
      return () => {
        active = false
      }
    }

    setTerrainPatchGenerating(true)
    import('../../utils/map/focusZoneTerrainPatch')
      .then(async ({ generateTerrainPatchForZone }) => {
        const terrainPatch = await generateTerrainPatchForZone(focusZone, {
          terrainResolution: focusZone?.terrainResolution ?? 2,
        })

        const updateResult = await studioProjectApi.updateTerrainWorkZone(requestedFocusZoneId, {
          snapshotJson: {
            ...(focusZone.snapshotJson || {}),
            terrainPatch,
          },
          metadata: {
            ...(focusZone.metadata || {}),
            terrainPatchGeneratedAt: terrainPatch.sampledAt,
            terrainHeightDeltaMeters: terrainPatch.heightDeltaMeters,
          },
          terrainResolution: terrainPatch.resolutionMeters,
          status: 'ready',
        }, orgId || undefined)

        if (!active) return
        if (updateResult?.data) {
          setFocusZone(updateResult.data)
        }
      })
      .catch((error) => {
        if (!active) return
        console.warn('[StudioProjectPage] Failed to auto-generate terrain patch:', error)
      })
      .finally(() => {
        if (active) setTerrainPatchGenerating(false)
      })

    return () => {
      active = false
    }
  }, [focusZone, orgId, requestedFocusZoneId, terrainPatchGenerating])

  const hierarchy = useMemo(() => (
    snapshot ? getStudioHierarchy(snapshot) : { activeBuilding: null, activeLevel: null, activeWarehouse: null }
  ), [snapshot])

  const editableProjectOptions = useMemo(() => {
    const nextOptions = buildProjectOptions(project)
    if (!nextOptions.geoAnchor && focusZoneContext?.originWgs84) {
      nextOptions.geoAnchor = focusZoneContext.originWgs84
    }
    if ((!project?.name || !snapshot) && focusZone?.name) {
      nextOptions.name = focusZone.name
    }
    return nextOptions
  }, [buildProjectOptions, focusZone?.name, focusZoneContext?.originWgs84, project, snapshot])

  const editableSnapshot = useMemo(() => {
    if (mode === 'existing' && effectiveProjectId && !project && !snapshot) {
      return null
    }
    return ensureDirectEditorSnapshot(
      snapshot || createBlankStudioScene(editableProjectOptions),
      editableProjectOptions,
    )
  }, [editableProjectOptions, effectiveProjectId, mode, project, snapshot])

  const editableHierarchy = useMemo(() => (
    editableSnapshot ? getStudioHierarchy(editableSnapshot) : { activeBuilding: null, activeLevel: null, activeWarehouse: null }
  ), [editableSnapshot])

  const workbenchInitialScene = useMemo(() => (
    extractFocusZoneWorkbenchScene(focusZone)
      || (() => {
        const templateSceneObject = focusZoneObjects.find((item) => {
          const template = assetTemplates.find((templateItem) => templateItem.id === item?.templateId)
          return Boolean(getTemplateSceneSnapshot(template))
        })
        if (!templateSceneObject) return null
        const template = assetTemplates.find((templateItem) => templateItem.id === templateSceneObject.templateId)
        return getTemplateSceneSnapshot(template)
      })()
      || editableHierarchy.activeWarehouse?.sceneSnapshot
      || null
  ), [assetTemplates, editableHierarchy.activeWarehouse?.sceneSnapshot, focusZone, focusZoneObjects])

  const warehouseMeta = useMemo(() => {
    if (!editableHierarchy.activeWarehouse) return null
    return {
      id: editableHierarchy.activeWarehouse.id,
      name: editableHierarchy.activeWarehouse.name,
      code: editableHierarchy.activeWarehouse.code,
      orgId,
      buildingId: editableHierarchy.activeBuilding?.id || null,
      buildingName: editableHierarchy.activeBuilding?.name || null,
      levelId: editableHierarchy.activeLevel?.id || null,
      levelName: editableHierarchy.activeLevel?.name || null,
    }
  }, [editableHierarchy, orgId])

  const handleDesignerSceneChange = useCallback((nextScene) => {
    setSnapshot((current) => {
      if (!current) return current
      const currentHierarchy = getStudioHierarchy(current)
      const warehouseId = currentHierarchy.activeWarehouse?.id
      if (!warehouseId) return current
      return mergeWarehouseSceneIntoSnapshot(current, warehouseId, nextScene)
    })
  }, [])

  const persistSnapshot = useCallback(async (nextSnapshot) => {
    const projectOptions = buildProjectOptions(project)
    const name = getProjectNameFromScene(nextSnapshot, project?.name || projectOptions.name)
    const thumbnailDataUrl = safeGenerateThumbnail(nextSnapshot)

    if (!project?.id) {
      const result = await studioProjectApi.createProject({
        name,
        sceneType: projectOptions.sceneType,
        projectType: projectOptions.projectType,
        status: 'draft',
        sourceType: 'blank',
        geoAnchor: nextSnapshot.site?.geoAnchor || null,
        thumbnailDataUrl,
        snapshotJson: nextSnapshot,
      }, orgId || undefined)
      const createdProject = result.data
      setProject(createdProject)
      setSnapshot(ensureDirectEditorSnapshot(createdProject?.snapshotJson || nextSnapshot, buildProjectOptions(createdProject)))
      showSuccess('3D 项目已创建')
      navigate(buildAppHref(`/3d-studio/${createdProject.id}`, { orgId }), { replace: true })
      return createdProject
    }

    const result = await studioProjectApi.updateProject(project.id, {
      name,
      sceneType: project.sceneType,
      projectType: project.projectType,
      geoAnchor: nextSnapshot.site?.geoAnchor || null,
      thumbnailDataUrl,
      snapshotJson: nextSnapshot,
    }, orgId || undefined)
    setProject(result.data)
    setSnapshot(ensureDirectEditorSnapshot(result.data?.snapshotJson || nextSnapshot, buildProjectOptions(result.data)))
    showSuccess('3D 项目已保存')
    return result.data
  }, [buildProjectOptions, navigate, orgId, project])

  const handleWorkbenchSave = useCallback(async ({ snapshotJson }) => {
    if (!editableSnapshot) return
    const warehouseId = editableHierarchy.activeWarehouse?.id
    if (!warehouseId) {
      throw new Error('当前没有可保存的编辑场景')
    }

    const nextSnapshot = mergeWarehouseSceneIntoSnapshot(editableSnapshot, warehouseId, snapshotJson)
    setSnapshot(nextSnapshot)

    try {
      await persistSnapshot(nextSnapshot)
      if (requestedFocusZoneId) {
        const savedAt = new Date().toISOString()
        const zoneResult = await studioProjectApi.updateTerrainWorkZone(requestedFocusZoneId, {
          snapshotJson: {
            kind: 'studio-focus-zone-snapshot',
            focusZoneId: requestedFocusZoneId,
            projectId: project?.id || effectiveProjectId || null,
            savedAt,
            sceneType: nextSnapshot.sceneType,
            warehouseId,
            warehouseName: editableHierarchy.activeWarehouse?.name || null,
            warehouseScene: snapshotJson,
            focusZoneContext: focusZoneContext || null,
          },
          metadata: {
            ...(focusZone?.metadata || {}),
            lastWorkbenchSaveAt: savedAt,
            sourceWarehouseId: warehouseId,
          },
          status: 'ready',
        }, orgId || undefined)
        if (zoneResult?.data) {
          setFocusZone(zoneResult.data)
        }
      }
    } catch (error) {
      showError(`保存 3D 项目失败：${error.message}`)
      throw error
    }
  }, [
    effectiveProjectId,
    editableHierarchy.activeWarehouse?.id,
    editableHierarchy.activeWarehouse?.name,
    editableSnapshot,
    focusZone,
    focusZoneContext,
    orgId,
    persistSnapshot,
    project?.id,
    requestedFocusZoneId,
  ])

  const handleSaveAssetTemplate = useCallback(async ({ snapshotJson }) => {
    const templateNameSeed = focusZone?.name || focusZoneObjects?.[0]?.title || requestedName || '空间模板'
    const templateName = window.prompt(
      '输入标准件名称',
      `${templateNameSeed} 模板`,
    )

    if (!templateName) return

    const inferredObjectType = focusZoneObjects.length === 1
      ? (focusZoneObjects[0]?.objectType || inferObjectTypeFromText(templateName) || 'generic')
      : inferObjectTypeFromText(templateName)

    const inferredPlacementMode = focusZoneObjects.length === 1
      ? (focusZoneObjects[0]?.placementMode || 'level-platform')
      : (inferredObjectType === 'light_tower' || inferredObjectType === 'route_sign'
        ? 'vertical-keep'
        : inferredObjectType === 'fence_segment'
          ? 'follow-terrain'
          : 'level-platform')

    const result = await studioProjectApi.createAssetTemplate({
      kind: 'model',
      category: inferredObjectType,
      name: templateName,
      parametersSchema: {
        objectType: { type: 'string' },
        placementMode: { type: 'string' },
        brandingPackId: { type: 'string' },
        fasciaStyle: { type: 'string' },
      },
      defaultParameters: {
        objectType: inferredObjectType,
        placementMode: inferredPlacementMode,
        brandingPackId: focusZoneObjects?.[0]?.brandingPackId || null,
        fasciaStyle: focusZoneObjects?.[0]?.materialVariant?.fasciaStyle || 'classic',
        sponsorName: focusZoneObjects?.[0]?.materialVariant?.sponsorName || null,
        color: focusZoneObjects?.[0]?.materialVariant?.color || '#3388ff',
        accentColor: focusZoneObjects?.[0]?.materialVariant?.accentColor || '#ffffff',
        sceneSnapshot: snapshotJson,
        warehouseScene: snapshotJson,
        sourceProjectId: project?.id || effectiveProjectId || null,
        sourceFocusZoneId: requestedFocusZoneId || null,
      },
    }, orgId || undefined)

    const createdTemplate = result?.data || null
    if (createdTemplate) {
      setAssetTemplates((current) => [createdTemplate, ...current.filter((item) => item.id !== createdTemplate.id)])
    }
    showSuccess(`标准件模板已保存：${templateName}`)
  }, [effectiveProjectId, focusZone?.name, focusZoneObjects, orgId, project?.id, requestedFocusZoneId, requestedName])

  const handleSavePrimaryAsset = useCallback(async ({ snapshotJson }) => {
    if (!editableSnapshot) return
    const warehouseId = editableHierarchy.activeWarehouse?.id
    if (!warehouseId) {
      throw new Error('当前没有可保存的编辑场景')
    }

    const nextSnapshot = mergeWarehouseSceneIntoSnapshot(editableSnapshot, warehouseId, snapshotJson)
    setSnapshot(nextSnapshot)

    const savedProject = await persistSnapshot(nextSnapshot)
    const projectRecord = savedProject || project
    if (!projectRecord?.id) return

    const suggestedName = projectRecord.projectType === 'asset'
      ? (projectRecord.name || requestedName || '未命名3D资产')
      : `${projectRecord.name || requestedName || '未命名项目'} 3D资产`

    const assetName = window.prompt('输入 3D 资产名称', suggestedName)
    if (!assetName) return

    const result = await studioProjectApi.savePrimaryAsset(projectRecord.id, {
      name: assetName,
      category: inferObjectTypeFromText(assetName),
      description: `${projectRecord.name || assetName} 的项目级 3D 资产`,
      thumbnailDataUrl: safeGenerateThumbnail(nextSnapshot),
    }, orgId || undefined)

    if (result?.data?.project) {
      setProject(result.data.project)
    }
    showSuccess(`3D 资产已保存：${assetName}`)
  }, [
    editableHierarchy.activeWarehouse?.id,
    editableSnapshot,
    orgId,
    persistSnapshot,
    project,
    requestedName,
  ])

  if (!orgId) {
    return (
      <div className="studio-shell studio-shell--empty">
        <section className="studio-shell__empty-card">
          <div className="studio-shell__eyebrow">3D 编辑器</div>
          <h2>缺少机构上下文</h2>
          <p>请使用机构管理员账号进入，或者在地址里附带 `?orgId=...` 后再打开 3D 编辑器。</p>
        </section>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="studio-shell studio-shell--empty">
        <section className="studio-shell__empty-card">
          <div className="studio-shell__eyebrow">3D 编辑器</div>
          <h2>正在打开编辑器</h2>
          <p>正在装载白模场景与项目快照。</p>
        </section>
      </div>
    )
  }

  if (!editableSnapshot || !warehouseMeta) {
    return (
      <div className="studio-shell studio-shell--empty">
        <section className="studio-shell__empty-card">
          <div className="studio-shell__eyebrow">3D 编辑器</div>
          <h2>当前项目没有可编辑场景</h2>
          <p>系统未找到可用的编辑场景，无法直接进入编辑器。</p>
          <div className="studio-shell__empty-actions">
            <button type="button" className="studio-shell__ghost" onClick={() => navigate(listHref)}>
              返回项目列表
            </button>
            <button type="button" className="studio-shell__primary" onClick={loadProject}>
              重新载入
            </button>
          </div>
        </section>
      </div>
    )
  }

  const studioTitle = project?.name || warehouseMeta?.name || requestedName || '空间工作台'
  const studioSceneKey = `${project?.id || `draft:${requestedProjectType}:${requestedSceneType}`}:${requestedFocusZoneId || 'root'}:${focusZone?.updatedAt || 'base'}`

  return (
    <div className="studio-shell studio-shell--direct">
      <header className="studio-shell__immersive-header">
        <div className="studio-shell__immersive-heading">
          <button type="button" className="studio-shell__ghost" onClick={() => navigate(listHref)}>
            返回工作台
          </button>
          <div className="studio-shell__immersive-title">
            <div className="studio-shell__eyebrow">空间工作台</div>
            <h1>{studioTitle}</h1>
          </div>
          <span className="studio-shell__meta-chip is-accent">编辑模式</span>
          <span className="studio-shell__meta-chip">{editorModeLabel}</span>
          {focusZone && (
            <span className="studio-shell__meta-chip">
              重点区: {focusZone.name || requestedFocusZoneId}
            </span>
          )}
        </div>

        <div className="studio-shell__immersive-actions">
          <Link to={mapHref} className="studio-shell__ghost">
            进入 GIS 地图
          </Link>
        </div>
      </header>

      <section className="studio-shell__workspace studio-shell__workspace--direct">
        <Studio3DApp
          sceneKey={studioSceneKey}
          initialScene={workbenchInitialScene}
          sceneType={editableSnapshot.sceneType}
          warehouseMeta={warehouseMeta}
          rackTemplates={BUILTIN_RACK_TEMPLATES}
          sourceContext={focusZoneContext ? { label: `重点区 · ${focusZoneContext.name}` } : null}
          focusZoneContext={focusZoneContext}
          focusZoneObjectsContext={focusZoneObjectsContext}
          focusZoneObjectSummary={focusZoneObjectSummary}
          preferredSidebarTab="structure"
          compactChrome
          embedded
          onSceneChange={handleDesignerSceneChange}
          onSave={handleWorkbenchSave}
          onSaveTemplate={handleSaveAssetTemplate}
          onSaveAsset={handleSavePrimaryAsset}
        />
      </section>
    </div>
  )
}
