import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'

const TAB_OPTIONS = [
    { value: 'pending', label: '待处理' },
    { value: 'all', label: '全部请求' },
]

const STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'submitted', label: '待审核' },
    { value: 'approved', label: '已通过' },
    { value: 'rejected', label: '已驳回' },
]

const STATUS_BADGES = {
    submitted: { background: '#DBEAFE', color: '#1D4ED8', label: '待审核' },
    under_review: { background: '#FEF3C7', color: '#92400E', label: '审核中' },
    approved: { background: '#DCFCE7', color: '#166534', label: '已通过' },
    rejected: { background: '#FEE2E2', color: '#B91C1C', label: '已驳回' },
}

function CredentialReviewPage() {
    const [searchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')
    const orgId = searchParams.get('orgId') || ''

    const [requests, setRequests] = useState([])
    const [categories, setCategories] = useState([])
    const [accessAreas, setAccessAreas] = useState([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [message, setMessage] = useState('')
    const [activeTab, setActiveTab] = useState('pending')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedRequest, setSelectedRequest] = useState(null)
    const [reviewForm, setReviewForm] = useState({
        approved: true,
        categoryId: '',
        jobTitle: '',
        accessCodes: [],
        remark: '',
        rejectReason: '',
    })

    const loadData = async () => {
        if (!raceId) return
        setLoading(true)
        try {
            const [requestRes, categoryRes, accessAreaRes] = await Promise.all([
                credentialApi.getRequests(raceId, statusFilter ? { status: statusFilter } : {}),
                credentialApi.getCategories(raceId),
                credentialApi.getAccessAreas(raceId),
            ])
            if (requestRes.success) setRequests(requestRes.data || [])
            if (categoryRes.success) setCategories(categoryRes.data || [])
            if (accessAreaRes.success) setAccessAreas(accessAreaRes.data || [])
        } catch (err) {
            setMessage(`加载审核列表失败：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadData()
    }, [raceId, statusFilter])

    const filteredRequests = useMemo(() => {
        const pendingStatuses = new Set(['submitted', 'under_review'])
        return requests
            .filter((item) => (activeTab === 'pending' ? pendingStatuses.has(item.status) : true))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }, [activeTab, requests])

    const openReview = async (requestId) => {
        try {
            const res = await credentialApi.getRequest(raceId, requestId)
            if (!res.success) return
            const request = res.data
            setSelectedRequest(request)
            setReviewForm({
                approved: request.status !== 'rejected',
                categoryId: String(request.categoryId),
                jobTitle: request.jobTitle || '',
                accessCodes: (request.accessAreas || []).map((item) => item.accessCode),
                remark: request.reviewRemark || '',
                rejectReason: request.rejectReason || '',
            })
        } catch (err) {
            setMessage(`加载请求详情失败：${err.message}`)
        }
    }

    const toggleAccessCode = (accessCode) => {
        setReviewForm((prev) => ({
            ...prev,
            accessCodes: prev.accessCodes.includes(accessCode)
                ? prev.accessCodes.filter((code) => code !== accessCode)
                : [...prev.accessCodes, accessCode],
        }))
    }

    const applyCategoryDefaults = (categoryId) => {
        const category = categories.find((item) => String(item.id) === String(categoryId))
        setReviewForm((prev) => ({
            ...prev,
            categoryId: String(categoryId),
            accessCodes: category ? (category.accessAreas || []).map((item) => item.accessCode) : [],
        }))
    }

    const submitReview = async () => {
        if (!selectedRequest) return
        if (!reviewForm.categoryId) {
            setMessage('请选择证件类别')
            return
        }
        if (!reviewForm.approved && !reviewForm.rejectReason.trim()) {
            setMessage('驳回时必须填写原因')
            return
        }

        setProcessing(true)
        setMessage('')
        try {
            await credentialApi.reviewRequest(raceId, selectedRequest.id, {
                approved: reviewForm.approved,
                categoryId: Number(reviewForm.categoryId),
                jobTitle: reviewForm.jobTitle.trim() || undefined,
                accessCodes: reviewForm.approved ? reviewForm.accessCodes : undefined,
                remark: reviewForm.remark.trim() || undefined,
                rejectReason: reviewForm.approved ? undefined : reviewForm.rejectReason.trim(),
            })
            setMessage('审核完成')
            setSelectedRequest(null)
            await loadData()
        } catch (err) {
            setMessage(`审核失败：${err.message}`)
        } finally {
            setProcessing(false)
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
            <h1 style={styles.title}>证件审核</h1>
            <p style={styles.subtitle}>审核时可以整体替换证件类别、职务和最终通行编码列表，不再使用加减覆盖规则。</p>

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
                <div style={styles.tabGroup}>
                    {TAB_OPTIONS.map((tab) => (
                        <button
                            key={tab.value}
                            className={`btn ${activeTab === tab.value ? 'btn--primary' : 'btn--ghost'}`}
                            onClick={() => setActiveTab(tab.value)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.select}>
                    {STATUS_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div style={styles.empty}>加载中...</div>
            ) : filteredRequests.length === 0 ? (
                <div style={styles.empty}>{activeTab === 'pending' ? '暂无待审核请求' : '暂无请求记录'}</div>
            ) : (
                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr style={styles.tableHeader}>
                                <th style={styles.th}>申请人</th>
                                <th style={styles.th}>证件类别</th>
                                <th style={styles.th}>职务</th>
                                <th style={styles.th}>状态</th>
                                <th style={styles.th}>提交时间</th>
                                <th style={styles.th}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRequests.map((request) => {
                                const badge = STATUS_BADGES[request.status] || STATUS_BADGES.submitted
                                return (
                                    <tr key={request.id} style={styles.row}>
                                        <td style={styles.td}>
                                            <div style={styles.name}>{request.personName}</div>
                                            <div style={styles.org}>{request.orgName || '-'}</div>
                                        </td>
                                        <td style={styles.td}>{request.categoryName}</td>
                                        <td style={styles.td}>{request.jobTitle || '-'}</td>
                                        <td style={styles.td}>
                                            <span style={{ ...styles.statusBadge, background: badge.background, color: badge.color }}>
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td style={styles.td}>{new Date(request.createdAt).toLocaleString('zh-CN')}</td>
                                        <td style={styles.td}>
                                            <button className="btn btn--primary btn--sm" onClick={() => openReview(request.id)}>
                                                {['submitted', 'under_review'].includes(request.status) ? '审核' : '详情'}
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedRequest && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h2 style={styles.modalTitle}>审核请求</h2>

                        <div style={styles.summaryGrid}>
                            <div><span style={styles.summaryLabel}>申请人</span><span style={styles.summaryValue}>{selectedRequest.personName}</span></div>
                            <div><span style={styles.summaryLabel}>单位</span><span style={styles.summaryValue}>{selectedRequest.orgName || '-'}</span></div>
                            <div><span style={styles.summaryLabel}>当前类别</span><span style={styles.summaryValue}>{selectedRequest.categoryName}</span></div>
                            <div><span style={styles.summaryLabel}>提交时间</span><span style={styles.summaryValue}>{new Date(selectedRequest.createdAt).toLocaleString('zh-CN')}</span></div>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>证件类别</label>
                            <select
                                className="input"
                                value={reviewForm.categoryId}
                                onChange={(e) => applyCategoryDefaults(e.target.value)}
                                style={styles.input}
                            >
                                <option value="">请选择类别</option>
                                {categories.map((item) => (
                                    <option key={item.id} value={item.id}>{item.categoryName}</option>
                                ))}
                            </select>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>职务</label>
                            <input
                                className="input"
                                type="text"
                                value={reviewForm.jobTitle}
                                onChange={(e) => setReviewForm({ ...reviewForm, jobTitle: e.target.value })}
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
                                            checked={reviewForm.accessCodes.includes(item.accessCode)}
                                            onChange={() => toggleAccessCode(item.accessCode)}
                                        />
                                        <span style={{ ...styles.dot, backgroundColor: item.accessColor || '#3B82F6' }} />
                                        <span>{item.accessName}</span>
                                        <span style={styles.codeHint}>({item.accessCode})</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div style={styles.decisionRow}>
                            <label style={styles.radioLabel}>
                                <input
                                    type="radio"
                                    checked={reviewForm.approved}
                                    onChange={() => setReviewForm({ ...reviewForm, approved: true })}
                                />
                                <span>通过</span>
                            </label>
                            <label style={styles.radioLabel}>
                                <input
                                    type="radio"
                                    checked={!reviewForm.approved}
                                    onChange={() => setReviewForm({ ...reviewForm, approved: false })}
                                />
                                <span>驳回</span>
                            </label>
                        </div>

                        <div style={styles.field}>
                            <label style={styles.label}>{reviewForm.approved ? '审核备注' : '驳回原因'}</label>
                            <textarea
                                className="input"
                                value={reviewForm.approved ? reviewForm.remark : reviewForm.rejectReason}
                                onChange={(e) => setReviewForm({
                                    ...reviewForm,
                                    [reviewForm.approved ? 'remark' : 'rejectReason']: e.target.value,
                                })}
                                style={{ ...styles.input, minHeight: 88 }}
                            />
                        </div>

                        <div style={styles.modalActions}>
                            <button className="btn btn--ghost" onClick={() => setSelectedRequest(null)} disabled={processing}>
                                取消
                            </button>
                            <button className="btn btn--primary" onClick={submitReview} disabled={processing}>
                                {processing ? '处理中...' : '确认提交'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const styles = {
    container: { padding: 24, maxWidth: 1440, margin: '0 auto' },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
    message: { padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
    filterBar: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 20, padding: '16px 20px', background: '#FFFFFF', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    tabGroup: { display: 'flex', gap: 8 },
    select: { minWidth: 180 },
    empty: { textAlign: 'center', padding: 64, color: '#6B7280' },
    tableContainer: { background: '#FFFFFF', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' },
    table: { width: '100%', borderCollapse: 'collapse' },
    tableHeader: { background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' },
    th: { textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#6B7280' },
    row: { borderBottom: '1px solid #F3F4F6' },
    td: { padding: '16px', fontSize: 14, color: '#374151' },
    name: { fontWeight: 600, color: '#111827' },
    org: { marginTop: 4, fontSize: 12, color: '#6B7280' },
    statusBadge: { padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 },
    modalContent: { background: '#FFFFFF', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: 600, marginBottom: 20 },
    summaryGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #E5E7EB' },
    summaryLabel: { display: 'block', fontSize: 13, color: '#6B7280', marginBottom: 4 },
    summaryValue: { fontSize: 14, color: '#374151' },
    field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 },
    label: { fontSize: 14, fontWeight: 500, color: '#374151' },
    input: { padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 },
    checkboxList: { display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, maxHeight: 220, overflowY: 'auto' },
    checkboxItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
    dot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0 },
    codeHint: { fontSize: 12, color: '#6B7280' },
    decisionRow: { display: 'flex', gap: 24, marginBottom: 16 },
    radioLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 12 },
}

export default CredentialReviewPage
