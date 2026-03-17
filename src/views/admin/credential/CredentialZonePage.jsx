import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'

const COLOR_OPTIONS = [
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981',
    '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF',
    '#F43F5E', '#14B8A6', '#EAB308', '#EC4899',
]

const EMPTY_FORM = {
    accessCode: '',
    accessName: '',
    accessColor: '#3B82F6',
    sortOrder: 0,
    description: '',
    geometry: null,
}

function CredentialZonePage() {
    const [searchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')
    const orgId = searchParams.get('orgId') || ''

    const [accessAreas, setAccessAreas] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [editingArea, setEditingArea] = useState(null)
    const [form, setForm] = useState(EMPTY_FORM)

    const loadAccessAreas = async () => {
        if (!raceId) return
        setLoading(true)
        try {
            const res = await credentialApi.getAccessAreas(raceId)
            if (res.success) {
                setAccessAreas(res.data || [])
            }
        } catch (err) {
            setMessage(`加载通行区域失败：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadAccessAreas()
    }, [raceId])

    const resetForm = () => {
        setEditingArea(null)
        setForm(EMPTY_FORM)
    }

    const handleEdit = (area) => {
        setEditingArea(area)
        setForm({
            accessCode: area.accessCode,
            accessName: area.accessName,
            accessColor: area.accessColor || '#3B82F6',
            sortOrder: area.sortOrder || 0,
            description: area.description || '',
            geometry: area.geometry || null,
        })
    }

    const handleDelete = async (area) => {
        if (!window.confirm(`确认删除通行区域“${area.accessName}”吗？`)) return
        try {
            await credentialApi.deleteAccessArea(raceId, area.id)
            setMessage('删除成功')
            if (editingArea?.id === area.id) {
                resetForm()
            }
            await loadAccessAreas()
        } catch (err) {
            setMessage(`删除失败：${err.message}`)
        }
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        if (!/^[0-9]+$/.test(form.accessCode.trim())) {
            setMessage('通行编码必须为纯数字')
            return
        }
        if (!form.accessName.trim()) {
            setMessage('请填写通行区域名称')
            return
        }

        setSaving(true)
        setMessage('')
        const payload = {
            accessCode: form.accessCode.trim(),
            accessName: form.accessName.trim(),
            accessColor: form.accessColor,
            sortOrder: Number(form.sortOrder) || 0,
            description: form.description.trim() || undefined,
            geometry: form.geometry,
        }

        try {
            if (editingArea) {
                await credentialApi.updateAccessArea(raceId, editingArea.id, payload)
                setMessage('更新成功')
            } else {
                await credentialApi.createAccessArea(raceId, payload)
                setMessage('创建成功')
            }
            resetForm()
            await loadAccessAreas()
        } catch (err) {
            setMessage(`保存失败：${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    if (!raceId) {
        return (
            <div style={styles.container}>
                <div style={styles.empty}>
                    <p style={{ marginBottom: 16 }}>请先选择赛事</p>
                    <Link to={`/admin/credential/select-race?orgId=${orgId}`} className="btn btn--primary">
                        去选择赛事
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>通行区域管理</h1>
            <p style={styles.subtitle}>用数字编码定义证件可进入的区域，类别和申请都会引用这里的编码。</p>

            {message && (
                <div
                    style={{
                        ...styles.message,
                        backgroundColor: message.includes('失败') ? '#FEF2F2' : '#F0FDF4',
                        color: message.includes('失败') ? '#DC2626' : '#166534',
                    }}
                >
                    {message}
                </div>
            )}

            <div style={styles.content}>
                <section style={styles.panel}>
                    <h2 style={styles.panelTitle}>{editingArea ? '编辑通行区域' : '新建通行区域'}</h2>
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.field}>
                            <label style={styles.label}>通行编码 *</label>
                            <input
                                className="input"
                                type="text"
                                value={form.accessCode}
                                onChange={(e) => setForm({ ...form, accessCode: e.target.value.replace(/\D/g, '') })}
                                placeholder="例如 101"
                                style={styles.input}
                                disabled={Boolean(editingArea)}
                            />
                            <span style={styles.hint}>仅允许数字，同一赛事内唯一。</span>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>区域名称 *</label>
                            <input
                                className="input"
                                type="text"
                                value={form.accessName}
                                onChange={(e) => setForm({ ...form, accessName: e.target.value })}
                                placeholder="例如 起终点控制区"
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>区域颜色</label>
                            <div style={styles.colorGrid}>
                                {COLOR_OPTIONS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setForm({ ...form, accessColor: color })}
                                        style={{
                                            ...styles.colorSwatch,
                                            backgroundColor: color,
                                            border: form.accessColor === color ? '3px solid #111827' : '2px solid #E5E7EB',
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>排序</label>
                            <input
                                className="input"
                                type="number"
                                value={form.sortOrder}
                                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>说明</label>
                            <textarea
                                className="input"
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="可选，用于标注这个区域的用途"
                                style={{ ...styles.input, minHeight: 88 }}
                            />
                        </div>

                        <div style={styles.actions}>
                            <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={saving}>
                                重置
                            </button>
                            <button type="submit" className="btn btn--primary" disabled={saving}>
                                {saving ? '保存中...' : (editingArea ? '更新' : '创建')}
                            </button>
                        </div>
                    </form>
                </section>

                <section style={styles.panel}>
                    <div style={styles.listHeader}>
                        <h2 style={styles.panelTitle}>已配置区域</h2>
                        <span style={styles.listCount}>{accessAreas.length} 个</span>
                    </div>

                    {loading ? (
                        <div style={styles.empty}>加载中...</div>
                    ) : accessAreas.length === 0 ? (
                        <div style={styles.empty}>还没有通行区域</div>
                    ) : (
                        <div style={styles.list}>
                            {accessAreas.map((area) => (
                                <article key={area.id} style={{ ...styles.card, borderLeft: `4px solid ${area.accessColor || '#3B82F6'}` }}>
                                    <div style={styles.cardHeader}>
                                        <div>
                                            <div style={styles.codeRow}>
                                                <span style={styles.code}>{area.accessCode}</span>
                                                <span style={styles.name}>{area.accessName}</span>
                                            </div>
                                            {area.description && <div style={styles.description}>{area.description}</div>}
                                        </div>
                                        <span style={{ ...styles.dot, backgroundColor: area.accessColor || '#3B82F6' }} />
                                    </div>
                                    <div style={styles.meta}>
                                        <span>排序：{area.sortOrder || 0}</span>
                                        {area.isActive === false && <span style={styles.inactiveTag}>已停用</span>}
                                    </div>
                                    <div style={styles.cardActions}>
                                        <button className="btn btn--ghost btn--sm" onClick={() => handleEdit(area)}>
                                            编辑
                                        </button>
                                        <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(area)} style={{ color: '#DC2626' }}>
                                            删除
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}

const styles = {
    container: { padding: 24, maxWidth: 1400, margin: '0 auto' },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
    message: { padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
    content: { display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24 },
    panel: { background: '#FFFFFF', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    panelTitle: { fontSize: 18, fontWeight: 600, marginBottom: 20 },
    form: { display: 'flex', flexDirection: 'column', gap: 16 },
    field: { display: 'flex', flexDirection: 'column', gap: 6 },
    label: { fontSize: 14, fontWeight: 500, color: '#374151' },
    input: { padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 },
    hint: { fontSize: 12, color: '#6B7280' },
    colorGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 },
    colorSwatch: { width: 36, height: 36, borderRadius: 8, cursor: 'pointer' },
    actions: { display: 'flex', gap: 12, justifyContent: 'flex-end' },
    listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    listCount: { fontSize: 13, color: '#6B7280' },
    empty: { textAlign: 'center', padding: 48, color: '#6B7280' },
    list: { display: 'flex', flexDirection: 'column', gap: 12 },
    card: { background: '#F9FAFB', borderRadius: 10, padding: 16 },
    cardHeader: { display: 'flex', justifyContent: 'space-between', gap: 12 },
    codeRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
    code: { fontSize: 18, fontWeight: 700, color: '#111827' },
    name: { fontSize: 15, color: '#374151' },
    description: { fontSize: 13, color: '#6B7280' },
    dot: { width: 14, height: 14, borderRadius: '50%', flexShrink: 0 },
    meta: { display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, fontSize: 13, color: '#6B7280' },
    inactiveTag: { padding: '2px 8px', borderRadius: 999, background: '#FEE2E2', color: '#B91C1C', fontSize: 12 },
    cardActions: { display: 'flex', gap: 8, marginTop: 12 },
}

export default CredentialZonePage
