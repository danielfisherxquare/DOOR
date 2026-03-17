import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import credentialApi from '../../../api/credential'
import styles from './CredentialIssuePage.module.css'

// DOOR 专属的领取管理页面，源自 TOOL 的 CredentialIssueView 重构
export default function CredentialIssuePage() {
    const [searchParams] = useSearchParams()
    const raceId = searchParams.get('raceId')

    const [credentials, setCredentials] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    // 领取弹窗状状态
    const [selectedCredential, setSelectedCredential] = useState(null)
    const [showIssueModal, setShowIssueModal] = useState(false)
    const [issuing, setIssuing] = useState(false)
    const [issueForm, setIssueForm] = useState({
        recipientName: '',
        recipientIdCard: '',
        remark: '',
    })

    // 加载证件列表
    useEffect(() => {
        if (!raceId) {
            setLoading(false)
            return
        }

        const loadCredentials = async () => {
            setLoading(true)
            try {
                const res = await credentialApi.getCredentials(raceId, { status: statusFilter || undefined })
                if (res.success) {
                    setCredentials(res.data.items || [])
                } else {
                    toast.error(res.message || '加载证件列表失败')
                }
            } catch (err) {
                toast.error('请求失败: ' + err.message)
            } finally {
                setLoading(false)
            }
        }

        loadCredentials()
    }, [raceId, statusFilter])

    // 本地搜索过滤
    const filteredCredentials = useMemo(() => {
        return credentials.filter((cred) => {
            const matchSearch = !searchKeyword ||
                (cred.personName && cred.personName.includes(searchKeyword)) ||
                (cred.credentialNo && cred.credentialNo.includes(searchKeyword)) ||
                (cred.categoryName && cred.categoryName.includes(searchKeyword))

            // API层已经处理了status过滤，这里保留以备双重验证或者无网络时的纯前端搜索
            const matchStatus = !statusFilter || cred.status === statusFilter

            return matchSearch && matchStatus
        })
    }, [credentials, searchKeyword, statusFilter])

    // 处理领取表单提交
    const handleIssue = async () => {
        if (!selectedCredential) return

        if (!issueForm.recipientName.trim()) {
            toast.warning('请填写领取人姓名')
            return
        }

        setIssuing(true)
        try {
            const res = await credentialApi.issueCredential(raceId, selectedCredential.id, {
                recipientName: issueForm.recipientName,
                recipientIdCard: issueForm.recipientIdCard,
                remark: issueForm.remark,
            })

            if (res.success) {
                toast.success('证件领取成功')
                setShowIssueModal(false)

                // 本地乐观更新列表，避免重新拉取全量数据
                setCredentials(prev => prev.map(c =>
                    c.id === selectedCredential.id
                        ? {
                            ...c,
                            status: 'issued',
                            issuedToUserName: issueForm.recipientName,
                            issuedAt: new Date().toISOString()
                        }
                        : c
                ))
            } else {
                toast.error(res.message || '领取失败')
            }
        } catch (err) {
            toast.error('请求失败: ' + err.message)
        } finally {
            setIssuing(false)
        }
    }

    // 打开确认弹窗
    const openIssueModal = (cred) => {
        if (cred.status === 'issued') {
            toast.info('该证件已领取')
            return
        }
        if (cred.status === 'voided') {
            toast.error('该证件已作废，无法领取')
            return
        }
        setSelectedCredential(cred)
        setIssueForm({
            recipientName: cred.personName || '',
            recipientIdCard: '',
            remark: ''
        })
        setShowIssueModal(true)
    }

    // 状态字典映射
    const statusLabels = {
        generated: '待打印',
        printed: '待领取',
        issued: '已领取',
        returned: '已归还',
        voided: '已作废',
    }

    const statusColors = {
        generated: { bg: '#e5e7eb', text: '#374151' },
        printed: { bg: '#dbeafe', text: '#1e40af' },
        issued: { bg: '#dcfce7', text: '#166534' },
        returned: { bg: '#fef3c7', text: '#92400e' },
        voided: { bg: '#fee2e2', text: '#991b1b' },
    }

    // 统计数值计算
    const stats = useMemo(() => {
        return {
            pending: credentials.filter(c => c.status === 'generated' || c.status === 'printed').length,
            issued: credentials.filter(c => c.status === 'issued').length,
            returned: credentials.filter(c => c.status === 'returned').length,
            voided: credentials.filter(c => c.status === 'voided').length,
        }
    }, [credentials])

    if (!raceId) {
        return <div className={styles.emptyState}>请先在顶部或左侧边栏选择赛事</div>
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h1 className={styles.title}>领取管理 (Issuance)</h1>
            </header>

            {/* 筛选栏 */}
            <div className={styles.filterBar}>
                <input
                    type="text"
                    placeholder="搜索姓名 / 编号 / 岗位"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="">全部状态</option>
                    <option value="generated">待打印 (Generated)</option>
                    <option value="printed">待领取 (Printed)</option>
                    <option value="issued">已领取 (Issued)</option>
                    <option value="returned">已归还 (Returned)</option>
                    <option value="voided">已作废 (Voided)</option>
                </select>
            </div>

            {/* 统计板 */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard} style={{ background: '#f8fafc' }}>
                    <div className={styles.statValue}>{stats.pending}</div>
                    <div className={styles.statLabel}>待领取 / 待处理</div>
                </div>
                <div className={styles.statCard} style={{ background: '#f0fdf4' }}>
                    <div className={styles.statValue} style={{ color: '#16a34a' }}>{stats.issued}</div>
                    <div className={styles.statLabel}>已领取 (有效中)</div>
                </div>
                <div className={styles.statCard} style={{ background: '#fffbeb' }}>
                    <div className={styles.statValue} style={{ color: '#d97706' }}>{stats.returned}</div>
                    <div className={styles.statLabel}>已归还</div>
                </div>
                <div className={styles.statCard} style={{ background: '#fef2f2' }}>
                    <div className={styles.statValue} style={{ color: '#dc2626' }}>{stats.voided}</div>
                    <div className={styles.statLabel}>已作废</div>
                </div>
            </div>

            {/* 数据表格 */}
            <div className={styles.card}>
                {loading ? (
                    <div className={styles.loadingState}>加载中...</div>
                ) : filteredCredentials.length === 0 ? (
                    <div className={styles.emptyState}>
                        暂无对应的证件记录。可能是该赛事还没有通过模板生成证件。
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>证件编号</th>
                                    <th>姓名</th>
                                    <th>岗位 / 身份</th>
                                    <th>单位</th>
                                    <th>可通行区域</th>
                                    <th>当前状态</th>
                                    <th>领用人</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCredentials.map(cred => {
                                    const sColor = statusColors[cred.status] || statusColors.generated
                                    return (
                                        <tr key={cred.id}>
                                            <td>{cred.credentialNo}</td>
                                            <td>{cred.personName}</td>
                                            <td>{cred.categoryName}</td>
                                            <td>{cred.orgName || '-'}</td>
                                            <td>
                                                {(cred.accessAreas || []).map(area => (
                                                    <span key={area.accessCode} className={styles.zoneChip}>
                                                        {area.accessCode}
                                                    </span>
                                                ))}
                                            </td>
                                            <td>
                                                <span
                                                    className={styles.badge}
                                                    style={{ backgroundColor: sColor.bg, color: sColor.text }}
                                                >
                                                    {statusLabels[cred.status] || cred.status}
                                                </span>
                                            </td>
                                            <td>{cred.issuedToUserName || '-'}</td>
                                            <td>
                                                <button
                                                    className={`btn btn--sm ${cred.status === 'issued' || cred.status === 'voided' ? 'btn--ghost' : 'btn--primary'}`}
                                                    onClick={() => openIssueModal(cred)}
                                                    disabled={cred.status === 'issued' || cred.status === 'voided'}
                                                >
                                                    {cred.status === 'issued' ? '已发放' : '点击发放'}
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 发放确认弹窗 */}
            {showIssueModal && selectedCredential && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: 540 }}>
                        <div className="modal__header">
                            <h2>证件领取确认</h2>
                            <button
                                className="modal__close"
                                onClick={() => setShowIssueModal(false)}
                                disabled={issuing}
                            >
                                &times;
                            </button>
                        </div>

                        <div className="modal__content">
                            <div className={styles.modalInfo}>
                                <div className={styles.infoRow}>
                                    <div className={styles.infoLabel}>证件编号</div>
                                    <div className={styles.infoValue}>{selectedCredential.credentialNo}</div>
                                </div>
                                <div className={styles.infoRow}>
                                    <div className={styles.infoLabel}>姓名</div>
                                    <div className={styles.infoValue}>{selectedCredential.personName}</div>
                                </div>
                                <div className={styles.infoRow}>
                                    <div className={styles.infoLabel}>岗位身份</div>
                                    <div className={styles.infoValue}>{selectedCredential.categoryName}</div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>领取人姓名 <span style={{ color: 'red' }}>*</span></label>
                                <input
                                    type="text"
                                    className="input"
                                    value={issueForm.recipientName}
                                    onChange={(e) => setIssueForm(prev => ({ ...prev, recipientName: e.target.value }))}
                                    placeholder="请输入实际领取该证件的人员姓名"
                                    disabled={issuing}
                                />
                            </div>

                            <div className="form-group">
                                <label>领取人身份证号 (选填)</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={issueForm.recipientIdCard}
                                    onChange={(e) => setIssueForm(prev => ({ ...prev, recipientIdCard: e.target.value }))}
                                    placeholder="用于严格的实名追溯"
                                    disabled={issuing}
                                />
                            </div>

                            <div className="form-group">
                                <label>发放备注 (选填)</label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    value={issueForm.remark}
                                    onChange={(e) => setIssueForm(prev => ({ ...prev, remark: e.target.value }))}
                                    placeholder="例如：代领人关系、遗失补发说明等"
                                    disabled={issuing}
                                />
                            </div>
                        </div>

                        <div className="modal__footer">
                            <button
                                className="btn btn--ghost"
                                onClick={() => setShowIssueModal(false)}
                                disabled={issuing}
                            >
                                取消
                            </button>
                            <button
                                className="btn btn--primary"
                                onClick={handleIssue}
                                disabled={issuing}
                            >
                                {issuing ? '处理中...' : '确认发证'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
