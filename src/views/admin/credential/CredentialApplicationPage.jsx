/**
 * CredentialApplicationPage.jsx
 * ===============================
 * 证件申请页面
 * 
 * 功能：
 * - 用户提交证件申请
 * - 选择岗位模板
 * - 填写个人信息
 * - 查看申请状态
 */

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import credentialApi from '../../../api/credential'
import useAuthStore from '../../../stores/authStore'

const STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'draft', label: '草稿' },
    { value: 'submitted', label: '已提交' },
    { value: 'under_review', label: '审核中' },
    { value: 'approved', label: '已通过' },
    { value: 'rejected', label: '已驳回' },
    { value: 'generated', label: '已生成' },
]

const STATUS_BADGE_STYLES = {
    draft: { background: '#F3F4F6', color: '#6B7280' },
    submitted: { background: '#DBEAFE', color: '#1E40AF' },
    under_review: { background: '#FEF3C7', color: '#92400E' },
    approved: { background: '#DCFCE7', color: '#166534' },
    rejected: { background: '#FEE2E2', color: '#991B1B' },
    generated: { background: '#E0E7FF', color: '#3730A3' },
}

function CredentialApplicationPage() {
    const { user } = useAuthStore()
    const [searchParams, setSearchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')

    const [roleTemplates, setRoleTemplates] = useState([])
    const [applications, setApplications] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState({
        roleTemplateId: '',
        personName: user?.name || '',
        orgName: '',
        remark: '',
    })

    const [selectedApplication, setSelectedApplication] = useState(null)
    const [showDetail, setShowDetail] = useState(false)

    // 加载岗位模板
    useEffect(() => {
        if (!raceId) return

        const loadData = async () => {
            setLoading(true)
            try {
                const [templatesRes, applicationsRes] = await Promise.all([
                    credentialApi.getRoleTemplates(raceId),
                    credentialApi.getApplications(raceId),
                ])

                if (templatesRes.success) {
                    setRoleTemplates(templatesRes.data || [])
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
    }, [raceId])

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!form.roleTemplateId) {
            setMessage('请选择岗位')
            return
        }

        if (!form.personName.trim()) {
            setMessage('请填写姓名')
            return
        }

        setSaving(true)
        setMessage('')

        try {
            await credentialApi.createApplication(raceId, {
                roleTemplateId: Number(form.roleTemplateId),
                personName: form.personName,
                orgName: form.orgName.trim(),
                remark: form.remark.trim(),
            })
            setMessage('申请提交成功')
            setShowForm(false)
            setForm({
                roleTemplateId: '',
                personName: user?.name || '',
                orgName: '',
                remark: '',
            })
            // 重新加载列表
            const applicationsRes = await credentialApi.getApplications(raceId)
            if (applicationsRes.success) {
                setApplications(applicationsRes.data || [])
            }
        } catch (err) {
            setMessage(`提交失败：${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    const handleViewDetail = async (app) => {
        try {
            const detail = await credentialApi.getApplication(raceId, app.id)
            setSelectedApplication(detail.data)
            setShowDetail(true)
        } catch (err) {
            setMessage(`加载详情失败：${err.message}`)
        }
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

    const myApplications = applications.filter(
        (app) => app.applicantUserId === user?.id || user?.role === 'super_admin'
    )

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>证件申请</h1>
                <button
                    className="btn btn--primary"
                    onClick={() => setShowForm(true)}
                    disabled={myApplications.length > 0}
                >
                    新建申请
                </button>
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

            {loading ? (
                <div style={styles.loading}>加载中...</div>
            ) : myApplications.length === 0 ? (
                <div style={styles.empty}>
                    <p>暂无申请记录</p>
                    <button
                        className="btn btn--primary"
                        onClick={() => setShowForm(true)}
                    >
                        创建第一个申请
                    </button>
                </div>
            ) : (
                <div style={styles.grid}>
                    {myApplications.map((app) => (
                        <div key={app.id} style={styles.card}>
                            <div style={styles.cardHeader}>
                                <div>
                                    <div style={styles.cardTitle}>{app.roleName}</div>
                                    <div style={styles.cardMeta}>{app.personName}</div>
                                </div>
                                <span style={statusBadgeStyle(app.status)}>
                                    {STATUS_OPTIONS.find((s) => s.value === app.status)?.label || app.status}
                                </span>
                            </div>

                            <div style={styles.cardBody}>
                                <div style={styles.infoRow}>
                                    <span style={styles.infoLabel}>申请时间:</span>
                                    <span style={styles.infoValue}>
                                        {new Date(app.createdAt).toLocaleString('zh-CN')}
                                    </span>
                                </div>
                                {app.reviewRemark && (
                                    <div style={styles.infoRow}>
                                        <span style={styles.infoLabel}>审核意见:</span>
                                        <span style={styles.infoValue}>{app.reviewRemark}</span>
                                    </div>
                                )}
                                {app.rejectReason && (
                                    <div style={styles.infoRow}>
                                        <span style={styles.infoLabel}>驳回原因:</span>
                                        <span style={{ ...styles.infoValue, color: '#DC2626' }}>
                                            {app.rejectReason}
                                        </span>
                                    </div>
                                )}
                                {app.credentialNo && (
                                    <div style={styles.infoRow}>
                                        <span style={styles.infoLabel}>证件编号:</span>
                                        <span style={styles.infoValue}>{app.credentialNo}</span>
                                    </div>
                                )}
                            </div>

                            <div style={styles.cardFooter}>
                                <button
                                    className="btn btn--ghost btn--sm"
                                    onClick={() => handleViewDetail(app)}
                                >
                                    查看详情
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 申请表单对话框 */}
            {showForm && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h2 style={styles.modalTitle}>新建证件申请</h2>
                        <form onSubmit={handleSubmit} style={styles.form}>
                            <div style={styles.field}>
                                <label style={styles.label}>选择岗位 *</label>
                                <select
                                    className="input"
                                    value={form.roleTemplateId}
                                    onChange={(e) => setForm({ ...form, roleTemplateId: e.target.value })}
                                    style={styles.select}
                                    required
                                >
                                    <option value="">请选择岗位</option>
                                    {roleTemplates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.roleName} {t.requiresReview ? '(需审核)' : '(自动通过)'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>姓名 *</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={form.personName}
                                    onChange={(e) => setForm({ ...form, personName: e.target.value })}
                                    style={styles.input}
                                    required
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>单位名称</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={form.orgName}
                                    onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                                    style={styles.input}
                                    placeholder="可选"
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>备注</label>
                                <textarea
                                    className="input"
                                    value={form.remark}
                                    onChange={(e) => setForm({ ...form, remark: e.target.value })}
                                    style={{ ...styles.input, minHeight: 80 }}
                                    placeholder="可选"
                                />
                            </div>

                            <div style={styles.modalActions}>
                                <button
                                    type="button"
                                    className="btn btn--ghost"
                                    onClick={() => setShowForm(false)}
                                    disabled={saving}
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn--primary"
                                    disabled={saving}
                                >
                                    {saving ? '提交中...' : '提交申请'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 详情对话框 */}
            {showDetail && selectedApplication && (
                <div style={styles.modal}>
                    <div style={{ ...styles.modalContent, maxWidth: 700 }}>
                        <h2 style={styles.modalTitle}>申请详情</h2>
                        <div style={styles.detailContent}>
                            <div style={styles.detailRow}>
                                <span style={styles.detailLabel}>岗位:</span>
                                <span style={styles.detailValue}>{selectedApplication.roleName}</span>
                            </div>
                            <div style={styles.detailRow}>
                                <span style={styles.detailLabel}>申请人:</span>
                                <span style={styles.detailValue}>{selectedApplication.personName}</span>
                            </div>
                            <div style={styles.detailRow}>
                                <span style={styles.detailLabel}>单位名称:</span>
                                <span style={styles.detailValue}>{selectedApplication.orgName || '-'}</span>
                            </div>
                            <div style={styles.detailRow}>
                                <span style={styles.detailLabel}>状态:</span>
                                <span style={statusBadgeStyle(selectedApplication.status)}>
                                    {STATUS_OPTIONS.find((s) => s.value === selectedApplication.status)?.label}
                                </span>
                            </div>
                            {selectedApplication.zoneOverrides && selectedApplication.zoneOverrides.length > 0 && (
                                <div style={styles.detailRow}>
                                    <span style={styles.detailLabel}>区域调整:</span>
                                    <div style={styles.zoneList}>
                                        {selectedApplication.zoneOverrides.map((override, idx) => (
                                            <span key={idx} style={styles.zoneTag}>
                                                {override.overrideType === 'add' ? '+' : '-'}{override.zoneCode}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selectedApplication.reviewRemark && (
                                <div style={styles.detailRow}>
                                    <span style={styles.detailLabel}>审核意见:</span>
                                    <span style={styles.detailValue}>{selectedApplication.reviewRemark}</span>
                                </div>
                            )}
                            {selectedApplication.rejectReason && (
                                <div style={styles.detailRow}>
                                    <span style={styles.detailLabel}>驳回原因:</span>
                                    <span style={{ ...styles.detailValue, color: '#DC2626' }}>
                                        {selectedApplication.rejectReason}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div style={styles.modalActions}>
                            <button
                                className="btn btn--ghost"
                                onClick={() => setShowDetail(false)}
                            >
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
    container: {
        padding: 24,
        maxWidth: 1200,
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
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 20,
    },
    card: {
        background: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '16px 20px',
        borderBottom: '1px solid #F3F4F6',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#1F2937',
        marginBottom: 4,
    },
    cardMeta: {
        fontSize: 13,
        color: '#6B7280',
    },
    cardBody: {
        padding: '16px 20px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    infoRow: {
        display: 'flex',
        gap: 12,
        fontSize: 14,
    },
    infoLabel: {
        color: '#6B7280',
        fontWeight: 500,
        minWidth: 70,
    },
    infoValue: {
        color: '#374151',
    },
    cardFooter: {
        display: 'flex',
        gap: 8,
        padding: '12px 20px',
        borderTop: '1px solid #F3F4F6',
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
        maxWidth: 500,
        maxHeight: '90vh',
        overflowY: 'auto',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 600,
        marginBottom: 20,
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
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
    select: {
        padding: '10px 12px',
        border: '1px solid #D1D5DB',
        borderRadius: 6,
        fontSize: 14,
    },
    modalActions: {
        display: 'flex',
        gap: 12,
        justifyContent: 'flex-end',
        marginTop: 20,
    },
    detailContent: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    detailRow: {
        display: 'flex',
        gap: 12,
        fontSize: 14,
        alignItems: 'center',
    },
    detailLabel: {
        color: '#6B7280',
        fontWeight: 500,
        minWidth: 80,
    },
    detailValue: {
        color: '#374151',
    },
    zoneList: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
    },
    zoneTag: {
        padding: '2px 8px',
        background: '#E0E7FF',
        color: '#3730A3',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
    },
}

export default CredentialApplicationPage
