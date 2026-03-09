import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import bibTrackingApi from '../../api/bibTracking'
import racesApi from '../../api/races'
import useAuthStore from '../../stores/authStore'

const STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'receipt_printed', label: '已出回执' },
    { value: 'picked_up', label: '已领取' },
    { value: 'checked_in', label: '已检录' },
    { value: 'finished', label: '已完赛' },
]

const STATUS_LABELS = {
    receipt_printed: '已出回执',
    picked_up: '已领取',
    checked_in: '已检录',
    finished: '已完赛',
}

const STATUS_BADGE_STYLES = {
    receipt_printed: {
        background: 'var(--badge-yellow-bg, #fef3c7)',
        color: 'var(--badge-yellow-text, #92400e)',
    },
    picked_up: {
        background: 'var(--badge-blue-bg, #dbeafe)',
        color: 'var(--badge-blue-text, #1d4ed8)',
    },
    checked_in: {
        background: 'var(--badge-purple-bg, #e9d5ff)',
        color: 'var(--badge-purple-text, #6d28d9)',
    },
    finished: {
        background: 'var(--badge-green-bg, #dcfce7)',
        color: 'var(--badge-green-text, #166534)',
    },
}

const EMPTY_STATS = {
    totalTracked: 0,
    receiptPrinted: 0,
    pickedUp: 0,
    checkedIn: 0,
    finished: 0,
}

const PAGE_LIMIT = 20

function formatDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('zh-CN')
}

function statusLabel(value) {
    return STATUS_LABELS[value] || value || '-'
}

function statusBadgeStyle(value) {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 88,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        ...STATUS_BADGE_STYLES[value],
    }
}

function BibTrackingPage() {
    const { user } = useAuthStore()
    const isSuperAdmin = user?.role === 'super_admin'
    const [searchParams, setSearchParams] = useSearchParams()

    const selectedOrgId = searchParams.get('orgId') || ''
    const selectedRaceId = searchParams.get('raceId') || ''
    const statusParam = searchParams.get('status') || ''
    const keywordParam = searchParams.get('keyword') || ''
    const currentPage = Math.max(1, Number(searchParams.get('page') || 1))

    const [races, setRaces] = useState([])
    const [stats, setStats] = useState(EMPTY_STATS)
    const [items, setItems] = useState([])
    const [total, setTotal] = useState(0)
    const [loadingRaces, setLoadingRaces] = useState(true)
    const [loadingData, setLoadingData] = useState(false)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [rollingBack, setRollingBack] = useState(false)
    const [message, setMessage] = useState('')
    const [draftKeyword, setDraftKeyword] = useState(keywordParam)
    const [draftStatus, setDraftStatus] = useState(statusParam)
    const [detail, setDetail] = useState(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailNotice, setDetailNotice] = useState(null)
    const [rollbackReason, setRollbackReason] = useState('')

    useEffect(() => {
        setDraftKeyword(keywordParam)
    }, [keywordParam])

    useEffect(() => {
        setDraftStatus(statusParam)
    }, [statusParam])

    useEffect(() => {
        let cancelled = false
        setLoadingRaces(true)

        const params = isSuperAdmin && selectedOrgId ? { orgId: selectedOrgId } : undefined

        racesApi.getAll(params)
            .then((res) => {
                if (cancelled || !res.success) return

                const nextRaces = res.data || []
                setRaces(nextRaces)

                if (!selectedRaceId) return
                const exists = nextRaces.some((race) => String(race.id) === String(selectedRaceId))
                if (!exists) {
                    const nextParams = new URLSearchParams(searchParams)
                    nextParams.delete('raceId')
                    nextParams.delete('page')
                    if (!cancelled) {
                        setSearchParams(nextParams)
                        setDetail(null)
                        setDetailOpen(false)
                    }
                }
            })
            .catch((err) => {
                if (!cancelled) setMessage(`加载赛事失败：${err.message}`)
            })
            .finally(() => {
                if (!cancelled) setLoadingRaces(false)
            })

        return () => {
            cancelled = true
        }
    }, [isSuperAdmin, selectedOrgId, selectedRaceId, setSearchParams])

    useEffect(() => {
        if (!selectedRaceId) {
            setStats(EMPTY_STATS)
            setItems([])
            setTotal(0)
            setLoadingData(false)
            return
        }

        if (races.length > 0 && !races.some((race) => String(race.id) === String(selectedRaceId))) {
            return
        }

        let cancelled = false
        setLoadingData(true)
        setMessage('')

        Promise.all([
            bibTrackingApi.getStats(selectedRaceId),
            bibTrackingApi.listItems(selectedRaceId, {
                status: statusParam || undefined,
                keyword: keywordParam || undefined,
                page: currentPage,
                limit: PAGE_LIMIT,
            }),
        ])
            .then(([statsRes, listRes]) => {
                if (cancelled) return
                if (statsRes.success) setStats(statsRes.data || EMPTY_STATS)
                if (listRes.success) {
                    setItems(listRes.data.items || [])
                    setTotal(Number(listRes.data.total || 0))
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setStats(EMPTY_STATS)
                    setItems([])
                    setTotal(0)
                    setMessage(`加载号码布状态失败：${err.message}`)
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingData(false)
            })

        return () => {
            cancelled = true
        }
    }, [selectedRaceId, statusParam, keywordParam, currentPage, races])

    const applyParams = (mutator) => {
        const nextParams = new URLSearchParams(searchParams)
        mutator(nextParams)
        setSearchParams(nextParams)
    }

    const closeDetail = () => {
        setDetailOpen(false)
        setDetail(null)
        setDetailNotice(null)
        setRollbackReason('')
    }

    const handleRaceChange = (event) => {
        const raceId = event.target.value
        applyParams((params) => {
            if (raceId) params.set('raceId', raceId)
            else params.delete('raceId')
            params.delete('page')
        })
        closeDetail()
    }

    const handleSearch = (event) => {
        event.preventDefault()
        applyParams((params) => {
            if (draftStatus) params.set('status', draftStatus)
            else params.delete('status')

            if (draftKeyword.trim()) params.set('keyword', draftKeyword.trim())
            else params.delete('keyword')

            params.delete('page')
        })
    }

    const handleReset = () => {
        setDraftKeyword('')
        setDraftStatus('')
        applyParams((params) => {
            params.delete('status')
            params.delete('keyword')
            params.delete('page')
        })
    }

    const handleRefresh = () => {
        if (!selectedRaceId) return

        setLoadingData(true)
        setMessage('')
        Promise.all([
            bibTrackingApi.getStats(selectedRaceId),
            bibTrackingApi.listItems(selectedRaceId, {
                status: statusParam || undefined,
                keyword: keywordParam || undefined,
                page: currentPage,
                limit: PAGE_LIMIT,
            }),
        ])
            .then(([statsRes, listRes]) => {
                if (statsRes.success) setStats(statsRes.data || EMPTY_STATS)
                if (listRes.success) {
                    setItems(listRes.data.items || [])
                    setTotal(Number(listRes.data.total || 0))
                }
            })
            .catch((err) => {
                setMessage(`刷新失败：${err.message}`)
            })
            .finally(() => setLoadingData(false))
    }

    const handlePageChange = (nextPage) => {
        applyParams((params) => {
            if (nextPage <= 1) params.delete('page')
            else params.set('page', String(nextPage))
        })
    }

    const loadDetail = async (itemId) => {
        setLoadingDetail(true)
        setDetail(null)
        try {
            const res = await bibTrackingApi.getItemDetail(selectedRaceId, itemId)
            if (res.success) setDetail(res.data)
        } catch (err) {
            setDetail({
                error: err.message || '加载详情失败',
            })
        } finally {
            setLoadingDetail(false)
        }
    }

    const handleOpenDetail = async (itemId) => {
        if (!selectedRaceId) return
        setDetailNotice(null)
        setRollbackReason('')
        setDetailOpen(true)
        await loadDetail(itemId)
    }

    const handleRollback = async () => {
        if (!selectedRaceId || !detail?.item?.itemId || !detail?.rollbackAction?.canRollback) return

        setRollingBack(true)
        setDetailNotice(null)
        try {
            const res = await bibTrackingApi.rollbackStatus(selectedRaceId, detail.item.itemId, {
                reason: rollbackReason.trim() || undefined,
            })
            if (res.success) {
                setDetail(res.data)
                setRollbackReason('')
                setDetailNotice({
                    type: 'success',
                    text: '状态已撤回，已记录撤回时间和操作账号。',
                })
            }

            setLoadingData(true)
            try {
                const [statsRes, listRes] = await Promise.all([
                    bibTrackingApi.getStats(selectedRaceId),
                    bibTrackingApi.listItems(selectedRaceId, {
                        status: statusParam || undefined,
                        keyword: keywordParam || undefined,
                        page: currentPage,
                        limit: PAGE_LIMIT,
                    }),
                ])
                if (statsRes.success) setStats(statsRes.data || EMPTY_STATS)
                if (listRes.success) {
                    setItems(listRes.data.items || [])
                    setTotal(Number(listRes.data.total || 0))
                }
            } catch (refreshErr) {
                setMessage(`撤回后刷新列表失败：${refreshErr.message}`)
            }
        } catch (err) {
            setDetailNotice({
                type: 'error',
                text: `撤回失败：${err.message}`,
            })
        } finally {
            setRollingBack(false)
            setLoadingData(false)
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT))
    const hasValidRace = selectedRaceId && races.some((race) => String(race.id) === String(selectedRaceId))

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>号码布状态</h1>
                    <div style={{ fontSize: 14, color: 'var(--color-text-secondary, #666)', marginTop: 6 }}>
                        按赛事查看号码布当前状态、搜索命中并追踪状态时间线。
                    </div>
                </div>
                <button type="button" className="btn btn--secondary" onClick={handleRefresh} disabled={!hasValidRace || loadingData}>
                    刷新
                </button>
            </div>

            {isSuperAdmin && !selectedOrgId && (
                <div style={warningStyle}>
                    未选择机构：当前可从全部可见赛事中选择目标赛事。
                </div>
            )}

            {message && (
                <div style={errorStyle}>{message}</div>
            )}

            <div style={panelStyle}>
                <form onSubmit={handleSearch} className="bib-tracking-filters">
                    <div>
                        <label style={labelStyle} htmlFor="bib-race">赛事</label>
                        <select
                            id="bib-race"
                            className="input"
                            value={selectedRaceId}
                            onChange={handleRaceChange}
                            disabled={loadingRaces}
                        >
                            <option value="">{loadingRaces ? '加载赛事中...' : '请选择赛事'}</option>
                            {races.map((race) => (
                                <option key={race.id} value={race.id}>
                                    {race.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={labelStyle} htmlFor="bib-status">状态</label>
                        <select
                            id="bib-status"
                            className="input"
                            value={draftStatus}
                            onChange={(event) => setDraftStatus(event.target.value)}
                        >
                            {STATUS_OPTIONS.map((option) => (
                                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="bib-tracking-filters__keyword">
                        <label style={labelStyle} htmlFor="bib-keyword">关键词</label>
                        <input
                            id="bib-keyword"
                            className="input"
                            placeholder="号码布 / 姓名 / 证件号 / 手机号"
                            value={draftKeyword}
                            onChange={(event) => setDraftKeyword(event.target.value)}
                        />
                    </div>

                    <div className="bib-tracking-filters__actions">
                        <button type="submit" className="btn btn--primary" disabled={!selectedRaceId}>查询</button>
                        <button type="button" className="btn btn--ghost" onClick={handleReset}>重置</button>
                    </div>
                </form>
            </div>

            {!hasValidRace ? (
                <div style={{ ...panelStyle, padding: '40px 24px', textAlign: 'center', color: 'var(--color-text-secondary, #666)' }}>
                    {loadingRaces ? '正在加载赛事列表...' : (races.length === 0 ? '当前机构下没有可查看的赛事。' : '请选择一个赛事后查看号码布状态。')}
                </div>
            ) : (
                <>
                    <div className="bib-tracking-stats">
                        <StatCard title="总追踪数" value={stats.totalTracked} />
                        <StatCard title="已出回执" value={stats.receiptPrinted} />
                        <StatCard title="已领取" value={stats.pickedUp} />
                        <StatCard title="已检录" value={stats.checkedIn} />
                        <StatCard title="已完赛" value={stats.finished} />
                    </div>

                    <div style={panelStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>号码布列表</div>
                            <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>
                                共 {total.toLocaleString()} 条
                            </div>
                        </div>

                        <div className="bib-tracking-table">
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-bg-secondary, #f8fafc)', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                                        <th style={thStyle}>号码布</th>
                                        <th style={thStyle}>姓名</th>
                                        <th style={thStyle}>手机号</th>
                                        <th style={thStyle}>证件号</th>
                                        <th style={thStyle}>状态</th>
                                        <th style={thStyle}>出回执</th>
                                        <th style={thStyle}>领取</th>
                                        <th style={thStyle}>检录</th>
                                        <th style={thStyle}>完赛</th>
                                        <th style={thStyle}>最近状态时间</th>
                                        <th style={thStyle}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingData ? (
                                        <tr>
                                            <td colSpan={11} style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary, #666)' }}>
                                                加载中...
                                            </td>
                                        </tr>
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary, #666)' }}>
                                                暂无符合条件的号码布记录
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item) => (
                                            <tr key={item.itemId} style={{ borderBottom: '1px solid var(--color-border, #f1f5f9)' }}>
                                                <td style={tdStyle}><strong>{item.bibNumber}</strong></td>
                                                <td style={tdStyle}>{item.name || '-'}</td>
                                                <td style={tdStyle}>{item.phoneMasked || '-'}</td>
                                                <td style={tdStyle}>{item.idNumberMasked || '-'}</td>
                                                <td style={tdStyle}>
                                                    <span style={statusBadgeStyle(item.status)}>{statusLabel(item.status)}</span>
                                                </td>
                                                <td style={tdStyle}>{formatDateTime(item.receiptPrintedAt)}</td>
                                                <td style={tdStyle}>{formatDateTime(item.pickedUpAt)}</td>
                                                <td style={tdStyle}>{formatDateTime(item.checkedInAt)}</td>
                                                <td style={tdStyle}>{formatDateTime(item.finishedAt)}</td>
                                                <td style={tdStyle}>{formatDateTime(item.latestStatusAt)}</td>
                                                <td style={tdStyle}>
                                                    <button type="button" className="btn btn--ghost btn--sm bib-tracking-focusable" onClick={() => handleOpenDetail(item.itemId)}>
                                                        查看详情
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {total > PAGE_LIMIT && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
                                <button
                                    type="button"
                                    className="btn btn--ghost btn--sm"
                                    disabled={currentPage <= 1}
                                    onClick={() => handlePageChange(currentPage - 1)}
                                >
                                    上一页
                                </button>
                                <span style={{ fontSize: 14 }}>
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn--ghost btn--sm"
                                    disabled={currentPage >= totalPages}
                                    onClick={() => handlePageChange(currentPage + 1)}
                                >
                                    下一页
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {detailOpen && (
                <div className="bib-tracking-drawer-overlay" onClick={closeDetail}>
                    <aside className="bib-tracking-drawer" onClick={(event) => event.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>号码布详情</div>
                                <div style={{ fontSize: 22, fontWeight: 700 }}>{detail?.item?.bibNumber || '-'}</div>
                            </div>
                            <button type="button" className="btn btn--ghost bib-tracking-focusable" onClick={closeDetail}>
                                关闭
                            </button>
                        </div>

                        {loadingDetail && <div style={{ color: 'var(--color-text-secondary, #666)' }}>正在加载详情...</div>}

                        {!loadingDetail && detail?.error && (
                            <div style={errorStyle}>{detail.error}</div>
                        )}

                        {!loadingDetail && detail?.item && (
                            <>
                                {detailNotice && (
                                    <div style={detailNotice.type === 'error' ? errorStyle : successStyle}>
                                        {detailNotice.text}
                                    </div>
                                )}

                                <div className="bib-tracking-detail-grid">
                                    <DetailField label="姓名" value={detail.item.name || '-'} />
                                    <DetailField label="状态" value={statusLabel(detail.item.status)} />
                                    <DetailField label="手机号" value={detail.item.phone || '-'} />
                                    <DetailField label="证件号" value={detail.item.idNumber || '-'} />
                                    <DetailField label="出回执" value={formatDateTime(detail.item.receiptPrintedAt)} />
                                    <DetailField label="领取" value={formatDateTime(detail.item.pickedUpAt)} />
                                    <DetailField label="检录" value={formatDateTime(detail.item.checkedInAt)} />
                                    <DetailField label="完赛" value={formatDateTime(detail.item.finishedAt)} />
                                    <DetailField label="最近状态时间" value={formatDateTime(detail.item.latestStatusAt)} />
                                    <DetailField label="最近扫码人" value={detail.item.lastScanByName || '-'} />
                                    <DetailField label="最近撤回时间" value={formatDateTime(detail.lastRollback?.occurredAt)} />
                                    <DetailField label="最近撤回人" value={detail.lastRollback?.operatorName || '-'} />
                                </div>

                                <div style={{ marginTop: 20 }}>
                                    <div style={{ ...panelStyle, padding: 16, boxShadow: 'none', border: '1px solid var(--color-border, #e5e7eb)' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>状态管理</div>
                                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)', marginBottom: 12 }}>
                                            仅支持按状态回退一步，用于撤回误扫描。每次撤回都会记录操作时间和账号。
                                        </div>

                                        {detail.rollbackAction?.canRollback ? (
                                            <>
                                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                                                    当前可从“{detail.rollbackAction.fromStatusLabel}”撤回到“{detail.rollbackAction.targetStatusLabel}”
                                                </div>
                                                <label style={labelStyle} htmlFor="bib-rollback-reason">撤回原因（选填）</label>
                                                <textarea
                                                    id="bib-rollback-reason"
                                                    value={rollbackReason}
                                                    maxLength={200}
                                                    onChange={(event) => setRollbackReason(event.target.value)}
                                                    placeholder="例如：窗口误扫、重复检录、完赛枪误同步"
                                                    style={textareaStyle}
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                                                        {rollbackReason.trim().length}/200
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="btn btn--primary bib-tracking-focusable"
                                                        onClick={handleRollback}
                                                        disabled={rollingBack}
                                                    >
                                                        {rollingBack ? '撤回中...' : detail.rollbackAction.actionLabel}
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <div style={infoStyle}>
                                                当前状态不能继续撤回。
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ marginTop: 20 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>撤回记录</div>
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        {(detail.rollbackHistory || []).map((entry) => (
                                            <div key={entry.id} style={{ border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 12, padding: 14 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                                                        {entry.fromStatusLabel} → {entry.toStatusLabel}
                                                    </div>
                                                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>
                                                        {formatDateTime(entry.occurredAt)}
                                                    </span>
                                                </div>
                                                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>
                                                    操作人：{entry.operatorName || '-'} · 来源：{entry.source || '-'}
                                                </div>
                                                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>
                                                    原因：{entry.reason || '-'}
                                                </div>
                                            </div>
                                        ))}
                                        {(!detail.rollbackHistory || detail.rollbackHistory.length === 0) && (
                                            <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>暂无撤回记录</div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ marginTop: 20 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>状态时间线</div>
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        {(detail.timeline || []).map((entry) => (
                                            <div key={entry.status} style={{ border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 12, padding: 14 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                                    <span style={statusBadgeStyle(entry.status)}>{entry.label}</span>
                                                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>{formatDateTime(entry.occurredAt)}</span>
                                                </div>
                                                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>
                                                    操作人：{entry.operatorName || '-'} · 来源：{entry.source || '-'}
                                                </div>
                                            </div>
                                        ))}
                                        {(!detail.timeline || detail.timeline.length === 0) && (
                                            <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>暂无状态时间线</div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </aside>
                </div>
            )}

            <style>{`
                .bib-tracking-filters {
                    display: grid;
                    grid-template-columns: 220px 160px minmax(240px, 1fr) auto;
                    gap: 12px;
                    align-items: end;
                }
                .bib-tracking-filters__keyword {
                    min-width: 0;
                }
                .bib-tracking-filters__actions {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .bib-tracking-stats {
                    display: grid;
                    grid-template-columns: repeat(5, minmax(0, 1fr));
                    gap: 12px;
                    margin: 20px 0;
                }
                .bib-tracking-table {
                    overflow-x: auto;
                }
                .bib-tracking-drawer-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.3);
                    display: flex;
                    justify-content: flex-end;
                    z-index: 50;
                }
                .bib-tracking-drawer {
                    width: min(520px, 100%);
                    height: 100%;
                    background: #fff;
                    padding: 24px;
                    overflow-y: auto;
                    display: grid;
                    align-content: start;
                    gap: 16px;
                    box-shadow: -8px 0 24px rgba(15, 23, 42, 0.12);
                }
                .bib-tracking-detail-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                }
                .bib-tracking-focusable:focus-visible,
                .bib-tracking-drawer button:focus-visible,
                .bib-tracking-filters .input:focus-visible,
                .bib-tracking-filters .btn:focus-visible {
                    outline: 2px solid var(--color-primary, #2563eb);
                    outline-offset: 2px;
                }
                @media (max-width: 1100px) {
                    .bib-tracking-stats {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (max-width: 900px) {
                    .bib-tracking-filters {
                        grid-template-columns: 1fr;
                    }
                    .bib-tracking-detail-grid {
                        grid-template-columns: 1fr;
                    }
                }
                @media (max-width: 640px) {
                    .bib-tracking-stats {
                        grid-template-columns: 1fr;
                    }
                    .bib-tracking-drawer {
                        width: 100%;
                        padding: 18px;
                    }
                }
            `}</style>
        </div>
    )
}

function StatCard({ title, value }) {
    return (
        <div style={panelStyle}>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)' }}>{title}</div>
            <div style={{ marginTop: 8, fontSize: 30, fontWeight: 800, color: 'var(--color-primary, #2563eb)' }}>
                {Number(value || 0).toLocaleString()}
            </div>
        </div>
    )
}

function DetailField({ label, value }) {
    return (
        <div style={{ border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>{value}</div>
        </div>
    )
}

const panelStyle = {
    background: 'var(--color-bg-card, #fff)',
    borderRadius: 14,
    padding: 18,
    boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
}

const warningStyle = {
    padding: '12px 16px',
    marginBottom: 16,
    borderRadius: 10,
    background: 'rgba(245,158,11,0.12)',
    color: 'var(--badge-yellow-text, #92400e)',
    fontSize: 14,
}

const errorStyle = {
    padding: '12px 16px',
    marginBottom: 16,
    borderRadius: 10,
    background: 'rgba(239,68,68,0.1)',
    color: 'var(--color-danger, #b91c1c)',
    fontSize: 14,
}

const successStyle = {
    padding: '12px 16px',
    marginBottom: 16,
    borderRadius: 10,
    background: 'rgba(34,197,94,0.12)',
    color: 'var(--badge-green-text, #166534)',
    fontSize: 14,
}

const infoStyle = {
    padding: '12px 16px',
    borderRadius: 10,
    background: 'var(--color-bg-secondary, #f8fafc)',
    color: 'var(--color-text-secondary, #475569)',
    fontSize: 14,
}

const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: 'var(--color-text-secondary, #555)',
}

const thStyle = {
    padding: '12px 14px',
    textAlign: 'left',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--color-text-secondary, #64748b)',
    whiteSpace: 'nowrap',
}

const tdStyle = {
    padding: '12px 14px',
    fontSize: 14,
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
}

const textareaStyle = {
    width: '100%',
    minHeight: 88,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--color-border, #d1d5db)',
    fontSize: 14,
    resize: 'vertical',
    boxSizing: 'border-box',
}

export default BibTrackingPage
