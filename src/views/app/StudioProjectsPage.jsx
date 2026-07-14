import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import studioProjectApi from '../../services/studioProjectApi'
import { buildAppHref } from '../../components/app/appConfig'
import { resolveSurfaceOrgId } from '../../utils/surfaceContext'
import { showError, showSuccess } from '../../utils/toast'
import { isSiteModeBoundTerrainWorkZone } from '../../utils/map/terrainWorkZones'
import './studio-projects.css'

function formatDate(value) {
  if (!value) return '刚刚'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function getProjectTypeLabel(projectType) {
  if (projectType === 'asset') return '3D资产'
  if (projectType === 'venue') return '场馆项目'
  if (projectType === 'site') return '场地项目'
  return '仓储项目'
}

export default function StudioProjectsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const orgId = resolveSurfaceOrgId(searchParams, user)
  const buildStudioNewHref = useCallback(
    (projectType, sceneType) => {
      const baseHref = buildAppHref('/3d-studio/new', { orgId })
      const joiner = baseHref.includes('?') ? '&' : '?'
      return `${baseHref}${joiner}projectType=${projectType}&sceneType=${sceneType}`
    },
    [orgId],
  )
  const eventSiteHref = useMemo(() => {
    const baseHref = buildAppHref('/map', { orgId })
    const joiner = baseHref.includes('?') ? '&' : '?'
    return `${baseHref}${joiner}createMode=event-site`
  }, [orgId])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const result = await studioProjectApi.listProjects(orgId || undefined)
      setProjects(result.data || [])
    } catch (error) {
      showError(`加载项目失败：${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const projectSummary = useMemo(() => {
    const isWarehouseProject = (item) => (
      item.projectType === 'warehouse' || item.sourceType === 'warehouse-import'
    )
    const warehouseProjects = projects.filter(isWarehouseProject)
    const spatialProjects = projects.filter((item) => !isWarehouseProject(item))
    const assetCount = spatialProjects.filter((item) => item.projectType === 'asset').length
    const sceneCount = spatialProjects.length - assetCount
    return {
      spatialProjects,
      warehouseProjects,
      stats: {
        total: projects.length,
        scene: sceneCount,
        asset: assetCount,
        warehouse: warehouseProjects.length,
      },
    }
  }, [projects])

  async function handleDuplicate(projectId) {
    try {
      const result = await studioProjectApi.duplicateProject(projectId, orgId || undefined)
      showSuccess('项目已复制')
      navigate(buildAppHref(`/3d-studio/${result.data.id}`, { orgId }))
    } catch (error) {
      showError(`复制失败：${error.message}`)
    }
  }

  async function handleOpenProject(project) {
    try {
      if (project.siteFocusZoneId) {
        const href = buildAppHref('/3d-studio/site', { orgId })
        const url = new URL(href, window.location.origin)
        url.searchParams.set('projectId', project.id)
        url.searchParams.set('focusZoneId', project.siteFocusZoneId)
        navigate(url.pathname + url.search)
        return
      }
      const mayHaveSiteMode = project.sceneType === 'outdoor-event'
        && ['site', 'mixed', 'venue'].includes(project.projectType)
      if (mayHaveSiteMode) {
        const zonesResponse = await studioProjectApi.listTerrainWorkZones(
          project.id,
          {},
          orgId || undefined,
        )
        const siteFocusZone = (Array.isArray(zonesResponse?.data) ? zonesResponse.data : [])
          .find((zone) => isSiteModeBoundTerrainWorkZone(zone))
        if (siteFocusZone?.id) {
          const href = buildAppHref('/3d-studio/site', { orgId })
          const url = new URL(href, window.location.origin)
          url.searchParams.set('projectId', project.id)
          url.searchParams.set('focusZoneId', siteFocusZone.id)
          navigate(url.pathname + url.search)
          return
        }
      }
      navigate(buildAppHref(`/3d-studio/${project.id}`, { orgId }))
    } catch (error) {
      showError(`打开项目失败：${error.message}`)
    }
  }

  async function handleDelete(projectId) {
    if (!window.confirm('删除后无法恢复，确认删除这个项目吗？')) return
    try {
      await studioProjectApi.deleteProject(projectId, orgId || undefined)
      setProjects((current) => current.filter((item) => item.id !== projectId))
      showSuccess('项目已删除')
    } catch (error) {
      showError(`删除失败：${error.message}`)
    }
  }

  function renderProjectGrid(projectItems, emptyTitle, emptySummary) {
    if (projectItems.length === 0) {
      return (
        <div className="studio-projects__empty">
          <strong>{emptyTitle}</strong>
          <span>{emptySummary}</span>
        </div>
      )
    }

    return (
      <div className="studio-projects__grid">
        {projectItems.map((project) => (
          <article key={project.id} className="studio-projects__card">
            <button
              type="button"
              className="studio-projects__card-hit"
              onClick={() => void handleOpenProject(project)}
              aria-label={`打开 ${project.name}`}
            />
            <div className="studio-projects__card-top">
              <span className="studio-projects__card-badge">
                {getProjectTypeLabel(project.projectType || project.sceneType)}
              </span>
              <span className="studio-projects__card-source">
                {project.sourceType === 'warehouse-import' ? '仓库导入' : '空间项目'}
              </span>
            </div>
            <h4>{project.name}</h4>
            <p>
              {project.projectType === 'asset'
                ? '可复用的赛事 3D 资产，可用于帐篷、拱门、舞台等现场物件。'
                : project.sourceType === 'warehouse-import'
                  ? `来源仓库 #${project.sourceWarehouseId || '-'}`
                  : '在同一项目中继续地图规划、三维校验和现场物件布置。'}
            </p>
            <div className="studio-projects__meta">
              <span>更新于 {formatDate(project.updatedAt)}</span>
              <span>最近打开 {formatDate(project.lastOpenedAt)}</span>
            </div>
            <div className="studio-projects__card-actions">
              <button type="button" onClick={() => void handleOpenProject(project)}>
                打开
              </button>
              <button type="button" onClick={() => handleDuplicate(project.id)}>
                复制
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => handleDelete(project.id)}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
    )
  }

  if (!orgId) {
    return (
      <div className="studio-projects">
        <section className="studio-projects__hero">
          <div>
            <div className="studio-projects__eyebrow">空间项目</div>
            <h2 className="studio-projects__title">空间项目需要机构上下文</h2>
            <p className="studio-projects__summary">
              请使用机构管理员账号进入，或者在地址里附带 `?orgId=...` 打开机构共享项目。
            </p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="studio-projects">
      <section className="studio-projects__hero">
        <div>
          <div className="studio-projects__eyebrow">空间项目</div>
          <h2 className="studio-projects__title">从卫星地图开始搭建赛事现场</h2>
          <p className="studio-projects__summary">
            一个项目承载地图选址、二维规划、三维建筑和赛事物件。先确定场地，再在同一场景里完成展示与交付。
          </p>
        </div>
        <div className="studio-projects__actions">
          <Link
            to={eventSiteHref}
            className="studio-projects__primary-action"
          >
            <span className="material-symbols-outlined" aria-hidden="true">add_location_alt</span>
            新建赛事场地
          </Link>
          <Link
            to={buildStudioNewHref('venue', 'outdoor-event')}
            className="studio-projects__secondary-action"
          >
            新建场馆
          </Link>
          <Link
            to={buildStudioNewHref('asset', 'outdoor-event')}
            className="studio-projects__secondary-action"
          >
            创建 3D 资产
          </Link>
        </div>
      </section>

      <section className="studio-projects__section">
        <div className="studio-projects__section-header">
          <div>
            <span className="studio-projects__section-kicker">最近使用</span>
            <h3>赛事场地与资产</h3>
          </div>
          <button type="button" className="studio-projects__refresh" onClick={loadProjects}>
            刷新
          </button>
        </div>

        {loading ? (
          <div className="studio-projects__empty">正在加载项目列表…</div>
        ) : (
          renderProjectGrid(
            projectSummary.spatialProjects,
            '还没有空间项目',
            '从“新建赛事场地”开始，在卫星地图上确定第一个现场范围。',
          )
        )}
      </section>

      <section className="studio-projects__stats" aria-label="空间项目统计">
        <div className="studio-projects__stat-card">
          <span>项目总数</span>
          <strong>{projectSummary.stats.total}</strong>
        </div>
        <div className="studio-projects__stat-card">
          <span>场地与场馆</span>
          <strong>{projectSummary.stats.scene}</strong>
        </div>
        <div className="studio-projects__stat-card">
          <span>3D 资产</span>
          <strong>{projectSummary.stats.asset}</strong>
        </div>
      </section>

      {projectSummary.warehouseProjects.length > 0 && (
        <section className="studio-projects__section studio-projects__section--secondary">
          <div className="studio-projects__section-header">
            <div>
              <span className="studio-projects__section-kicker">仓储管理</span>
              <h3>仓储数字孪生项目</h3>
            </div>
            <span className="studio-projects__section-count">
              {projectSummary.stats.warehouse} 个
            </span>
          </div>
          {renderProjectGrid(
            projectSummary.warehouseProjects,
            '没有仓储项目',
            '仓储数字孪生项目会从仓储空间中心进入。',
          )}
        </section>
      )}
    </div>
  )
}
