import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import racesApi from '../../api/races'

const EMPTY_FORM = {
    name: '',
    date: '',
    location: '',
    conflictRule: 'strict',
}

function RaceManagementPage() {
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'super_admin'
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId') || ''

    const [races, setRaces] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    const [editingRace, setEditingRace] = useState(null)
    const [form, setForm] = useState(EMPTY_FORM)

    const canSubmit = useMemo(() => {
        if (!form.name.trim()) return false
        if (isSuperAdmin && !selectedOrgId) return false
        return true
    }, [form.name, isSuperAdmin, selectedOrgId])

    const loadRaces = async () => {
        setLoading(true)
        setMessage('')
        try {
            const params = isSuperAdmin && selectedOrgId ? { orgId: selectedOrgId } : undefined
            const res = await racesApi.getAll(params)
            if (res.success) {
                setRaces(res.data || [])
            }
        } catch (err) {
            setMessage(`加载赛事失败: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (isSuperAdmin && !selectedOrgId) {
            setRaces([])
            setLoading(false)
            return
        }
        void loadRaces()
    }, [isSuperAdmin, selectedOrgId])

    const resetForm = () => {
        setEditingRace(null)
        setForm(EMPTY_FORM)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!canSubmit) return

        setSaving(true)
        setMessage('')

        const payload = {
            name: form.name.trim(),
            date: form.date || '',
            location: form.location || '',
            conflictRule: form.conflictRule,
        }

        if (isSuperAdmin) {
            payload.orgId = selectedOrgId
        }

        try {
            if (editingRace?.id) {
                const res = await racesApi.update(editingRace.id, payload)
                if (res.success) {
                    setMessage('赛事更新成功')
                }
            } else {
                const res = await racesApi.create(payload)
                if (res.success) {
                    setMessage('赛事创建成功')
                }
            }

            resetForm()
            await loadRaces()
        } catch (err) {
            setMessage(`保存失败: ${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    const handleEdit = (race) => {
        setEditingRace(race)
        setForm({
            name: race.name || '',
            date: race.date || '',
            location: race.location || '',
            conflictRule: race.conflictRule || 'strict',
        })
        setMessage('')
    }

    const handleDelete = async (race) => {
        if (!confirm(`确定删除赛事「${race.name}」吗？该操作不可恢复。`)) return

        setMessage('')
        try {
            const res = await racesApi.remove(race.id)
            if (res.success) {
                setMessage('赛事删除成功')
                if (editingRace?.id === race.id) {
                    resetForm()
                }
                await loadRaces()
            }
        } catch (err) {
            setMessage(`删除失败: ${err.message}`)
        }
    }

    const eventCount = (race) => Array.isArray(race.events) ? race.events.length : 0

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>赛事管理</h1>
                <button className="btn btn--secondary" onClick={loadRaces} disabled={loading || saving}>刷新</button>
            </div>

            {isSuperAdmin && !selectedOrgId && (
                <div style={{
                    padding: '12px 16px', marginBottom: 16, borderRadius: 10,
                    background: 'rgba(245,158,11,0.1)', color: '#b45309', fontSize: 14,
                }}>
                    请先在左侧选择机构，再进行赛事管理。
                </div>
            )}

            {message && (
                <div style={{
                    padding: '12px 16px',
                    marginBottom: 16,
                    borderRadius: 10,
                    fontSize: 14,
                    background: message.includes('失败') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    color: message.includes('失败') ? '#dc2626' : '#15803d',
                }}>
                    {message}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}>
                <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
                        {editingRace ? '编辑赛事' : '创建赛事'}
                    </div>

                    <form onSubmit={handleSubmit} style={{ padding: 16, display: 'grid', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>赛事名称 *</label>
                            <input
                                className="input"
                                value={form.name}
                                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="例如：2026 春季马拉松"
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>赛事日期</label>
                            <input
                                className="input"
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>地点</label>
                            <input
                                className="input"
                                value={form.location}
                                onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                                placeholder="例如：北京"
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>冲突规则</label>
                            <select
                                className="input"
                                value={form.conflictRule}
                                onChange={(e) => setForm(prev => ({ ...prev, conflictRule: e.target.value }))}
                            >
                                <option value="strict">严格 (strict)</option>
                                <option value="permissive">宽松 (permissive)</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button type="submit" className="btn btn--primary" disabled={!canSubmit || saving}>
                                {saving ? '保存中...' : (editingRace ? '保存修改' : '创建赛事')}
                            </button>
                            {editingRace && (
                                <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={saving}>
                                    取消编辑
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
                        赛事列表
                    </div>

                    {loading ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#999' }}>加载中...</div>
                    ) : races.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: '#999' }}>暂无赛事</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={thStyle}>名称</th>
                                    <th style={thStyle}>日期</th>
                                    <th style={thStyle}>地点</th>
                                    <th style={thStyle}>项目数</th>
                                    <th style={thStyle}>规则</th>
                                    <th style={thStyle}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {races.map((race) => (
                                    <tr key={race.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                                        <td style={tdStyle}>{race.name}</td>
                                        <td style={tdStyle}>{race.date || '-'}</td>
                                        <td style={tdStyle}>{race.location || '-'}</td>
                                        <td style={tdStyle}>{eventCount(race)}</td>
                                        <td style={tdStyle}>{race.conflictRule || 'strict'}</td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className="btn btn--ghost btn--sm" onClick={() => handleEdit(race)}>编辑</button>
                                                <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(race)} style={{ color: '#dc2626' }}>删除</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}

const labelStyle = { display: 'block', fontSize: 13, marginBottom: 6, color: '#555', fontWeight: 600 }
const thStyle = { textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#666', padding: '12px 14px' }
const tdStyle = { fontSize: 14, padding: '12px 14px' }

export default RaceManagementPage
