import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import studioProjectApi from '../../services/studioProjectApi'
import { buildAppHref } from '../../components/app/appConfig'
import { resolveSurfaceOrgId } from '../../utils/surfaceContext'
import { showError, showSuccess } from '../../utils/toast'
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
  const buildStudioNewHref = useCallback((projectType, sceneType) => {
    const baseHref = buildAppHref('/3d-studio/new', { orgId })
    const joiner = baseHref.includes('?') ? '&' : '?'
    return `${baseHref}${joiner}projectType=${projectType}&sceneType=${sceneType}`
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

  const stats = useMemo(() => {
    const importedCount = projects.filter((item) => item.sourceType === 'warehouse-import').length
    const assetCount = projects.filter((item) => item.projectType === 'asset').length
    return {
      total: projects.length,
      imported: importedCount,
      blank: projects.length - importedCount,
      asset: assetCount,
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

  if (!orgId) {
    return (
      <div className="studio-projects">
        <section className="studio-projects__hero">
          <div>
            <div className="studio-projects__eyebrow">空间工作台</div>
            <h2 className="studio-projects__title">机构共享工作区需要机构上下文</h2>
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
          <div className="studio-projects__eyebrow">空间工作台</div>
          <h2 className="studio-projects__title">直接打开的 3D 白模编辑器</h2>
          <p className="studio-projects__summary">
            现在新项目会直接进入 3D 编辑器，不再要求先走地图放置、建筑结构或仓库前置流程。旧项目和导入项目也可以继续在同一个编辑器里打开。
          </p>
        </div>
        <div className="studio-projects__actions">
          <Link to={buildStudioNewHref('warehouse', 'warehouse')} className="studio-projects__primary-action">
            新建仓储白模
          </Link>
          <Link to={buildStudioNewHref('asset', 'outdoor-event')} className="studio-projects__secondary-action">
            新建3D资产
          </Link>
          <Link to={buildStudioNewHref('venue', 'outdoor-event')} className="studio-projects__secondary-action">
            新建场馆白模
          </Link>
          <Link to={buildStudioNewHref('site', 'outdoor-event')} className="studio-projects__secondary-action">
            新建场地白模
          </Link>
        </div>
      </section>

      <section className="studio-projects__stats">
        <div className="studio-projects__stat-card">
          <span>项目总数</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="studio-projects__stat-card">
          <span>空白起步</span>
          <strong>{stats.blank}</strong>
        </div>
        <div className="studio-projects__stat-card">
          <span>3D资产</span>
          <strong>{stats.asset}</strong>
        </div>
        <div className="studio-projects__stat-card">
          <span>仓库导入</span>
          <strong>{stats.imported}</strong>
        </div>
      </section>

      <section className="studio-projects__section">
        <div className="studio-projects__section-header">
          <h3>我的项目</h3>
          <button type="button" className="studio-projects__refresh" onClick={loadProjects}>
            刷新
          </button>
        </div>

        {loading ? (
          <div className="studio-projects__empty">正在加载项目列表…</div>
        ) : projects.length === 0 ? (
          <div className="studio-projects__empty">
            <strong>还没有 3D 项目</strong>
            <span>从空白场景开始，或者从空间中心导入一个仓库视图。</span>
          </div>
        ) : (
          <div className="studio-projects__grid">
            {projects.map((project) => (
              <article key={project.id} className="studio-projects__card">
                <button type="button" className="studio-projects__card-hit" onClick={() => navigate(buildAppHref(`/3d-studio/${project.id}`, { orgId }))} aria-label={`打开 ${project.name}`} />
                <div className="studio-projects__card-top">
                  <span className="studio-projects__card-badge">{getProjectTypeLabel(project.projectType || project.sceneType)}</span>
                  <span className="studio-projects__card-source">{project.sourceType === 'warehouse-import' ? '仓库导入' : '空白项目'}</span>
                </div>
                <h4>{project.name}</h4>
                <p>
                  {project.projectType === 'asset'
                    ? '独立 3D 资产工作区，可用于帐篷、拱门、舞台等标准件建模。'
                    : project.sourceType === 'warehouse-import'
                    ? `来源仓库 #${project.sourceWarehouseId || '-'}`
                    : '机构共享项目，可直接在应用层继续编辑和保存。'}
                </p>
                <div className="studio-projects__meta">
                  <span>更新于 {formatDate(project.updatedAt)}</span>
                  <span>最近打开 {formatDate(project.lastOpenedAt)}</span>
                </div>
                <div className="studio-projects__card-actions">
                  <button type="button" onClick={() => navigate(buildAppHref(`/3d-studio/${project.id}`, { orgId }))}>打开</button>
                  <button type="button" onClick={() => handleDuplicate(project.id)}>复制</button>
                  <button type="button" className="is-danger" onClick={() => handleDelete(project.id)}>删除</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
