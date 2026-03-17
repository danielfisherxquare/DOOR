import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'
import useAuthStore from '../../../stores/authStore'

const SOURCE_OPTIONS = [
    { value: 'self_service', label: '用户自助申请' },
    { value: 'admin_direct', label: '管理员直建' },
]

const STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'submitted', label: '待审核' },
    { value: 'approved', label: '已通过' },
    { value: 'rejected', label: '已驳回' },
    { value: 'generated', label: '已生成证件' },
]

const STATUS_BADGES = {
    submitted: { background: '#DBEAFE', color: '#1D4ED8', label: '待审核' },
    under_review: { background: '#FEF3C7', color: '#92400E', label: '审核中' },
    approved: { background: '#DCFCE7', color: '#166534', label: '已通过' },
    rejected: { background: '#FEE2E2', color: '#B91C1C', label: '已驳回' },
    generated: { background: '#E0E7FF', color: '#3730A3', label: '已生成证件' },
    draft: { background: '#F3F4F6', color: '#6B7280', label: '草稿' },
}

const EMPTY_FORM = {
    sourceMode: 'admin_direct',
    categoryId: '',
    personName: '',
    orgName: '',
    jobTitle: '',
    accessCodes: [],
    remark: '',
}

function CredentialApplicationPage() {
    const { user } = useAuthStore()
    const [searchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')
    const orgId = searchParams.get('orgId') || ''

    const [categories, setCategories] = useState([])
    const [accessAreas, setAccessAreas] = useState([])
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [selectedRequest, setSelectedRequest] = useState(null)
    const [form, setForm] = useState({
        ...EMPTY_FORM,
        personName: user?.name || '',
    })

    const isAdmin = ['org_admin', 'super_admin'].includes(user?.role)

    const loadData = async () => {
        if (!raceId) return
        setLoading(true)
        try {
            const [categoryRes, accessAreaRes, requestRes] = await Promise.all([
                credentialApi.getCategories(raceId),
                credentialApi.getAccessAreas(raceId),
                credentialApi.getRequests(raceId, statusFilter ? { status: statusFilter } : {}),
            ])
            if (categoryRes.success) setCategories(categoryRes.data || [])
            if (accessAreaRes.success) setAccessAreas(accessAreaRes.data || [])
            if (requestRes.success) setRequests(requestRes.data || [])
        } catch (err) {
            setMessage(`加载证件申请失败：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadData()
    }, [raceId, statusFilter])

    const currentCategory = useMemo(
        () => categories.find((item) => String(item.id) === String(form.categoryId)) || null,
        [categories, form.categoryId],
    )

    useEffect(() => {
        if (!currentCategory) return
        setForm((prev) => {
            if (prev.accessCodes.length > 0) return prev
            return {
                ...prev,
                accessCodes: (currentCategory.accessAreas || []).map((item) => item.accessCode),
            }
        })
    }, [currentCategory])

    const resetForm = () => {
        setForm({
            ...EMPTY_FORM,
            sourceMode: isAdmin ? 'admin_direct' : 'self_service',
            personName: user?.name || '',
        })
    }

    const toggleAccessCode = (accessCode) => {
        setForm((prev) => ({
            ...prev,
            accessCodes: prev.accessCodes.includes(accessCode)
                ? prev.accessCodes.filter((code) => code !== accessCode)
                : [...prev.accessCodes, accessCode],
        }))
    }

    const openRequestDetail = async (requestId) => {
        try {
            const res = await credentialApi.getRequest(raceId, requestId)
            if (res.success) setSelectedRequest(res.data)
        } catch (err) {
            setMessage(`加载申请详情失败：${err.message}`)
        }
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        if (!form.categoryId) {
            setMessage('请选择证件类别')
            return
        }
        if (!form.personName.trim()) {
            setMessage('请填写姓名')
            return
        }

        setSaving(true)
        setMessage('')
        try {
            await credentialApi.createRequest(raceId, {
                sourceMode: isAdmin ? form.sourceMode : 'self_service',
                categoryId: Number(form.categoryId),
                personName: form.personName.trim(),
                orgName: form.orgName.trim() || undefined,
                jobTitle: form.jobTitle.trim() || undefined,
                accessCodes: form.accessCodes.length > 0 ? form.accessCodes : undefined,
                remark: form.remark.trim() || undefined,
            })
            setMessage('申请已提交')
            setShowForm(false)
            resetForm()
            await loadData()
        } catch (err) {
            setMessage(`提交失败：${err.message}`)
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
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>证件申请与直建</h1>
                    <p style={styles.subtitle}>支持自助申请和管理员直接建单，申请会保存类别、职务和最终通行编码列表。</p>
                </div>
                <button className="btn btn--primary" onClick={() => setShowForm(true)}>
                    新建请求
                </button>
            </div>

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

            <div style={styles.filterBar}>
                <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.select}>
                    {STATUS_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div style={styles.empty}>加载中...</div>
            ) : requests.length === 0 ? (
                <div style={styles.empty}>暂无申请记录</div>
            ) : (
                <div style={styles.grid}>
                    {requests.map((request) => {
                        const badge = STATUS_BADGES[request.status] || STATUS_BADGES.draft
                        return (
                            <article key={request.id} style={styles.card}>
                                <div style={styles.cardHeader}>
                                    <div>
                                        <div style={styles.cardTitle}>{request.categoryName}</div>
                                        <div style={styles.cardMeta}>{request.personName}{request.jobTitle ? ` · ${request.jobTitle}` : ''}</div>
                                    </div>
                                    <span style={{ ...styles.statusBadge, background: badge.background, color: badge.color }}>
                                        {badge.label}
                                    </span>
                                </div>

                                <div style={styles.cardBody}>
                                    <div style={styles.infoRow}>
                                        <span style={styles.infoLabel}>单位</span>
                                        <span style={styles.infoValue}>{request.orgName || '-'}</span>
                                    </div>
                                    <div style={styles.infoRow}>
                                        <span style={styles.infoLabel}>来源</span>
                                        <span style={styles.infoValue}>{request.sourceMode === 'admin_direct' ? '管理员直建' : '用户自助'}</span>
                                    </div>
                                    <div style={styles.infoRow}>
                                        <span style={styles.infoLabel}>区域</span>
                                        <div style={styles.chipList}>
                                            {(request.accessAreas || []).map((item) => (
                                                <span key={item.accessCode} style={{ ...styles.chip, backgroundColor: item.accessColor || '#E5E7EB' }}>
                                                    {item.accessCode}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={styles.infoRow}>
                                        <span style={styles.infoLabel}>时间</span>
                                        <span style={styles.infoValue}>{new Date(request.createdAt).toLocaleString('zh-CN')}</span>
                                    </div>
                                </div>

                                <div style={styles.cardFooter}>
                                    <button className="btn btn--ghost btn--sm" onClick={() => openRequestDetail(request.id)}>
                                        查看详情
                                    </button>
                                </div>
                            </article>
                        )
                    })}
                </div>
            )}

            {showForm && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h2 style={styles.modalTitle}>新建请求</h2>
                        <form onSubmit={handleSubmit} style={styles.form}>
                            {isAdmin && (
                                <div style={styles.field}>
                                    <label style={styles.label}>创建方式</label>
                                    <select
                                        className="input"
                                        value={form.sourceMode}
                                        onChange={(e) => setForm({ ...form, sourceMode: e.target.value })}
                                        style={styles.input}
                                    >
                                        {SOURCE_OPTIONS.map((item) => (
                                            <option key={item.value} value={item.value}>{item.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div style={styles.field}>
                                <label style={styles.label}>证件类别 *</label>
                                <select
                                    className="input"
                                    value={form.categoryId}
                                    onChange={(e) => setForm({ ...form, categoryId: e.target.value, accessCodes: [] })}
                                    style={styles.input}
                                >
                                    <option value="">请选择类别</option>
                                    {categories.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.categoryName}{item.requiresReview ? '（需审核）' : '（自动通过）'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>姓名 *</label>
                                <input
                                    className="input"
                                    type="text"
                                    value={form.personName}
                                    onChange={(e) => setForm({ ...form, personName: e.target.value })}
                                    style={styles.input}
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>单位名称</label>
                                <input
                                    className="input"
                                    type="text"
                                    value={form.orgName}
                                    onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                                    style={styles.input}
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>职务</label>
                                <input
                                    className="input"
                                    type="text"
                                    value={form.jobTitle}
                                    onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                                    placeholder="例如 主裁判 / 检录志愿者"
                                    style={styles.input}
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>最终通行编码</label>
                                <div style={styles.checkboxList}>
                                    {accessAreas.map((item) => (
                                        <label key={item.id} style={styles.checkboxItem}>
                                            <input
                                                type="checkbox"
                                                checked={form.accessCodes.includes(item.accessCode)}
                                                onChange={() => toggleAccessCode(item.accessCode)}
                                            />
                                            <span style={{ ...styles.dot, backgroundColor: item.accessColor || '#3B82F6' }} />
                                            <span>{item.accessName}</span>
                                            <span style={styles.codeHint}>({item.accessCode})</span>
                                        </label>
                                    ))}
                                </div>
                                {currentCategory && (
                                    <span style={styles.hint}>
                                        默认值来自类别“{currentCategory.categoryName}”，这里可以在创建时直接调整。
                                    </span>
                                )}
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>备注</label>
                                <textarea
                                    className="input"
                                    value={form.remark}
                                    onChange={(e) => setForm({ ...form, remark: e.target.value })}
                                    style={{ ...styles.input, minHeight: 88 }}
                                />
                            </div>

                            <div style={styles.modalActions}>
                                <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)} disabled={saving}>
                                    取消
                                </button>
                                <button type="submit" className="btn btn--primary" disabled={saving}>
                                    {saving ? '提交中...' : '提交请求'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {selectedRequest && (
                <div style={styles.modal}>
                    <div style={{ ...styles.modalContent, maxWidth: 720 }}>
                        <h2 style={styles.modalTitle}>请求详情</h2>
                        <div style={styles.detailGrid}>
                            <div><span style={styles.detailLabel}>类别</span><span style={styles.detailValue}>{selectedRequest.categoryName}</span></div>
                            <div><span style={styles.detailLabel}>姓名</span><span style={styles.detailValue}>{selectedRequest.personName}</span></div>
                            <div><span style={styles.detailLabel}>单位</span><span style={styles.detailValue}>{selectedRequest.orgName || '-'}</span></div>
                            <div><span style={styles.detailLabel}>职务</span><span style={styles.detailValue}>{selectedRequest.jobTitle || '-'}</span></div>
                            <div><span style={styles.detailLabel}>来源</span><span style={styles.detailValue}>{selectedRequest.sourceMode === 'admin_direct' ? '管理员直建' : '用户自助'}</span></div>
                            <div><span style={styles.detailLabel}>状态</span><span style={styles.detailValue}>{(STATUS_BADGES[selectedRequest.status] || STATUS_BADGES.draft).label}</span></div>
                        </div>

                        <div style={styles.detailSection}>
                            <div style={styles.detailLabel}>通行区域</div>
                            <div style={styles.chipList}>
                                {(selectedRequest.accessAreas || []).map((item) => (
                                    <span key={item.accessCode} style={{ ...styles.chip, backgroundColor: item.accessColor || '#E5E7EB' }}>
                                        {item.accessCode}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {selectedRequest.reviewRemark && (
                            <div style={styles.detailSection}>
                                <div style={styles.detailLabel}>审核意见</div>
                                <div style={styles.detailValue}>{selectedRequest.reviewRemark}</div>
                            </div>
                        )}

                        {selectedRequest.rejectReason && (
                            <div style={styles.detailSection}>
                                <div style={styles.detailLabel}>驳回原因</div>
                                <div style={{ ...styles.detailValue, color: '#B91C1C' }}>{selectedRequest.rejectReason}</div>
                            </div>
                        )}

                        <div style={styles.modalActions}>
                            <button className="btn btn--ghost" onClick={() => setSelectedRequest(null)}>
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const styles = {
    container: { padding: 24, maxWidth: 1400, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start', marginBottom: 20 },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#6B7280', maxWidth: 760 },
    message: { padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
    filterBar: { display: 'flex', justifyContent: 'flex-end', marginBottom: 20 },
    select: { minWidth: 180 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 },
    card: { background: '#FFFFFF', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', padding: '16px 18px', borderBottom: '1px solid #F3F4F6' },
    cardTitle: { fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 },
    cardMeta: { fontSize: 13, color: '#6B7280' },
    statusBadge: { padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
    cardBody: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
    infoRow: { display: 'flex', gap: 12, fontSize: 14 },
    infoLabel: { width: 56, color: '#6B7280', flexShrink: 0 },
    infoValue: { color: '#374151' },
    chipList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
    chip: { padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#111827' },
    cardFooter: { padding: '12px 18px', borderTop: '1px solid #F3F4F6' },
    empty: { textAlign: 'center', padding: 64, color: '#6B7280' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 },
    modalContent: { background: '#FFFFFF', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: 600, marginBottom: 20 },
    form: { display: 'flex', flexDirection: 'column', gap: 16 },
    field: { display: 'flex', flexDirection: 'column', gap: 6 },
    label: { fontSize: 14, fontWeight: 500, color: '#374151' },
    input: { padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 },
    checkboxList: { display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, maxHeight: 220, overflowY: 'auto' },
    checkboxItem: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 },
    dot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0 },
    codeHint: { fontSize: 12, color: '#6B7280' },
    hint: { fontSize: 12, color: '#6B7280' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
    detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    detailSection: { marginTop: 16 },
    detailLabel: { display: 'block', fontSize: 13, color: '#6B7280', marginBottom: 6 },
    detailValue: { color: '#374151', fontSize: 14 },
}

export default CredentialApplicationPage
