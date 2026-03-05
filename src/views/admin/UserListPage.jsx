import { useEffect, useState } from 'react'
import adminApi from '../../api/adminApi'

function UserListPage() {
    const [users, setUsers] = useState([])
    const [orgs, setOrgs] = useState([])
    const [loading, setLoading] = useState(true)
    const [keyword, setKeyword] = useState('')
    const [roleFilter, setRoleFilter] = useState('')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const limit = 20

    const fetchUsers = () => {
        setLoading(true)
        adminApi.getAllUsers({ page, limit, keyword, role: roleFilter })
            .then(res => {
                if (res.success) {
                    setUsers(res.data.items)
                    setTotal(res.data.total)
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        fetchUsers()
    }, [page, roleFilter])

    useEffect(() => {
        adminApi.getOrgs({ limit: 200 })
            .then((res) => {
                if (res.success) setOrgs(res.data.items || [])
            })
            .catch(() => { })
    }, [])

    const handleSearch = (e) => {
        e.preventDefault()
        if (page !== 1) setPage(1)
        else fetchUsers()
    }

    const handleToggleStatus = async (user) => {
        const newStatus = user.status === 'active' ? 'disabled' : 'active'
        try {
            await adminApi.updateUser(user.id, { status: newStatus })
            fetchUsers()
        } catch (err) {
            alert(err.message)
        }
    }

    const handleResetPassword = async (user) => {
        if (!confirm(`确定重置 ${user.username} 的密码？`)) return
        try {
            const res = await adminApi.resetUserPassword(user.id)
            if (res.success) alert(res.data.message)
        } catch (err) {
            alert(err.message)
        }
    }

    const handleOrgChange = async (user, newOrgId) => {
        if (user.role === 'super_admin') return
        if (!newOrgId) return

        try {
            await adminApi.updateUser(user.id, { orgId: newOrgId })
            fetchUsers()
        } catch (err) {
            alert(err.message)
        }
    }

    const roleLabels = { super_admin: '超管', org_admin: '机构管理', race_editor: '编辑', race_viewer: '只读' }
    const totalPages = Math.ceil(total / limit)

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>👤 用户管理</h1>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
                    <input className="input" placeholder="搜索用户名/邮箱..." value={keyword} onChange={e => setKeyword(e.target.value)} style={{ maxWidth: 240 }} />
                    <button type="submit" className="btn btn--secondary">搜索</button>
                </form>
                <select className="input" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }} style={{ maxWidth: 160 }}>
                    <option value="">全部角色</option>
                    <option value="super_admin">超级管理员</option>
                    <option value="org_admin">机构管理员</option>
                    <option value="race_editor">赛事编辑</option>
                    <option value="race_viewer">赛事只读</option>
                </select>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
            ) : (
                <>
                    <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
                                    <th style={thStyle}>用户名</th>
                                    <th style={thStyle}>邮箱</th>
                                    <th style={thStyle}>角色</th>
                                    <th style={thStyle}>机构</th>
                                    <th style={thStyle}>状态</th>
                                    <th style={thStyle}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={tdStyle}><span style={{ fontWeight: 600 }}>{u.username}</span></td>
                                        <td style={tdStyle}>{u.email}</td>
                                        <td style={tdStyle}>
                                            <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 12, background: u.role === 'super_admin' ? '#fef3c7' : '#e0e7ff', color: u.role === 'super_admin' ? '#92400e' : '#3730a3' }}>
                                                {roleLabels[u.role] || u.role}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            {u.role === 'super_admin' ? (
                                                <span style={{ color: '#999' }}>平台级</span>
                                            ) : (
                                                <select
                                                    value={u.org_id || ''}
                                                    onChange={(e) => handleOrgChange(u, e.target.value)}
                                                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 150 }}
                                                >
                                                    <option value="" disabled>请选择机构</option>
                                                    {orgs.map((org) => (
                                                        <option key={org.id} value={org.id}>{org.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ color: u.status === 'active' ? '#16a34a' : '#ef4444', fontWeight: 600, fontSize: 13 }}>
                                                {u.status === 'active' ? '✅ 正常' : '🚫 禁用'}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn--ghost btn--sm" onClick={() => handleToggleStatus(u)} title={u.status === 'active' ? '禁用' : '启用'}>
                                                    {u.status === 'active' ? '禁用' : '启用'}
                                                </button>
                                                <button className="btn btn--ghost btn--sm" onClick={() => handleResetPassword(u)}>重置密码</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>暂无用户</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                            <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                            <span style={{ padding: '6px 12px', fontSize: 14 }}>{page} / {totalPages}</span>
                            <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#666' }
const tdStyle = { padding: '12px 16px', fontSize: 14 }

export default UserListPage
