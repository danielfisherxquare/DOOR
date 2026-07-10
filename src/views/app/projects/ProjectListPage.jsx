import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import projectsApi from '../../../api/projects'
import {
  AppH5DataCard,
  AppH5DataTable,
  AppH5EmptyState,
  AppH5Notice,
  AppH5Panel,
  AppH5Surface,
  AppH5StatusTag,
} from '../../../components/app/AppH5Surface'

export default function ProjectListPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    projectsApi.getAll()
      .then((response) => {
        if (response?.success === false) {
          setError(response.message || '加载项目失败')
          setProjects([])
        } else {
          setProjects(Array.isArray(response.data) ? response.data : [])
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load projects:', err)
        setError(err.message || '加载项目失败')
        setLoading(false)
      })
  }, [])

  const metrics = useMemo(() => {
    const withRace = projects.filter((project) => project.race_id).length
    return [
      { key: 'total', label: '项目总数', value: projects.length, meta: '当前已创建的项目计划总量', pill: 'PJ' },
      { key: 'linked', label: '关联赛事', value: withRace, meta: '已经绑定赛事上下文的项目数量', pill: 'RC' },
      { key: 'unlinked', label: '待补上下文', value: Math.max(0, projects.length - withRace), meta: '仍需补充赛事归属的项目计划', pill: 'CTX' },
    ]
  }, [projects])

  return (
    <AppH5Surface
      className="project-list-page"
      eyebrow="项目计划"
      title="项目计划管理"
      summary="统一查看项目计划、赛事关联关系与后续编辑入口。列表结构与应用层保持一致。"
      metrics={metrics}
      actions={<Link to="/app/projects/new" className="btn btn--primary">新建项目</Link>}
    >
      {error ? <AppH5Notice tone="danger">{error}</AppH5Notice> : null}
      {loading ? <AppH5Notice tone="info">正在加载项目计划...</AppH5Notice> : null}

      <AppH5Panel title="项目列表" summary="进入项目详情可继续编辑计划、阶段与关联信息。">
        {!loading && !projects.length ? (
          <AppH5EmptyState
            title="暂无项目计划"
            description="可以先创建一个项目计划，再进入详情完善阶段、归属赛事与执行内容。"
            action={<Link to="/app/projects/new" className="btn btn--primary">创建首个项目</Link>}
            icon="PJ"
          />
        ) : null}

        {!loading && projects.length ? (
          <AppH5DataTable
            mobileCards={projects.map((project) => (
              <AppH5DataCard
                key={project.id}
                eyebrow={project.race_id ? `赛事 ID ${project.race_id}` : '待补赛事'}
                title={project.name}
                meta={(
                  <AppH5StatusTag tone={project.race_id ? 'success' : 'warning'}>
                    {project.race_id ? '已关联赛事' : '待补赛事'}
                  </AppH5StatusTag>
                )}
                fields={[
                  { key: 'name', label: '项目名称', value: project.name },
                  { key: 'race', label: '关联赛事', value: project.race_id || '-' },
                  { key: 'status', label: '状态', value: project.race_id ? '已关联赛事' : '待补赛事' },
                ]}
                actions={(
                  <Link to={`/app/projects/${project.id}`} className="btn btn--ghost btn--sm">
                    编辑计划
                  </Link>
                )}
              />
            ))}
          >
            <table>
              <thead>
                <tr>
                  <th>项目名称</th>
                  <th>关联赛事 ID</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project.race_id || '-'}</td>
                    <td>{project.race_id ? '已关联赛事' : '待补赛事'}</td>
                    <td>
                      <Link to={`/app/projects/${project.id}`} className="btn btn--ghost btn--sm">
                        编辑计划
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AppH5DataTable>
        ) : null}
      </AppH5Panel>
    </AppH5Surface>
  )
}
