import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import adminApi from '../../api/adminApi'

function OrgListPage() {
    const [orgs, setOrgs] = useState([])
    const [loading, setLoading] = useState(true)
    const [keyword, setKeyword] = useState('')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const limit = 20

    const fetchOrgs = () => {
        setLoading(true)
        adminApi.getOrgs({ page, limit, keyword })
            .then(res => {
                if (res.success) {
                    setOrgs(res.data.items)
                    setTotal(res.data.total)
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false))
    }

    useEffect(() => { fetchOrgs() }, [page])

    const handleSearch = (e) => {
        e.preventDefault()
        setPage(1)
        fetchOrgs()
    }

    const totalPages = Math.ceil(total / limit)

    const handleDeleteOrg = async (org) => {
        if (!confirm(`确定删除机构 ${org.name} 吗？该机构下必须无用户和赛事。`)) return
        try {
            const res = await adminApi.deleteOrg(org.id)
            if (res.success) {
                fetchOrgs()
            }
        } catch (err) {
            alert(err.message)
        }
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700 }}>🏢 机构管理</h1>
                <Link to="/admin/orgs/new" className="btn btn--primary">+ 新建机构</Link>
            </div>

            <form onSubmit={handleSearch} style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                <input
                    className="input"
                    placeholder="搜索机构名称..."
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
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
                                    <th style={thStyle}>机构名称</th>
                                    <th style={thStyle}>用户数</th>
                                    <th style={thStyle}>赛事数</th>
                                    <th style={thStyle}>创建时间</th>
                                    <th style={thStyle}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orgs.map(org => (
                                    <tr key={org.id} style={{ borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
                                        <td style={tdStyle}>
                                            <span style={{ fontWeight: 600 }}>{org.name}</span>
                                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{org.slug}</div>
                                        </td>
                                        <td style={tdStyle}>{org.userCount ?? '-'}</td>
                                        <td style={tdStyle}>{org.raceCount ?? '-'}</td>
                                        <td style={tdStyle}>{org.created_at ? new Date(org.created_at).toLocaleDateString() : '-'}</td>
                                        <td style={tdStyle}>
                                            <button className="btn btn--ghost btn--sm" onClick={() => handleDeleteOrg(org)} style={{ color: '#dc2626' }}>
                                                删除
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {orgs.length === 0 && (
                                    <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary)' }}>暂无机构</td></tr>
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

const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary, #666)' }
const tdStyle = { padding: '12px 16px', fontSize: 14 }

export default OrgListPage
