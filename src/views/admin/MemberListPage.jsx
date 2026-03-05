import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

function MemberListPage() {
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'super_admin'

    const [members, setMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const [keyword, setKeyword] = useState('')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)

    const limit = 20
    const [searchParams] = useSearchParams()
    const orgId = searchParams.get('orgId') || undefined
    const isGlobalSuperAdmin = isSuperAdmin && !orgId

    const fetchMembers = () => {
        setLoading(true)

        const loader = isGlobalSuperAdmin
            ? adminApi.getAllUsers({ page, limit, keyword })
            : adminApi.getOrgUsers({ page, limit, keyword, orgId })

        loader
            .then((res) => {
                if (res.success) {
                    setMembers(res.data.items)
                    setTotal(res.data.total)
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        setPage(1)
    }, [orgId])

    useEffect(() => {
        fetchMembers()
    }, [page, orgId, isSuperAdmin])

    const handleSearch = (e) => {
        e.preventDefault()
        if (page !== 1) setPage(1)
        else fetchMembers()
    }

    const handleToggleStatus = async (member) => {
        const newStatus = member.status === 'active' ? 'disabled' : 'active'
        try {
            if (isGlobalSuperAdmin) {
                await adminApi.updateUser(member.id, { status: newStatus })
            } else {
                await adminApi.updateOrgUser(member.id, { status: newStatus }, orgId)
            }
            fetchMembers()
        } catch (err) {
            alert(err.message)
        }
    }

    const handleResetPassword = async (member) => {
        if (!confirm(`确定重置 ${member.username} 的密码？`)) return

        try {
            const res = isGlobalSuperAdmin
                ? await adminApi.resetUserPassword(member.id)
                : await adminApi.resetOrgUserPassword(member.id, orgId)

            if (res.success) alert(res.data.message)
        } catch (err) {
            alert(err.message)
        }
    }

    const handleRoleChange = async (member, newRole) => {
        try {
            if (isGlobalSuperAdmin) {
                await adminApi.updateUser(member.id, { role: newRole })
            } else {
                await adminApi.updateOrgUser(member.id, { role: newRole }, orgId)
            }
            fetchMembers()
        } catch (err) {
            alert(err.message)
        }
    }

    const handleDeleteMember = async (member) => {
        if (!confirm(`确定删除成员 ${member.username} 吗？此操作不可恢复。`)) return

        try {
            if (isGlobalSuperAdmin) {
                await adminApi.deleteUser(member.id)
            } else {
                await adminApi.deleteOrgUser(member.id, orgId)
            }
            fetchMembers()
        } catch (err) {
            alert(err.message)
        }
    }

    const totalPages = Math.ceil(total / limit)

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700 }}>成员管理</h1>
                <Link to={`/admin/members/new${orgId ? `?orgId=${orgId}` : ''}`} className="btn btn--primary">+ 新建成员</Link>
            </div>

            {isGlobalSuperAdmin && (
                <div style={{ padding: '12px 16px', marginBottom: 16, borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: '#b45309', fontSize: 14 }}>
                    未选择机构：当前显示全平台用户，可直接进行用户管理与赛事权限分配。
                </div>
            )}

            <form onSubmit={handleSearch} style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                <input
                    className="input"
                    placeholder="搜索用户名或邮箱..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    style={{ maxWidth: 300 }}
                />
                <button type="submit" className="btn btn--secondary">搜索</button>
            </form>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>
            ) : (
                <>
                    <div style={{ background: 'var(--color-bg-card, #fff)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', background: 'var(--color-bg-secondary, #fafafa)' }}>
                                    <th style={thStyle}>用户名</th>
                                    <th style={thStyle}>邮箱</th>
                                    <th style={thStyle}>角色</th>
                                    {isGlobalSuperAdmin && <th style={thStyle}>机构</th>}
                                    <th style={thStyle}>状态</th>
                                    <th style={thStyle}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map((m) => (
                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
                                        <td style={tdStyle}><span style={{ fontWeight: 600 }}>{m.username}</span></td>
                                        <td style={tdStyle}>{m.email}</td>
                                        <td style={tdStyle}>
                                            <select
                                                value={m.role}
                                                onChange={(e) => handleRoleChange(m, e.target.value)}
                                                disabled={isGlobalSuperAdmin && m.role === 'super_admin'}
                                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color, #d1d5db)', fontSize: 13 }}
                                            >
                                                {isGlobalSuperAdmin ? (
                                                    m.role === 'super_admin'
                                                        ? <option value="super_admin">super_admin</option>
                                                        : (
                                                            <>
                                                                <option value="org_admin">org_admin</option>
                                                                <option value="race_editor">race_editor</option>
                                                                <option value="race_viewer">race_viewer</option>
                                                                <option value="super_admin">super_admin</option>
                                                            </>
                                                        )
                                                ) : (
                                                    <>
                                                        <option value="race_editor">赛事编辑</option>
                                                        <option value="race_viewer">赛事只读</option>
                                                    </>
                                                )}
                                            </select>
                                        </td>
                                        {isGlobalSuperAdmin && <td style={tdStyle}>{m.org_name || m.org_id || '-'}</td>}
                                        <td style={tdStyle}>
                                            <span style={{ color: m.status === 'active' ? '#16a34a' : '#ef4444', fontWeight: 600, fontSize: 13 }}>
                                                {m.status === 'active' ? '正常' : '禁用'}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn--ghost btn--sm" onClick={() => handleToggleStatus(m)}>
                                                    {m.status === 'active' ? '禁用' : '启用'}
                                                </button>
                                                <button className="btn btn--ghost btn--sm" onClick={() => handleResetPassword(m)}>重置密码</button>
                                                {m.role !== 'super_admin' && (
                                                    <Link
                                                        to={`/admin/race-permissions?userId=${m.id}&username=${m.username}${orgId ? `&orgId=${orgId}` : ''}`}
                                                        className="btn btn--ghost btn--sm"
                                                    >
                                                        赛事授权
                                                    </Link>
                                                )}
                                                <button className="btn btn--ghost btn--sm" onClick={() => handleDeleteMember(m)} style={{ color: '#dc2626' }}>
                                                    删除
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {members.length === 0 && (
                                    <tr>
                                        <td colSpan={isGlobalSuperAdmin ? 6 : 5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary)' }}>暂无成员</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                            <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
                            <span style={{ padding: '6px 12px', fontSize: 14 }}>{page} / {totalPages}</span>
                            <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary, #666)' }
const tdStyle = { padding: '12px 16px', fontSize: 14 }

export default MemberListPage
