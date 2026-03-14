import { useEffect, useState } from 'react'
import adminApi from '../../api/adminApi'

const ROLE_LABELS = {
  super_admin: '超级管理员',
  org_admin: '机构管理员',
  race_editor: '赛事编辑',
  race_viewer: '只读',
}

const ACCOUNT_SOURCE_LABELS = {
  manual: '手工创建',
  team_member_auto: '团队自动创建',
  team_member_manual_enable: '外援手动启用',
}

function UserListPage() {
  const [users, setUsers] = useState([])
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [accountSourceFilter, setAccountSourceFilter] = useState('')
  const [memberTypeFilter, setMemberTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [mustChangeFilter, setMustChangeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getAllUsers({
        page,
        limit,
        keyword,
        role: roleFilter,
        orgId: orgFilter,
        accountSource: accountSourceFilter,
        memberType: memberTypeFilter,
        status: statusFilter,
        mustChangePassword: mustChangeFilter,
      })
      if (res.success) {
        setUsers(res.data.items || [])
        setTotal(Number(res.data.total || 0))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchUsers()
  }, [page, roleFilter, orgFilter, accountSourceFilter, memberTypeFilter, statusFilter, mustChangeFilter])

  useEffect(() => {
    adminApi.getOrgs({ limit: 200 })
      .then((res) => {
        if (res.success) setOrgs(res.data.items || [])
      })
      .catch(() => {})
  }, [])

  const handleSearch = (event) => {
    event.preventDefault()
    if (page !== 1) setPage(1)
    else void fetchUsers()
  }

  const handleToggleStatus = async (user) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    try {
      await adminApi.updateUser(user.id, { status: nextStatus })
      await fetchUsers()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleResetPassword = async (user) => {
    if (!window.confirm(`确认重置 ${user.username} 的密码吗？`)) return
    try {
      const res = await adminApi.resetUserPassword(user.id)
      if (res.success) alert(res.data.message)
    } catch (error) {
      alert(error.message)
    }
  }

  const handleOrgChange = async (user, newOrgId) => {
    if (user.role === 'super_admin' || !newOrgId) return
    try {
      await adminApi.updateUser(user.id, { orgId: newOrgId })
      await fetchUsers()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`确认删除用户 ${user.username} 吗？此操作不可恢复。`)) return
    try {
      await adminApi.deleteUser(user.id)
      await fetchUsers()
    } catch (error) {
      alert(error.message)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>用户管理</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="搜索用户名、邮箱、工号" value={keyword} onChange={(event) => setKeyword(event.target.value)} style={{ maxWidth: 280 }} />
          <button type="submit" className="btn btn--secondary">搜索</button>
        </form>
        <select className="input" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }} style={{ maxWidth: 180 }}>
          <option value="">全部角色</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select className="input" value={orgFilter} onChange={(event) => { setOrgFilter(event.target.value); setPage(1) }} style={{ maxWidth: 200 }}>
          <option value="">全部机构</option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
        <select className="input" value={accountSourceFilter} onChange={(event) => { setAccountSourceFilter(event.target.value); setPage(1) }} style={{ maxWidth: 180 }}>
          <option value="">全部来源</option>
          {Object.entries(ACCOUNT_SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select className="input" value={memberTypeFilter} onChange={(event) => { setMemberTypeFilter(event.target.value); setPage(1) }} style={{ maxWidth: 160 }}>
          <option value="">全部成员类型</option>
          <option value="employee">正式成员</option>
          <option value="external_support">外援</option>
        </select>
        <select className="input" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }} style={{ maxWidth: 140 }}>
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="disabled">禁用</option>
        </select>
        <select className="input" value={mustChangeFilter} onChange={(event) => { setMustChangeFilter(event.target.value); setPage(1) }} style={{ maxWidth: 160 }}>
          <option value="">全部改密状态</option>
          <option value="true">待改密</option>
          <option value="false">无需改密</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>
      ) : (
        <>
          <div style={{ background: 'var(--color-bg-card, #fff)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', background: 'var(--color-bg-secondary, #fafafa)' }}>
                  <th style={thStyle}>用户名</th>
                  <th style={thStyle}>绑定成员</th>
                  <th style={thStyle}>机构</th>
                  <th style={thStyle}>角色</th>
                  <th style={thStyle}>来源</th>
                  <th style={thStyle}>状态</th>
                  <th style={thStyle}>待改密</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{user.username}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{user.email}</div>
                    </td>
                    <td style={tdStyle}>
                      {user.team_member_name ? (
                        <>
                          <div>{user.team_member_name}</div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{user.employee_code || '-'} / {user.member_type || '-'}</div>
                        </>
                      ) : '未绑定'}
                    </td>
                    <td style={tdStyle}>
                      {user.role === 'super_admin' ? (
                        <span style={{ color: '#6b7280' }}>平台级</span>
                      ) : (
                        <select value={user.org_id || ''} onChange={(event) => handleOrgChange(user, event.target.value)} style={selectStyle}>
                          <option value="" disabled>请选择机构</option>
                          {orgs.map((org) => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={tdStyle}>{ROLE_LABELS[user.role] || user.role}</td>
                    <td style={tdStyle}>{ACCOUNT_SOURCE_LABELS[user.account_source] || user.account_source || '-'}</td>
                    <td style={tdStyle}>{user.status}</td>
                    <td style={tdStyle}>{user.must_change_password ? '是' : '否'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleToggleStatus(user)}>{user.status === 'active' ? '禁用' : '启用'}</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleResetPassword(user)}>重置密码</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleDeleteUser(user)} style={{ color: 'var(--color-danger)' }}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary)' }}>暂无用户</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>上一页</button>
              <span style={{ padding: '6px 12px', fontSize: 14 }}>{page} / {totalPages}</span>
              <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>下一页</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary, #666)' }
const tdStyle = { padding: '12px 16px', fontSize: 14 }
const selectStyle = { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color, #d1d5db)', fontSize: 13, minWidth: 150 }

export default UserListPage
