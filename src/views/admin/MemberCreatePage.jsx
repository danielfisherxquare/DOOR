import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import adminApi from '../../api/adminApi'

function MemberCreatePage() {
    const navigate = useNavigate()
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('Abc123456')
    const [role, setRole] = useState('race_editor')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!username.trim() || !email.trim()) return
        setLoading(true); setError('')
        try {
            const res = await adminApi.createOrgUser({ username: username.trim(), email: email.trim(), password, role })
            if (res.success) {
                navigate('/admin/members')
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
                <div style={inputGroupStyle}>
                    <label style={labelStyle}>用户名 *</label>
                    <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="member_username" disabled={loading} />
                </div>
                <div style={inputGroupStyle}>
                    <label style={labelStyle}>邮箱 *</label>
                    <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="member@example.com" disabled={loading} />
                </div>
                <div style={inputGroupStyle}>
                    <label style={labelStyle}>初始密码</label>
                    <input className="input" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
                    <span style={{ fontSize: 12, color: '#999' }}>成员首次登录将被要求修改密码</span>
                </div>
                <div style={inputGroupStyle}>
                    <label style={labelStyle}>角色</label>
                    <select className="input" value={role} onChange={e => setRole(e.target.value)} disabled={loading}>
                        <option value="race_editor">赛事编辑 — 可读写被分配的赛事</option>
                        <option value="race_viewer">赛事只读 — 只可查看被分配的赛事</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button type="submit" className="btn btn--primary" disabled={loading || !username.trim() || !email.trim()}>
                        {loading ? '创建中...' : '创建成员'}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => navigate('/admin/members')}>取消</button>
                </div>
            </form>
        </div>
    )
}

export default MemberCreatePage
