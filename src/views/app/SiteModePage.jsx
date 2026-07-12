import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Studio3DApp } from '../../3d-studio'
import studioProjectApi from '../../services/studioProjectApi'
import { buildFocusZoneStudioScene } from '../../utils/map/focusZoneStudioScene'
import { normalizeEditorDocument } from '../../3d-studio/model/editorDocument'
import { buildSiteBackdropData } from '../../3d-studio/model/siteBackdrop'
import {
  siteCacheKey,
  getCachedSite,
  setCachedSite,
  clearCachedSite,
} from '../../utils/map/siteBakeCache'
import { resolveSurfaceOrgId } from '../../utils/surfaceContext'
import useAuthStore from '../../stores/authStore'
import { buildAppHref } from '../../components/app/appConfig'
import './site-mode.css'

// 默认演示区域：成都天府广场（无 bbox 参数时）
const DEFAULT_BBOX = { west: 104.063, south: 30.647, east: 104.071, north: 30.654 }
const SITE_PROVIDER = 'esri'

function parseBboxParam(value) {
  if (!value) return null
  const parts = String(value).split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  const [west, south, east, north] = parts
  if (east <= west || north <= south) return null
  return { west, south, east, north }
}

// focusZone → Studio 可加载场景 + 只读底图数据
function buildSceneAndBackdrop(focusZone) {
  // 可编辑文档只含选区边界，OSM 白模/地形走只读底图层（不触发大场景退化 2D）
  const sceneFocusZone = {
    ...focusZone,
    snapshotJson: { ...focusZone.snapshotJson, osmBuildings: { buildings: [] } },
  }
  const built = buildFocusZoneStudioScene({ focusZone: sceneFocusZone })
  const doc = built.editorDocument || {}
  const cleanedDocument = normalizeEditorDocument({
    ...doc,
    terrainMeshes: [],
    solids: (doc.solids || []).filter(
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
  const bbox = useMemo(
    () => parseBboxParam(searchParams.get('bbox')) || DEFAULT_BBOX,
    [searchParams]
  )
  const name = searchParams.get('name') || '赛事场地'
  const forceRefresh = searchParams.get('refresh') === '1'
  const cacheKey = useMemo(() => siteCacheKey(bbox, SITE_PROVIDER), [bbox])

  const [status, setStatus] = useState('loading')
  const [scene, setScene] = useState(null)
  const [backdrop, setBackdrop] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [error, setError] = useState('')
  const [source, setSource] = useState(null) // 'cache' | 'fresh'
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let alive = true
    const skipCache = forceRefresh || reloadToken > 0

    async function load() {
      setStatus('loading')
      setError('')
      // 1) 命中缓存即时加载（离线/弱网现场仍可打开）
      if (!skipCache) {
        const cached = await getCachedSite(cacheKey)
        if (cached?.focusZone && alive) {
          const { scene: s, backdrop: b } = buildSceneAndBackdrop(cached.focusZone)
          setScene(s)
          setBackdrop(b)
          setWarnings([])
          setSource('cache')
          setStatus('ready')
          return
        }
      }
      // 2) 在线烘焙并写入缓存
      try {
        const res = await studioProjectApi.bakeSite(bbox, { name }, orgId)
        if (!alive) return
        const focusZone = res?.data?.focusZone
        if (!focusZone) throw new Error('site-bake 返回为空')
        const { scene: s, backdrop: b } = buildSceneAndBackdrop(focusZone)
        setScene(s)
        setBackdrop(b)
        setWarnings(Array.isArray(res?.data?.warnings) ? res.data.warnings : [])
        setSource('fresh')
        setStatus('ready')
        setCachedSite(cacheKey, focusZone)
      } catch (requestError) {
        if (!alive) return
        setError(requestError?.response?.data?.message || requestError?.message || '场地烘焙失败')
        setStatus('error')
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [cacheKey, name, orgId, forceRefresh, reloadToken, bbox])

  const handleBack = () => navigate(buildAppHref('/3d-studio', { orgId }))
  const handleRebake = async () => {
    await clearCachedSite(cacheKey)
    setReloadToken((token) => token + 1)
  }

  if (status === 'loading') {
    return <div className="site-mode__overlay">正在烘焙场地（卫星正射 + 地形 + 白模）…</div>
  }
  if (status === 'error') {
    return (
      <div className="site-mode__overlay">
        <div className="site-mode__error">
          <div className="site-mode__error-title">场地烘焙失败</div>
          <div className="site-mode__error-message">{error}</div>
          <button type="button" className="site-mode__button" onClick={handleBack}>
            返回空间工作台
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="site-mode">
      <Studio3DApp
        sceneKey={`site-${cacheKey}-${reloadToken}`}
        initialScene={scene}
        sceneType="outdoor-event"
        siteBackdrop={backdrop}
        onBack={handleBack}
        warehouseMeta={{ name }}
      />
      <div className="site-mode__status">
        <span>{source === 'cache' ? '离线缓存 · 已烘焙' : '在线烘焙 · 已缓存'}</span>
        <button type="button" className="site-mode__rebake" onClick={handleRebake}>
          重新烘焙
        </button>
      </div>
      {warnings.length > 0 ? (
        <div className="site-mode__warnings" role="status">
          {warnings.join('；')}
        </div>
      ) : null}
    </div>
  )
}
