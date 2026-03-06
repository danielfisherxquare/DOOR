import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import adminApi from '../../api/adminApi'

function OrgCreatePage() {
    const navigate = useNavigate()
    const [name, setName] = useState('')
    const [adminUsername, setAdminUsername] = useState('')
    const [adminEmail, setAdminEmail] = useState('')
    const [adminPassword, setAdminPassword] = useState('Abc123456')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [step, setStep] = useState(1) // 1: 创建机构, 2: 创建管理员
    const [orgId, setOrgId] = useState(null)

    const handleCreateOrg = async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        setLoading(true); setError('')
        try {
            const res = await adminApi.createOrg({ name: name.trim() })
            if (res.success) {
                setOrgId(res.data.id)
                setStep(2)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateAdmin = async (e) => {
        e.preventDefault()
        if (!adminUsername.trim() || !adminEmail.trim()) return
        setLoading(true); setError('')
        try {
            const res = await adminApi.createOrgAdmin(orgId, {
                username: adminUsername.trim(),
                email: adminEmail.trim(),
                password: adminPassword,
            })
            if (res.success) {
                navigate('/admin/orgs')
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const cardStyle = {
        background: 'var(--color-bg-card, #fff)', borderRadius: 12, padding: 32,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', maxWidth: 520,
    }
    const inputGroupStyle = { display: 'grid', gap: 8, marginBottom: 16 }
    const labelStyle = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary, #555)' }

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>+ 新建机构</h1>

            {error && (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', fontSize: 14, marginBottom: 16, maxWidth: 520 }}>
                    {error}
                </div>
            )}

            {step === 1 && (
                <form onSubmit={handleCreateOrg} style={cardStyle}>
                    <h3 style={{ marginBottom: 20 }}>步骤 1：机构信息</h3>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>机构名称 *</label>
                        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="例如：XX马拉松组委会" disabled={loading} />
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button type="submit" className="btn btn--primary" disabled={loading || !name.trim()}>
                            {loading ? '创建中...' : '创建机构'}
                        </button>
                        <button type="button" className="btn btn--ghost" onClick={() => navigate('/admin/orgs')}>取消</button>
                    </div>
                </form>
            )}

            {step === 2 && (
                <form onSubmit={handleCreateAdmin} style={cardStyle}>
                    <h3 style={{ marginBottom: 20 }}>步骤 2：创建机构管理员</h3>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>管理员用户名 *</label>
                        <input className="input" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} placeholder="admin_username" disabled={loading} />
                    </div>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>管理员邮箱 *</label>
                        <input className="input" type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@example.com" disabled={loading} />
                    </div>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>初始密码</label>
                        <input className="input" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} disabled={loading} />
                        <span style={{ fontSize: 12, color: 'var(--color-warning)', fontWeight: 600 }}>管理员首次登录将被要求修改密码</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button type="submit" className="btn btn--primary" disabled={loading || !adminUsername.trim() || !adminEmail.trim()}>
                            {loading ? '创建中...' : '创建管理员'}
                        </button>
                        <button type="button" className="btn btn--ghost" onClick={() => navigate('/admin/orgs')}>跳过</button>
                    </div>
                </form>
            )}
        </div>
    )
}

export default OrgCreatePage
