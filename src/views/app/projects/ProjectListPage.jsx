import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import projectsApi from '../../../api/projects'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandShell,
} from '../../../components/command/CommandPrimitives'

export default function ProjectListPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    projectsApi.getAll()
      .then((data) => {
        if (data.success) setProjects(data.data || [])
        else setError(data.message || '加载项目失败')
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
    <div className="command-page surface-app">
      <CommandShell
        eyebrow="项目计划"
        title="项目计划管理"
        summary="统一查看项目计划、赛事关联关系与后续编辑入口。列表结构与应用层保持一致。"
        actions={<Link to="/app/projects/new" className="btn btn--primary">新建项目</Link>}
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      {error ? <CommandNotice tone="danger">{error}</CommandNotice> : null}
      {loading ? <CommandNotice tone="info">正在加载项目计划...</CommandNotice> : null}

      <CommandPanel title="项目列表" subtitle="进入项目详情可继续编辑计划、阶段与关联信息。">
        {!loading && !projects.length ? (
          <CommandEmptyState
            title="暂无项目计划"
            description="可以先创建一个项目计划，再进入详情完善阶段、归属赛事与执行内容。"
            action={<Link to="/app/projects/new" className="btn btn--primary">创建首个项目</Link>}
            icon="PJ"
          />
        ) : null}

        {!loading && projects.length ? (
          <CommandDataTable>
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
          </CommandDataTable>
        ) : null}
      </CommandPanel>
    </div>
  )
}
