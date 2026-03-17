import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'

const COLOR_OPTIONS = [
    '#6B7280', '#EF4444', '#F97316', '#F59E0B', '#84CC16',
    '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
    '#D946EF', '#F43F5E', '#14B8A6', '#EAB308', '#EC4899',
]

const EMPTY_FORM = {
    categoryName: '',
    categoryCode: '',
    cardColor: '#6B7280',
    requiresReview: true,
    description: '',
    accessAreaIds: [],
}

function CredentialRolePage() {
    const [searchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')
    const orgId = searchParams.get('orgId') || ''

    const [accessAreas, setAccessAreas] = useState([])
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [editingCategory, setEditingCategory] = useState(null)
    const [form, setForm] = useState(EMPTY_FORM)

    const loadData = async () => {
        if (!raceId) return
        setLoading(true)
        try {
            const [areaRes, categoryRes] = await Promise.all([
                credentialApi.getAccessAreas(raceId),
                credentialApi.getCategories(raceId),
            ])
            if (areaRes.success) setAccessAreas(areaRes.data || [])
            if (categoryRes.success) setCategories(categoryRes.data || [])
        } catch (err) {
            setMessage(`加载证件类别失败：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadData()
    }, [raceId])

    const accessAreaMap = useMemo(() => {
        const map = new Map()
        accessAreas.forEach((item) => map.set(item.id, item))
        return map
    }, [accessAreas])

    const resetForm = () => {
        setEditingCategory(null)
        setForm(EMPTY_FORM)
    }

    const handleEdit = (category) => {
        setEditingCategory(category)
        setForm({
            categoryName: category.categoryName,
            categoryCode: category.categoryCode,
            cardColor: category.cardColor || '#6B7280',
            requiresReview: category.requiresReview !== false,
            description: category.description || '',
            accessAreaIds: (category.accessAreas || []).map((item) => item.id),
        })
    }

    const toggleAccessArea = (accessAreaId) => {
        setForm((prev) => ({
            ...prev,
            accessAreaIds: prev.accessAreaIds.includes(accessAreaId)
                ? prev.accessAreaIds.filter((id) => id !== accessAreaId)
                : [...prev.accessAreaIds, accessAreaId],
        }))
    }

    const handleDelete = async (category) => {
        if (!window.confirm(`确认删除证件类别“${category.categoryName}”吗？`)) return
        try {
            await credentialApi.deleteCategory(raceId, category.id)
            setMessage('删除成功')
            if (editingCategory?.id === category.id) resetForm()
            await loadData()
        } catch (err) {
            setMessage(`删除失败：${err.message}`)
        }
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        if (!form.categoryCode.trim() || !form.categoryName.trim()) {
            setMessage('请填写类别编码和类别名称')
            return
        }

        setSaving(true)
        setMessage('')
        const payload = {
            categoryCode: form.categoryCode.trim(),
            categoryName: form.categoryName.trim(),
            cardColor: form.cardColor,
            requiresReview: form.requiresReview,
            description: form.description.trim() || undefined,
            accessAreaIds: form.accessAreaIds,
        }

        try {
            if (editingCategory) {
                await credentialApi.updateCategory(raceId, editingCategory.id, payload)
                setMessage('更新成功')
            } else {
                await credentialApi.createCategory(raceId, payload)
                setMessage('创建成功')
            }
            resetForm()
            await loadData()
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
            <h1 style={styles.title}>证件类别管理</h1>
            <p style={styles.subtitle}>类别定义证件颜色、审核策略，以及默认通行区域组合。</p>

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
                    <h2 style={styles.panelTitle}>{editingCategory ? '编辑证件类别' : '新建证件类别'}</h2>
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.field}>
                            <label style={styles.label}>类别编码 *</label>
                            <input
                                className="input"
                                type="text"
                                value={form.categoryCode}
                                onChange={(e) => setForm({ ...form, categoryCode: e.target.value })}
                                placeholder="例如 JUDGE"
                                style={styles.input}
                                disabled={Boolean(editingCategory)}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>类别名称 *</label>
                            <input
                                className="input"
                                type="text"
                                value={form.categoryName}
                                onChange={(e) => setForm({ ...form, categoryName: e.target.value })}
                                placeholder="例如 裁判证"
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>证件主色</label>
                            <div style={styles.colorGrid}>
                                {COLOR_OPTIONS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setForm({ ...form, cardColor: color })}
                                        style={{
                                            ...styles.colorSwatch,
                                            backgroundColor: color,
                                            border: form.cardColor === color ? '3px solid #111827' : '2px solid #E5E7EB',
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={form.requiresReview}
                                    onChange={(e) => setForm({ ...form, requiresReview: e.target.checked })}
                                />
                                <span>提交后需要审核</span>
                            </label>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>默认通行区域</label>
                            {accessAreas.length === 0 ? (
                                <span style={styles.hint}>请先创建通行区域</span>
                            ) : (
                                <div style={styles.checkboxList}>
                                    {accessAreas.map((area) => (
                                        <label key={area.id} style={styles.checkboxItem}>
                                            <input
                                                type="checkbox"
                                                checked={form.accessAreaIds.includes(area.id)}
                                                onChange={() => toggleAccessArea(area.id)}
                                            />
                                            <span style={{ ...styles.dot, backgroundColor: area.accessColor || '#3B82F6' }} />
                                            <span>{area.accessName}</span>
                                            <span style={styles.codeHint}>({area.accessCode})</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>说明</label>
                            <textarea
                                className="input"
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="可选，用于描述这个类别的适用对象"
                                style={{ ...styles.input, minHeight: 80 }}
                            />
                        </div>

                        <div style={styles.actions}>
                            <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={saving}>
                                重置
                            </button>
                            <button type="submit" className="btn btn--primary" disabled={saving}>
                                {saving ? '保存中...' : (editingCategory ? '更新' : '创建')}
                            </button>
                        </div>
                    </form>
                </section>

                <section style={styles.panel}>
                    <div style={styles.listHeader}>
                        <h2 style={styles.panelTitle}>已配置类别</h2>
                        <span style={styles.listCount}>{categories.length} 个</span>
                    </div>

                    {loading ? (
                        <div style={styles.empty}>加载中...</div>
                    ) : categories.length === 0 ? (
                        <div style={styles.empty}>还没有证件类别</div>
                    ) : (
                        <div style={styles.list}>
                            {categories.map((category) => (
                                <article key={category.id} style={{ ...styles.card, borderLeft: `4px solid ${category.cardColor || '#6B7280'}` }}>
                                    <div style={styles.cardHeader}>
                                        <div>
                                            <div style={styles.codeRow}>
                                                <span style={styles.code}>{category.categoryCode}</span>
                                                <span style={styles.name}>{category.categoryName}</span>
                                            </div>
                                            {category.description && <div style={styles.description}>{category.description}</div>}
                                        </div>
                                        {category.requiresReview && <span style={styles.reviewTag}>需审核</span>}
                                    </div>

                                    <div style={styles.meta}>
                                        <span style={{ ...styles.dot, backgroundColor: category.cardColor || '#6B7280' }} />
                                        <span>默认区域：{(category.accessAreas || []).length} 个</span>
                                    </div>

                                    {(category.accessAreas || []).length > 0 && (
                                        <div style={styles.tagList}>
                                            {category.accessAreas.map((area) => (
                                                <span key={area.id} style={{ ...styles.tag, backgroundColor: area.accessColor || '#E5E7EB' }}>
                                                    {area.accessCode}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <div style={styles.cardActions}>
                                        <button className="btn btn--ghost btn--sm" onClick={() => handleEdit(category)}>
                                            编辑
                                        </button>
                                        <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(category)} style={{ color: '#DC2626' }}>
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
    container: { padding: 24, maxWidth: 1440, margin: '0 auto' },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
    message: { padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
    content: { display: 'grid', gridTemplateColumns: '470px 1fr', gap: 24 },
    panel: { background: '#FFFFFF', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    panelTitle: { fontSize: 18, fontWeight: 600, marginBottom: 20 },
    form: { display: 'flex', flexDirection: 'column', gap: 16 },
    field: { display: 'flex', flexDirection: 'column', gap: 6 },
    label: { fontSize: 14, fontWeight: 500, color: '#374151' },
    input: { padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#374151' },
    checkboxList: { display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, maxHeight: 240, overflowY: 'auto' },
    checkboxItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
    codeHint: { color: '#6B7280', fontSize: 12 },
    hint: { fontSize: 12, color: '#6B7280' },
    colorGrid: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8 },
    colorSwatch: { width: 34, height: 34, borderRadius: 8, cursor: 'pointer' },
    actions: { display: 'flex', justifyContent: 'flex-end', gap: 12 },
    listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    listCount: { fontSize: 13, color: '#6B7280' },
    empty: { textAlign: 'center', padding: 48, color: '#6B7280' },
    list: { display: 'flex', flexDirection: 'column', gap: 12 },
    card: { background: '#F9FAFB', borderRadius: 10, padding: 16 },
    cardHeader: { display: 'flex', justifyContent: 'space-between', gap: 12 },
    codeRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
    code: { fontSize: 16, fontWeight: 700, color: '#111827' },
    name: { fontSize: 15, color: '#374151' },
    description: { fontSize: 13, color: '#6B7280' },
    reviewTag: { padding: '2px 8px', borderRadius: 999, background: '#DBEAFE', color: '#1D4ED8', fontSize: 12, whiteSpace: 'nowrap' },
    meta: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 13, color: '#6B7280' },
    dot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0 },
    tagList: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    tag: { padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#111827' },
    cardActions: { display: 'flex', gap: 8, marginTop: 12 },
}

export default CredentialRolePage
