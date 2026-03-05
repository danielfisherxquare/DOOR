import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

function MemberCreatePage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const orgId = searchParams.get('orgId') || undefined

    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'super_admin'

    const [orgs, setOrgs] = useState([])
    const [selectedOrgId, setSelectedOrgId] = useState(orgId || '')

    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('Abc123456')
    const [role, setRole] = useState('race_editor')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!(isSuperAdmin && !orgId)) return

        adminApi.getOrgs({ limit: 500 })
            .then((res) => {
                if (res.success) {
                    const items = res.data.items || []
                    setOrgs(items)
                    if (!selectedOrgId && items[0]?.id) {
                        setSelectedOrgId(items[0].id)
                    }
                }
            })
            .catch(() => { })
    }, [isSuperAdmin, orgId])

    const targetOrgId = useMemo(() => {
        if (!isSuperAdmin) return orgId
        return orgId || selectedOrgId || undefined
    }, [isSuperAdmin, orgId, selectedOrgId])

    const canSubmit = !!username.trim() && !!email.trim() && (!!targetOrgId || !isSuperAdmin)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!canSubmit) return

        setLoading(true)
        setError('')

        try {
            const res = await adminApi.createOrgUser(
                { username: username.trim(), email: email.trim(), password, role },
                targetOrgId,
            )

            if (res.success) {
                navigate(`/admin/members${targetOrgId ? `?orgId=${targetOrgId}` : ''}`)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const cardStyle = {
        background: 'white', borderRadius: 12, padding: 32,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', maxWidth: 520,
    }
    const inputGroupStyle = { display: 'grid', gap: 8, marginBottom: 16 }
    const labelStyle = { fontSize: 13, fontWeight: 600, color: '#555' }

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>+ 新建成员</h1>

            {error && (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 14, marginBottom: 16, maxWidth: 520 }}>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} style={cardStyle}>
                {isSuperAdmin && !orgId && (
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>所属机构 *</label>
                        <select
                            className="input"
                            value={selectedOrgId}
                            onChange={(e) => setSelectedOrgId(e.target.value)}
                            disabled={loading}
                        >
                            <option value="">请选择机构</option>
                            {orgs.map((org) => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div style={inputGroupStyle}>
                    <label style={labelStyle}>用户名 *</label>
                    <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="member_username" disabled={loading} />
                </div>
                <div style={inputGroupStyle}>
                    <label style={labelStyle}>邮箱 *</label>
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@example.com" disabled={loading} />
                </div>
                <div style={inputGroupStyle}>
                    <label style={labelStyle}>初始密码</label>
                    <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
                    <span style={{ fontSize: 12, color: '#999' }}>成员首次登录将被要求修改密码</span>
                </div>
                <div style={inputGroupStyle}>
                    <label style={labelStyle}>角色</label>
                    <select className="input" value={role} onChange={(e) => setRole(e.target.value)} disabled={loading}>
                        <option value="race_editor">赛事编辑 — 可读写被分配的赛事</option>
                        <option value="race_viewer">赛事只读 — 只可查看被分配的赛事</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button type="submit" className="btn btn--primary" disabled={loading || !canSubmit}>
                        {loading ? '创建中...' : '创建成员'}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => navigate(`/admin/members${targetOrgId ? `?orgId=${targetOrgId}` : ''}`)}>取消</button>
                </div>
            </form>
        </div>
    )
}

export default MemberCreatePage
