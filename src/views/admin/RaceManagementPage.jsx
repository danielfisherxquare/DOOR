import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import racesApi from '../../api/races'
import adminApi from '../../api/adminApi'

const createEmptyEvent = () => ({
    name: '',
    targetCount: 0,
})

const normalizeEventsForForm = (events) => {
    if (!Array.isArray(events) || events.length === 0) {
        return [createEmptyEvent()]
    }

    return events.map((event) => ({
        name: typeof event?.name === 'string' ? event.name : '',
        targetCount: Number.isFinite(Number(event?.targetCount)) ? Math.max(0, Math.floor(Number(event.targetCount))) : 0,
    }))
}

const normalizeEventsForSubmit = (events) => {
    if (!Array.isArray(events)) return []

    return events
        .map((event) => ({
            name: typeof event?.name === 'string' ? event.name.trim() : '',
            targetCount: Number.isFinite(Number(event?.targetCount)) ? Math.max(0, Math.floor(Number(event.targetCount))) : 0,
        }))
        .filter((event) => event.name)
}

const buildEmptyForm = (orgId = '') => ({
    name: '',
    date: '',
    location: '',
    conflictRule: 'strict',
    orgId,
    events: [createEmptyEvent()],
})

function RaceManagementPage() {
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'super_admin'
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId') || ''

    const [orgs, setOrgs] = useState([])
    const [races, setRaces] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    const [editingRace, setEditingRace] = useState(null)
    const [form, setForm] = useState(buildEmptyForm(selectedOrgId))

    useEffect(() => {
        if (!isSuperAdmin) return
        adminApi.getOrgs({ limit: 500 })
            .then((res) => {
                if (res.success) setOrgs(res.data.items || [])
            })
            .catch(() => { })
    }, [isSuperAdmin])

    useEffect(() => {
        if (!isSuperAdmin || editingRace) return
        setForm((prev) => ({ ...prev, orgId: selectedOrgId || prev.orgId }))
    }, [isSuperAdmin, selectedOrgId, editingRace])

    const orgNameById = useMemo(
        () => new Map((orgs || []).map((org) => [String(org.id), org.name])),
        [orgs],
    )

    const sanitizedEvents = useMemo(() => normalizeEventsForSubmit(form.events), [form.events])

    const canSubmit = useMemo(() => {
        if (!form.name.trim()) return false
        if (sanitizedEvents.length === 0) return false

        if (!isSuperAdmin) return true
        const targetOrgId = editingRace?.orgId || form.orgId || selectedOrgId
        return !!targetOrgId
    }, [form.name, form.orgId, isSuperAdmin, editingRace, selectedOrgId, sanitizedEvents.length])

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
        void loadRaces()
    }, [isSuperAdmin, selectedOrgId])

    const resetForm = () => {
        setEditingRace(null)
        setForm(buildEmptyForm(selectedOrgId))
    }

    const updateEvent = (index, key, value) => {
        setForm((prev) => {
            const nextEvents = [...(prev.events || [])]
            const current = nextEvents[index] || createEmptyEvent()
            nextEvents[index] = {
                ...current,
                [key]: key === 'targetCount'
                    ? (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0)
                    : value,
            }
            return { ...prev, events: nextEvents }
        })
    }

    const addEventRow = () => {
        setForm((prev) => ({
            ...prev,
            events: [...(prev.events || []), createEmptyEvent()],
        }))
    }

    const removeEventRow = (index) => {
        setForm((prev) => {
            const nextEvents = (prev.events || []).filter((_, idx) => idx !== index)
            return {
                ...prev,
                events: nextEvents.length > 0 ? nextEvents : [createEmptyEvent()],
            }
        })
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        if (!canSubmit) return

        setSaving(true)
        setMessage('')

        const payload = {
            name: form.name.trim(),
            date: form.date || '',
            location: form.location || '',
            conflictRule: form.conflictRule,
            events: sanitizedEvents,
        }

        if (isSuperAdmin) {
            const targetOrgId = editingRace?.orgId || form.orgId || selectedOrgId
            payload.orgId = targetOrgId
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
            orgId: race.orgId || selectedOrgId || '',
            events: normalizeEventsForForm(race.events),
        })
        setMessage('')
    }

    const handleDelete = async (race) => {
        if (!window.confirm(`确定删除赛事「${race.name}」吗？该操作不可恢复。`)) return

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

    const eventCount = (race) => (Array.isArray(race.events) ? race.events.length : 0)
    const eventTargetTotal = (race) => (Array.isArray(race.events)
        ? race.events.reduce((sum, item) => sum + (Number(item?.targetCount) || 0), 0)
        : 0)

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
                    未选择机构：当前显示全平台赛事。创建赛事时请在表单中选择目标机构。
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

            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 16 }}>
                <div style={{ background: 'var(--color-bg-card, #fff)', borderRadius: 12, boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color, #e5e7eb)', fontWeight: 600 }}>
                        {editingRace ? '编辑赛事' : '创建赛事'}
                    </div>

                    <form onSubmit={handleSubmit} style={{ padding: 16, display: 'grid', gap: 12 }}>
                        {isSuperAdmin && (
                            <div>
                                <label style={labelStyle}>所属机构 *</label>
                                <select
                                    className="input"
                                    value={form.orgId}
                                    onChange={(event) => setForm((prev) => ({ ...prev, orgId: event.target.value }))}
                                    disabled={!!editingRace}
                                >
                                    <option value="">请选择机构</option>
                                    {orgs.map((org) => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                                {editingRace && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted, #888)' }}>编辑时不支持跨机构迁移</div>}
                            </div>
                        )}

                        <div>
                            <label style={labelStyle}>赛事名称 *</label>
                            <input
                                className="input"
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                placeholder="例如：2026 春季马拉松"
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>赛事日期</label>
                            <input
                                className="input"
                                type="date"
                                value={form.date}
                                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>地点</label>
                            <input
                                className="input"
                                value={form.location}
                                onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                                placeholder="例如：北京"
                            />
                        </div>

                        <div>
                            <label style={labelStyle}>比赛项目与目标人数 *</label>
                            <div style={{ display: 'grid', gap: 8 }}>
                                {(form.events || []).map((eventItem, index) => (
                                    <div key={`event-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: 8 }}>
                                        <input
                                            className="input"
                                            value={eventItem.name}
                                            onChange={(event) => updateEvent(index, 'name', event.target.value)}
                                            placeholder="项目名称，例如：马拉松"
                                        />
                                        <input
                                            className="input"
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={eventItem.targetCount}
                                            onChange={(event) => updateEvent(index, 'targetCount', event.target.value)}
                                            placeholder="目标人数"
                                        />
                                        <button
                                            type="button"
                                            className="btn btn--ghost btn--sm"
                                            onClick={() => removeEventRow(index)}
                                            disabled={(form.events || []).length <= 1}
                                        >
                                            删除
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button type="button" className="btn btn--ghost btn--sm" onClick={addEventRow}>+ 添加项目</button>
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted, #666)' }}>
                                    当前目标总人数：{sanitizedEvents.reduce((sum, item) => sum + item.targetCount, 0).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>冲突规则</label>
                            <select
                                className="input"
                                value={form.conflictRule}
                                onChange={(event) => setForm((prev) => ({ ...prev, conflictRule: event.target.value }))}
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

                <div style={{ background: 'var(--color-bg-card, #fff)', borderRadius: 12, boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color, #e5e7eb)', fontWeight: 600 }}>
                        赛事列表
                    </div>

                    {loading ? (
                        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-secondary)' }}>加载中...</div>
                    ) : races.length === 0 ? (
                        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-secondary)' }}>暂无赛事</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-bg-secondary, #fafafa)', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                                    <th style={thStyle}>名称</th>
                                    {isSuperAdmin && <th style={thStyle}>机构</th>}
                                    <th style={thStyle}>日期</th>
                                    <th style={thStyle}>地点</th>
                                    <th style={thStyle}>项目数</th>
                                    <th style={thStyle}>目标人数</th>
                                    <th style={thStyle}>规则</th>
                                    <th style={thStyle}>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {races.map((race) => (
                                    <tr key={race.id} style={{ borderBottom: '1px solid var(--border-color, #f2f2f2)' }}>
                                        <td style={tdStyle}>{race.name}</td>
                                        {isSuperAdmin && <td style={tdStyle}>{orgNameById.get(String(race.orgId)) || race.orgId || '-'}</td>}
                                        <td style={tdStyle}>{race.date || '-'}</td>
                                        <td style={tdStyle}>{race.location || '-'}</td>
                                        <td style={tdStyle}>{eventCount(race)}</td>
                                        <td style={tdStyle}>{eventTargetTotal(race).toLocaleString()}</td>
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

const labelStyle = { display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--color-text-secondary, #555)', fontWeight: 600 }
const thStyle = { textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary, #666)', padding: '12px 14px' }
const tdStyle = { fontSize: 14, padding: '12px 14px' }

export default RaceManagementPage
