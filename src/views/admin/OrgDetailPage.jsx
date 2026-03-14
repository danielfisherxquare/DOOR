import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'

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
        if (!cancelled && res.success) {
          setData(res.data)
        }
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

  if (loading) return <div style={{ padding: 24 }}>加载中...</div>
  if (error) return <div style={{ padding: 24, color: 'var(--color-danger)' }}>{error}</div>
  if (!data) return <div style={{ padding: 24 }}>未找到机构。</div>

  const overview = data.overview || {}
  const users = data.users || []
  const races = data.races || []
  const teamMembers = data.teamMembers || []
  const projects = data.projects || []

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>{data.name}</h1>
          <div style={{ marginTop: 8, color: '#6b7280' }}>机构视角总览与团队、账号、项目、赛事概况</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn--secondary" to={`/admin/team?orgId=${data.id}`}>进入团队管理</Link>
          <Link className="btn btn--secondary" to={`/admin/projects?orgId=${data.id}`}>查看项目计划</Link>
          <Link className="btn btn--secondary" to={`/admin/race-permissions?orgId=${data.id}`}>赛事授权</Link>
        </div>
      </div>

      <div style={metricGridStyle}>
        <MetricCard title="团队人数" value={overview.teamMemberCount ?? teamMembers.length} />
        <MetricCard title="正式成员" value={overview.employeeCount ?? 0} />
        <MetricCard title="外援人数" value={overview.externalSupportCount ?? 0} />
        <MetricCard title="账号数" value={overview.loginAccountCount ?? 0} />
        <MetricCard title="项目数" value={overview.projectCount ?? projects.length} />
        <MetricCard title="赛事数" value={overview.activeRaceCount ?? races.length} />
      </div>

      <div style={sectionGridStyle}>
        <section style={panelStyle}>
          <SectionHeader title="团队成员" extra={`${teamMembers.length} 人`} />
          <SimpleTable
            columns={['工号', '姓名', '岗位 / 部门', '类型', '状态']}
            rows={teamMembers.slice(0, 8).map((item) => ([
              item.employee_code,
              item.employee_name,
              `${item.position || '-'} / ${item.department || '-'}`,
              item.member_type === 'external_support'
                ? `外援${item.external_engagement_type === 'long_term' ? ' · 长期' : item.external_engagement_type === 'temporary' ? ' · 临时' : ''}`
                : '正式成员',
              item.status,
            ]))}
            emptyText="暂无团队成员"
          />
        </section>

        <section style={panelStyle}>
          <SectionHeader title="账号概况" extra={`${users.length} 个`} />
          <SimpleTable
            columns={['用户名', '绑定成员', '角色', '来源', '待改密']}
            rows={users.slice(0, 8).map((item) => ([
              item.username,
              item.team_member_name || '-',
              item.role,
              item.account_source || 'manual',
              item.must_change_password ? '是' : '否',
            ]))}
            emptyText="暂无账号"
          />
        </section>

        <section style={panelStyle}>
          <SectionHeader title="项目计划" extra={`${projects.length} 个`} />
          <SimpleTable
            columns={['项目名称', '关联赛事', '更新时间']}
            rows={projects.slice(0, 8).map((item) => ([
              item.name,
              item.race_id || '-',
              item.updated_at ? new Date(item.updated_at).toLocaleString() : '-',
            ]))}
            emptyText="暂无项目"
          />
        </section>

        <section style={panelStyle}>
          <SectionHeader title="赛事列表" extra={`${races.length} 场`} />
          <SimpleTable
            columns={['赛事名称', '日期', '地点']}
            rows={races.slice(0, 8).map((item) => ([
              item.name,
              item.date ? new Date(item.date).toLocaleDateString() : '-',
              item.location || '-',
            ]))}
            emptyText="暂无赛事"
          />
        </section>
      </div>
    </div>
  )
}

function MetricCard({ title, value }) {
  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, color: '#6b7280' }}>{title}</div>
      <div style={{ marginTop: 10, fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function SectionHeader({ title, extra }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{extra}</span>
    </div>
  )
}

function SimpleTable({ columns, rows, emptyText }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} style={thStyle}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length > 0 ? rows.map((row, rowIndex) => (
          <tr key={rowIndex} style={{ borderTop: '1px solid #e5e7eb' }}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} style={tdStyle}>{cell}</td>
            ))}
          </tr>
        )) : (
          <tr>
            <td colSpan={columns.length} style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>{emptyText}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

const panelStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
}

const metricGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
}

const sectionGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
  gap: 16,
}

const thStyle = {
  textAlign: 'left',
  fontSize: 13,
  color: '#6b7280',
  padding: '10px 8px',
}

const tdStyle = {
  padding: '12px 8px',
  fontSize: 14,
  verticalAlign: 'top',
}

export default OrgDetailPage
