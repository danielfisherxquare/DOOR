/**
 * CredentialReviewPage.jsx
 * ==========================
 * 证件审核页面
 * 
 * 功能：
 * - 审核列表 (待审核/已审核)
 * - 审核详情 (含地图高亮)
 * - 通过/驳回操作
 * - 区域调整
 * - 审核日志
 */

import { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'
import useAuthStore from '../../../stores/authStore'

const TAB_OPTIONS = [
    { value: 'pending', label: '待审核' },
    { value: 'all', label: '全部' },
]

const STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'submitted', label: '已提交' },
    { value: 'under_review', label: '审核中' },
    { value: 'approved', label: '已通过' },
    { value: 'rejected', label: '已驳回' },
]

const STATUS_BADGE_STYLES = {
    submitted: { background: '#DBEAFE', color: '#1E40AF' },
    under_review: { background: '#FEF3C7', color: '#92400E' },
    approved: { background: '#DCFCE7', color: '#166534' },
    rejected: { background: '#FEE2E2', color: '#991B1B' },
}

function CredentialReviewPage() {
    const { user } = useAuthStore()
    const [searchParams, setSearchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')

    const [applications, setApplications] = useState([])
    const [zones, setZones] = useState([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [message, setMessage] = useState('')

    const [activeTab, setActiveTab] = useState('pending')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedApplication, setSelectedApplication] = useState(null)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [reviewForm, setReviewForm] = useState({
        approved: true,
        remark: '',
        rejectReason: '',
        zoneOverrides: [],
    })

    // 加载数据
    useEffect(() => {
        if (!raceId) return

        const loadData = async () => {
            setLoading(true)
            try {
                const [zonesRes, applicationsRes] = await Promise.all([
                    credentialApi.getZones(raceId),
                    credentialApi.getApplications(raceId, { status: statusFilter || undefined }),
                ])

                if (zonesRes.success) {
                    setZones(zonesRes.data || [])
                }
                if (applicationsRes.success) {
                    setApplications(applicationsRes.data || [])
                }
            } catch (err) {
                setMessage(`加载失败：${err.message}`)
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [raceId, statusFilter])

    // 过滤申请
    const filteredApplications = useMemo(() => {
        let filtered = applications

        if (activeTab === 'pending') {
            filtered = filtered.filter(
                (app) => app.status === 'submitted' || app.status === 'under_review'
            )
        }

        if (statusFilter) {
            filtered = filtered.filter((app) => app.status === statusFilter)
        }

        return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }, [applications, activeTab, statusFilter])

    const handleReview = async (app) => {
        setSelectedApplication(app)
        setReviewForm({
            approved: true,
            remark: '',
            rejectReason: '',
            zoneOverrides: [],
        })
        setShowReviewModal(true)
    }

    const submitReview = async () => {
        if (!selectedApplication) return

        if (!reviewForm.approved && !reviewForm.rejectReason.trim()) {
            setMessage('请填写驳回原因')
            return
        }

        setProcessing(true)
        setMessage('')

        try {
            await credentialApi.reviewApplication(raceId, selectedApplication.id, {
                approved: reviewForm.approved,
                remark: reviewForm.remark,
                rejectReason: reviewForm.rejectReason,
                zoneOverrides: reviewForm.zoneOverrides,
            })
            setMessage('审核完成')
            setShowReviewModal(false)
            // 重新加载列表
            const applicationsRes = await credentialApi.getApplications(raceId, { status: statusFilter || undefined })
            if (applicationsRes.success) {
                setApplications(applicationsRes.data || [])
            }
        } catch (err) {
            setMessage(`审核失败：${err.message}`)
        } finally {
            setProcessing(false)
        }
    }

    const handleZoneOverride = (zoneCode, overrideType) => {
        setReviewForm((prev) => {
            const exists = prev.zoneOverrides.find((o) => o.zoneCode === zoneCode)
            if (exists) {
                // 如果已存在相同类型，移除
                if (exists.overrideType === overrideType) {
                    return {
                        ...prev,
                        zoneOverrides: prev.zoneOverrides.filter((o) => o.zoneCode !== zoneCode),
                    }
                }
                // 否则更新类型
                return {
                    ...prev,
                    zoneOverrides: prev.zoneOverrides.map((o) =>
                        o.zoneCode === zoneCode ? { ...o, overrideType } : o
                    ),
                }
            }
            // 添加新调整
            return {
                ...prev,
                zoneOverrides: [...prev.zoneOverrides, { zoneCode, overrideType, remark: '' }],
            }
        })
    }

    const statusBadgeStyle = (status) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 80,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        ...STATUS_BADGE_STYLES[status],
    })

    const zoneMap = useMemo(() => {
        const map = new Map()
        zones.forEach((zone) => map.set(zone.zoneCode, zone))
        return map
    }, [zones])

    if (!raceId) {
        return (
            <div style={styles.container}>
                <div style={styles.empty}>
                    <p style={{ marginBottom: 16 }}>请先选择赛事</p>
                    <Link to={`/admin/credential/select-race?orgId=${searchParams.get('orgId') || ''}`} className="btn btn--primary">
                        去选择赛事
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>证件审核</h1>
            </div>

            {message && (
                <div style={{
                    ...styles.message,
                    backgroundColor: message.includes('失败') ? '#FEF2F2' : '#F0FDF4',
                    color: message.includes('失败') ? '#DC2626' : '#166534',
                }}>
                    {message}
                </div>
            )}

            {/* 筛选栏 */}
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

                <select
                    className="input"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={styles.select}
                >
                    {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* 申请列表 */}
            {loading ? (
                <div style={styles.loading}>加载中...</div>
            ) : filteredApplications.length === 0 ? (
                <div style={styles.empty}>
                    {activeTab === 'pending' ? '暂无待审核申请' : '暂无申请记录'}
                </div>
            ) : (
                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr style={styles.tableHeader}>
                                <th style={styles.th}>申请人</th>
                                <th style={styles.th}>岗位</th>
                                <th style={styles.th}>状态</th>
                                <th style={styles.th}>申请时间</th>
                                <th style={styles.th}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredApplications.map((app) => (
                                <tr key={app.id} style={styles.tr}>
                                    <td style={styles.td}>
                                        <div style={styles.applicantName}>{app.personName}</div>
                                        {app.orgName && (
                                            <div style={styles.applicantOrg}>{app.orgName}</div>
                                        )}
                                    </td>
                                    <td style={styles.td}>{app.roleName}</td>
                                    <td style={styles.td}>
                                        <span style={statusBadgeStyle(app.status)}>
                                            {STATUS_OPTIONS.find((s) => s.value === app.status)?.label || app.status}
                                        </span>
                                    </td>
                                    <td style={styles.td}>
                                        {new Date(app.createdAt).toLocaleString('zh-CN')}
                                    </td>
                                    <td style={styles.td}>
                                        {(app.status === 'submitted' || app.status === 'under_review') && (
                                            <button
                                                className="btn btn--primary btn--sm"
                                                onClick={() => handleReview(app)}
                                            >
                                                审核
                                            </button>
                                        )}
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            onClick={() => {
                                                setSelectedApplication(app)
                                                setReviewForm({ ...reviewForm, approved: true })
                                                setShowReviewModal(true)
                                            }}
                                        >
                                            详情
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 审核对话框 */}
            {showReviewModal && selectedApplication && (
                <div style={styles.modal}>
                    <div style={{ ...styles.modalContent, maxWidth: 700 }}>
                        <h2 style={styles.modalTitle}>证件审核</h2>

                        {/* 申请人信息 */}
                        <div style={styles.section}>
                            <h3 style={styles.sectionTitle}>申请人信息</h3>
                            <div style={styles.infoGrid}>
                                <div>
                                    <span style={styles.infoLabel}>姓名:</span>
                                    <span style={styles.infoValue}>{selectedApplication.personName}</span>
                                </div>
                                <div>
                                    <span style={styles.infoLabel}>单位:</span>
                                    <span style={styles.infoValue}>{selectedApplication.orgName || '-'}</span>
                                </div>
                                <div>
                                    <span style={styles.infoLabel}>岗位:</span>
                                    <span style={styles.infoValue}>{selectedApplication.roleName}</span>
                                </div>
                                <div>
                                    <span style={styles.infoLabel}>申请时间:</span>
                                    <span style={styles.infoValue}>
                                        {new Date(selectedApplication.createdAt).toLocaleString('zh-CN')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 默认可通行区域 */}
                        <div style={styles.section}>
                            <h3 style={styles.sectionTitle}>默认可通行区域</h3>
                            <div style={styles.zoneList}>
                                {zones.length === 0 ? (
                                    <span style={styles.emptyText}>暂无分区</span>
                                ) : (
                                    zones.map((zone) => {
                                        const override = reviewForm.zoneOverrides.find(
                                            (o) => o.zoneCode === zone.zoneCode
                                        )
                                        const effectiveAccess = override
                                            ? override.overrideType === 'add'
                                            : true // 默认都有权限，实际逻辑根据岗位模板调整
                                        return (
                                            <div
                                                key={zone.zoneCode}
                                                style={{
                                                    ...styles.zoneItem,
                                                    opacity: effectiveAccess ? 1 : 0.5,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        ...styles.zoneDot,
                                                        backgroundColor: zone.zoneColor,
                                                    }}
                                                />
                                                <span>{zone.zoneName}</span>
                                                <span style={styles.zoneCode}>({zone.zoneCode})</span>
                                                <div style={styles.zoneActions}>
                                                    <button
                                                        className={`btn btn--sm ${override?.overrideType === 'add'
                                                            ? 'btn--primary'
                                                            : 'btn--ghost'
                                                            }`}
                                                        onClick={() => handleZoneOverride(zone.zoneCode, 'add')}
                                                    >
                                                        + 增加
                                                    </button>
                                                    <button
                                                        className={`btn btn--sm ${override?.overrideType === 'remove'
                                                            ? 'btn--danger'
                                                            : 'btn--ghost'
                                                            }`}
                                                        onClick={() => handleZoneOverride(zone.zoneCode, 'remove')}
                                                    >
                                                        - 移除
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>

                        {/* 审核操作 */}
                        <div style={styles.section}>
                            <h3 style={styles.sectionTitle}>审核决定</h3>
                            <div style={styles.reviewOptions}>
                                <label style={styles.reviewOption}>
                                    <input
                                        type="radio"
                                        checked={reviewForm.approved}
                                        onChange={() => setReviewForm({ ...reviewForm, approved: true })}
                                    />
                                    <span style={styles.reviewOptionLabel}>通过</span>
                                </label>
                                <label style={styles.reviewOption}>
                                    <input
                                        type="radio"
                                        checked={!reviewForm.approved}
                                        onChange={() => setReviewForm({ ...reviewForm, approved: false })}
                                    />
                                    <span style={styles.reviewOptionLabel}>驳回</span>
                                </label>
                            </div>

                            {reviewForm.approved ? (
                                <div style={styles.field}>
                                    <label style={styles.label}>审核意见</label>
                                    <textarea
                                        className="input"
                                        value={reviewForm.remark}
                                        onChange={(e) =>
                                            setReviewForm({ ...reviewForm, remark: e.target.value })
                                        }
                                        style={{ ...styles.input, minHeight: 80 }}
                                        placeholder="可选"
                                    />
                                </div>
                            ) : (
                                <div style={styles.field}>
                                    <label style={styles.label}>驳回原因 *</label>
                                    <textarea
                                        className="input"
                                        value={reviewForm.rejectReason}
                                        onChange={(e) =>
                                            setReviewForm({ ...reviewForm, rejectReason: e.target.value })
                                        }
                                        style={{ ...styles.input, minHeight: 80 }}
                                        placeholder="请填写驳回原因"
                                        required={!reviewForm.approved}
                                    />
                                </div>
                            )}
                        </div>

                        <div style={styles.modalActions}>
                            <button
                                className="btn btn--ghost"
                                onClick={() => setShowReviewModal(false)}
                                disabled={processing}
                            >
                                取消
                            </button>
                            <button
                                className="btn btn--primary"
                                onClick={submitReview}
                                disabled={processing}
                            >
                                {processing ? '处理中...' : '确认审核'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const styles = {
    container: {
        padding: 24,
        maxWidth: 1400,
        margin: '0 auto',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: 700,
    },
    message: {
        padding: '12px 16px',
        borderRadius: 8,
        marginBottom: 16,
        fontSize: 14,
    },
    filterBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        padding: '16px 20px',
        background: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    tabGroup: {
        display: 'flex',
        gap: 8,
    },
    select: {
        padding: '8px 12px',
        minWidth: 150,
    },
    loading: {
        textAlign: 'center',
        padding: 40,
        color: '#6B7280',
    },
    empty: {
        textAlign: 'center',
        padding: 80,
        color: '#6B7280',
    },
    tableContainer: {
        background: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    tableHeader: {
        background: '#F9FAFB',
        borderBottom: '1px solid #E5E7EB',
    },
    th: {
        padding: '12px 16px',
        textAlign: 'left',
        fontSize: 13,
        fontWeight: 600,
        color: '#6B7280',
    },
    tr: {
        borderBottom: '1px solid #F3F4F6',
    },
    td: {
        padding: '16px',
        fontSize: 14,
    },
    applicantName: {
        fontWeight: 600,
        color: '#1F2937',
    },
    applicantOrg: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    modal: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    modalContent: {
        background: '#FFFFFF',
        borderRadius: 12,
        padding: 24,
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 600,
        marginBottom: 24,
    },
    section: {
        marginBottom: 24,
        paddingBottom: 24,
        borderBottom: '1px solid #E5E7EB',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 600,
        marginBottom: 12,
        color: '#374151',
    },
    infoGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
    },
    infoLabel: {
        color: '#6B7280',
        fontWeight: 500,
        marginRight: 8,
    },
    infoValue: {
        color: '#374151',
    },
    zoneList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    zoneItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        background: '#F9FAFB',
        borderRadius: 6,
    },
    zoneDot: {
        width: 12,
        height: 12,
        borderRadius: '50%',
    },
    zoneCode: {
        fontSize: 12,
        color: '#6B7280',
        marginLeft: 'auto',
    },
    zoneActions: {
        display: 'flex',
        gap: 4,
    },
    reviewOptions: {
        display: 'flex',
        gap: 24,
        marginBottom: 16,
    },
    reviewOption: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
    },
    reviewOptionLabel: {
        fontSize: 14,
        color: '#374151',
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    label: {
        fontSize: 14,
        fontWeight: 500,
        color: '#374151',
    },
    input: {
        padding: '10px 12px',
        border: '1px solid #D1D5DB',
        borderRadius: 6,
        fontSize: 14,
    },
    modalActions: {
        display: 'flex',
        gap: 12,
        justifyContent: 'flex-end',
    },
    emptyText: {
        color: '#6B7280',
        fontSize: 14,
    },
}

export default CredentialReviewPage
