import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import {
  AdminDataTable,
  AdminEmptyState,
  AdminPagination,
  AdminSectionHeader,
  AdminStatusPill,
  AdminSurface,
  AdminToolbar,
} from '../../components/admin/AdminWorkbench'
import './org-list-page.css'

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

export default function OrgListPage() {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.getOrgs({ page, limit, keyword })
      if (res.success) {
        setOrgs(res.data.items || [])
        setTotal(Number(res.data.total || 0))
      }
    } finally {
      setLoading(false)
    }
  }, [keyword, page])

  useEffect(() => {
    void fetchOrgs()
  }, [fetchOrgs])

  const handleSearch = (event) => {
    event.preventDefault()
    if (page !== 1) setPage(1)
    else void fetchOrgs()
  }

  const handleDeleteOrg = async (org) => {
    if (!window.confirm(`确认删除机构 ${org.name} 吗？删除前必须先清空该机构下的用户、团队成员和赛事。`)) return
    try {
      const res = await adminApi.deleteOrg(org.id)
      if (res.success) await fetchOrgs()
    } catch (error) {
      alert(error.message)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const metrics = useMemo(() => ([
    { label: '当前页机构', value: loading ? '...' : formatNumber(orgs.length), meta: '列表页当前返回结果。' },
    { label: '机构总量', value: loading ? '...' : formatNumber(total), meta: '平台治理的组织基数。' },
    { label: '平均赛事覆盖', value: loading || orgs.length === 0 ? '...' : formatNumber(Math.round(orgs.reduce((sum, org) => sum + Number(org.activeRaceCount ?? org.raceCount ?? 0), 0) / orgs.length)), meta: '粗略看机构承载的赛事规模。' },
  ]), [loading, orgs, total])

  return (
    <div className="org-list-page">
      <AdminSectionHeader
        eyebrow="平台治理"
        title="机构管理"
        description="机构是整个平台的一级对象。成员、账号、赛事、项目都会从这里继续展开，所以这一页不只是列表，更像平台组织地图。"
        actions={<Link to="/admin/orgs/new" className="btn btn--primary">新建机构</Link>}
        metrics={metrics}
      />

      <AdminToolbar>
        <form onSubmit={handleSearch} className="org-list-page__toolbar">
          <input
            className="input org-list-page__search"
            placeholder="搜索机构名称或 slug"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <button type="submit" className="btn btn--secondary">筛选</button>
        </form>
      </AdminToolbar>

      <AdminSurface
        title="组织总表"
        subtitle="把组织规模、成员结构和赛事承载能力放在同一张表里看，方便超管快速判断机构健康度。"
        footer={
          <AdminPagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((current) => current - 1)}
            onNext={() => setPage((current) => current + 1)}
          />
        }
      >
        {loading ? (
          <AdminEmptyState title="机构数据加载中" description="正在汇总组织规模、账号与赛事信息，请稍候。" />
        ) : orgs.length === 0 ? (
          <AdminEmptyState
            title="还没有符合条件的机构"
            description="可以先放宽筛选条件，或者直接创建新的机构条目，补齐后续成员与赛事的承接关系。"
            action={<Link to="/admin/orgs/new" className="btn btn--primary">创建首个机构</Link>}
          />
        ) : (
          <AdminDataTable>
            <thead>
              <tr>
                <th>机构</th>
                <th>团队人数</th>
                <th>正式成员</th>
                <th>外援</th>
                <th>账号</th>
                <th>项目</th>
                <th>赛事</th>
                <th>状态</th>
                <th>动作</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const raceCount = Number(org.activeRaceCount ?? org.raceCount ?? 0)
                const accountCount = Number(org.loginAccountCount ?? 0)

                return (
                  <tr key={org.id}>
                    <td>
                      <div className="org-list-page__primary-cell">{org.name}</div>
                      <div className="org-list-page__secondary-cell">{org.slug}</div>
                    </td>
                    <td>{formatNumber(org.teamMemberCount)}</td>
                    <td>{formatNumber(org.employeeCount)}</td>
                    <td>{formatNumber(org.externalSupportCount)}</td>
                    <td>{formatNumber(accountCount)}</td>
                    <td>{formatNumber(org.projectCount)}</td>
                    <td>{formatNumber(raceCount)}</td>
                    <td>
                      <AdminStatusPill tone={raceCount > 0 ? 'success' : 'warning'}>
                        {raceCount > 0 ? '已承接赛事' : '待接赛事'}
                      </AdminStatusPill>
                    </td>
                    <td>
                      <div className="org-list-page__action-row">
                        <Link className="btn btn--ghost btn--sm" to={`/admin/orgs/${org.id}`}>详情</Link>
                        <Link className="btn btn--ghost btn--sm" to={`/admin/team?orgId=${org.id}`}>团队</Link>
                        <button className="btn btn--ghost btn--sm org-list-page__danger-action" onClick={() => handleDeleteOrg(org)}>删除</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </AdminDataTable>
        )}
      </AdminSurface>
    </div>
  )
}
