import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import { buildIdentityCenterHref } from '../../components/admin/adminConfig'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandShell,
  CommandStatusTag,
} from '../../components/command/CommandPrimitives'

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function getMemberTypeLabel(item) {
  if (item.member_type === 'external_support') {
    if (item.external_engagement_type === 'long_term') return '外援 / 长期'
    if (item.external_engagement_type === 'temporary') return '外援 / 临时'
    return '外援'
  }
  return '正式成员'
}

function getStatusTone(status) {
  if (status === 'active' || status === 'enabled') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'disabled' || status === 'inactive') return 'danger'
  return 'neutral'
}

function OrgDetailPage() {
  const { orgId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await adminApi.getOrgDetail(orgId)
        if (!cancelled && res.success) setData(res.data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const overview = data?.overview || {}
  const users = data?.users || []
  const races = data?.races || []
  const teamMembers = data?.teamMembers || []
  const projects = data?.projects || []

  const metrics = useMemo(() => ([
    {
      key: 'team',
      label: '团队人数',
      value: overview.teamMemberCount ?? teamMembers.length,
      meta: '机构下已登记的成员总数。',
      pill: 'TM',
    },
    {
      key: 'accounts',
      label: '账号数',
      value: overview.loginAccountCount ?? users.length,
      meta: '已绑定到该机构的登录账号。',
      pill: 'IAM',
    },
    {
      key: 'projects',
      label: '项目数',
      value: overview.projectCount ?? projects.length,
      meta: '机构当前承接的项目计划数量。',
      pill: 'PJ',
    },
    {
      key: 'races',
      label: '赛事数',
      value: overview.activeRaceCount ?? races.length,
      meta: '已挂接到该机构的赛事规模。',
      pill: 'RC',
    },
  ]), [overview, projects.length, races.length, teamMembers.length, users.length])

  if (loading) {
    return (
      <div className="command-page surface-admin">
        <CommandPanel title="机构详情加载中" subtitle="正在汇总团队、账号、赛事和项目信息。">
          <CommandNotice tone="info">请稍候，控制台正在拉取机构画像。</CommandNotice>
        </CommandPanel>
      </div>
    )
  }

  if (error) {
    return (
      <div className="command-page surface-admin">
        <CommandPanel title="机构详情加载失败" subtitle="未能完成机构画像同步。">
          <CommandNotice tone="danger">{error}</CommandNotice>
        </CommandPanel>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="command-page surface-admin">
        <CommandPanel title="未找到机构" subtitle="请返回机构列表重新选择。">
          <CommandEmptyState title="没有可展示的机构详情" description="当前机构不存在，或你没有访问该机构详情的权限。" icon="ORG" />
        </CommandPanel>
      </div>
    )
  }

  return (
    <div className="command-page surface-admin">
      <CommandShell
        eyebrow="平台治理"
        title={data.name}
        summary="从机构维度查看团队、账号、项目和赛事承接关系，帮助超管快速判断组织健康度与后续治理动作。"
        actions={(
          <div className="command-actions-row">
            <Link className="btn btn--secondary" to={`/admin/team?orgId=${data.id}`}>团队管理</Link>
            <Link className="btn btn--secondary" to={`/admin/projects?orgId=${data.id}`}>项目计划</Link>
            <Link className="btn btn--secondary" to={buildIdentityCenterHref('org-race', { selectedOrgId: data.id })}>身份中心</Link>
          </div>
        )}
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      <div className="command-grid command-grid--two">
        <CommandPanel title="团队成员" subtitle={`当前展示前 ${Math.min(teamMembers.length, 8)} 名成员`}>
          {teamMembers.length === 0 ? (
            <CommandEmptyState title="暂无团队成员" description="可以先到团队管理页导入成员，再继续开通账号与赛事权限。" icon="TM" />
          ) : (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>工号</th>
                  <th>姓名</th>
                  <th>岗位 / 部门</th>
                  <th>类型</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.slice(0, 8).map((item) => (
                  <tr key={item.id || `${item.employee_code}-${item.employee_name}`}>
                    <td>{item.employee_code || '-'}</td>
                    <td>{item.employee_name || '-'}</td>
                    <td>{`${item.position || '-'} / ${item.department || '-'}`}</td>
                    <td>{getMemberTypeLabel(item)}</td>
                    <td>
                      <CommandStatusTag tone={getStatusTone(item.status)}>{item.status || '未标记'}</CommandStatusTag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          )}
        </CommandPanel>

        <CommandPanel title="账号概况" subtitle={`当前展示前 ${Math.min(users.length, 8)} 个账号`}>
          {users.length === 0 ? (
            <CommandEmptyState title="暂无账号" description="机构还没有可登录账号，可以先从身份中心或团队页继续开通。" icon="ID" />
          ) : (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>绑定成员</th>
                  <th>角色</th>
                  <th>来源</th>
                  <th>待改密</th>
                </tr>
              </thead>
              <tbody>
                {users.slice(0, 8).map((item) => (
                  <tr key={item.id || item.username}>
                    <td>{item.username}</td>
                    <td>{item.team_member_name || '-'}</td>
                    <td>{item.role || '-'}</td>
                    <td>{item.account_source || 'manual'}</td>
                    <td>
                      <CommandStatusTag tone={item.must_change_password ? 'warning' : 'success'}>
                        {item.must_change_password ? '待修改' : '已完成'}
                      </CommandStatusTag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          )}
        </CommandPanel>

        <CommandPanel title="项目计划" subtitle={`当前展示前 ${Math.min(projects.length, 8)} 个项目`}>
          {projects.length === 0 ? (
            <CommandEmptyState title="暂无项目" description="可以先创建项目计划，再补齐项目阶段与赛事归属。" icon="PJ" />
          ) : (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>项目名称</th>
                  <th>关联赛事</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 8).map((item) => (
                  <tr key={item.id || item.name}>
                    <td>{item.name}</td>
                    <td>{item.race_id || '-'}</td>
                    <td>{formatDate(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          )}
        </CommandPanel>

        <CommandPanel title="赛事列表" subtitle={`当前展示前 ${Math.min(races.length, 8)} 场赛事`}>
          {races.length === 0 ? (
            <CommandEmptyState title="暂无赛事" description="机构还没有承接赛事，可以先到赛事管理页创建或挂接赛事。" icon="RC" />
          ) : (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>赛事名称</th>
                  <th>日期</th>
                  <th>地点</th>
                </tr>
              </thead>
              <tbody>
                {races.slice(0, 8).map((item) => (
                  <tr key={item.id || item.name}>
                    <td>{item.name}</td>
                    <td>{item.date ? new Date(item.date).toLocaleDateString('zh-CN') : '-'}</td>
                    <td>{item.location || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          )}
        </CommandPanel>
      </div>
    </div>
  )
}

export default OrgDetailPage
