import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import bibTrackingApi from '../../api/bibTracking'
import racesApi from '../../api/races'
import useAuthStore from '../../stores/authStore'
import {
    CommandDataTable,
    CommandDetailPane,
    CommandEmptyState,
    CommandFilterBar,
    CommandMetricGrid,
    CommandNotice,
    CommandPanel,
    CommandShell,
    CommandStatusTag,
    CommandToolbar,
    ContextRequirementState,
} from '../../components/command/CommandPrimitives'


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

function statusTone(value) {
    switch (value) {
        case 'receipt_printed':
            return 'warning'
        case 'finished':
            return 'success'
        case 'picked_up':
        case 'checked_in':
        default:
            return 'neutral'
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
    const metrics = [
        { key: 'tracked', label: '总追踪数', value: stats.totalTracked, meta: '当前赛事已纳入状态追踪的人数。', pill: 'ALL' },
        { key: 'receipt', label: '已出回执', value: stats.receiptPrinted, meta: '已打印或生成回执。', pill: 'RCP' },
        { key: 'pickup', label: '已领取', value: stats.pickedUp, meta: '已完成号码布领取。', pill: 'PK' },
        { key: 'checkin', label: '已检录', value: stats.checkedIn, meta: '已通过检录节点。', pill: 'CHK' },
        { key: 'finish', label: '已完赛', value: stats.finished, meta: '已进入完赛状态。', pill: 'FIN' },
    ]

    return (
        <div className="command-page surface-admin">
            <CommandShell
                eyebrow="选手管理"
                title="号码布状态"
                summary="按赛事查看号码布状态、检索命中记录，并在同一页里追踪时间线与撤回动作。"
                actions={(
                    <button type="button" className="btn btn--secondary" onClick={handleRefresh} disabled={!hasValidRace || loadingData}>
                        刷新
                    </button>
                )}
            >
                <CommandMetricGrid items={metrics} />
            </CommandShell>

            {isSuperAdmin && !selectedOrgId && (
                <CommandNotice tone="warning">
                    未选择机构：当前可从全部可见赛事中选择目标赛事。
                </CommandNotice>
            )}

            {message && (
                <CommandNotice tone="danger">{message}</CommandNotice>
            )}

            <CommandPanel title="筛选条件" subtitle="先锁定赛事，再按状态或关键词查看号码布流转。">
                <CommandToolbar>
                    <form onSubmit={handleSearch} className="bib-tracking-filters">
                        <CommandFilterBar>
                            <div className="bib-tracking-field">
                                <label className="bib-tracking-label" htmlFor="bib-race">赛事</label>
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

                            <div className="bib-tracking-filter-grid">
                                <div className="bib-tracking-field">
                                    <label className="bib-tracking-label" htmlFor="bib-status">状态</label>
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

                                <div className="bib-tracking-field bib-tracking-filters__keyword">
                                    <label className="bib-tracking-label" htmlFor="bib-keyword">关键词</label>
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
                            </div>
                        </CommandFilterBar>
                    </form>
                </CommandToolbar>
            </CommandPanel>

            {!hasValidRace ? (
                <ContextRequirementState
                    title={loadingRaces ? '正在加载赛事列表...' : '请先选择赛事'}
                    description={loadingRaces ? '控制台正在同步可查看赛事。' : (races.length === 0 ? '当前机构下没有可查看的赛事。' : '请选择一个赛事后查看号码布状态。')}
                />
            ) : (
                <>
                    <CommandPanel title="号码布列表" subtitle="按状态节点、身份信息和时间线快速定位记录。">
                        <div className="bib-tracking-list-head">
                            <div className="bib-tracking-list-meta">
                                共 {total.toLocaleString()} 条
                            </div>
                        </div>

                        <CommandDataTable className="bib-tracking-table">
                            <table className="bib-tracking-table__table">
                                <thead>
                                    <tr>
                                        <th>号码布</th>
                                        <th>姓名</th>
                                        <th>手机号</th>
                                        <th>证件号</th>
                                        <th>状态</th>
                                        <th>出回执</th>
                                        <th>领取</th>
                                        <th>检录</th>
                                        <th>完赛</th>
                                        <th>最近状态时间</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingData ? (
                                        <tr>
                                            <td colSpan={11} className="bib-tracking-table__empty">
                                                加载中...
                                            </td>
                                        </tr>
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="bib-tracking-table__empty">
                                                <CommandEmptyState
                                                    title="暂无符合条件的号码布记录"
                                                    description="调整赛事、状态或关键词后再试一次。"
                                                    icon="BIB"
                                                />
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item) => (
                                            <tr key={item.itemId}>
                                                <td><strong>{item.bibNumber}</strong></td>
                                                <td>{item.name || '-'}</td>
                                                <td>{item.phoneMasked || '-'}</td>
                                                <td>{item.idNumberMasked || '-'}</td>
                                                <td>
                                                    <CommandStatusTag tone={statusTone(item.status)}>{statusLabel(item.status)}</CommandStatusTag>
                                                </td>
                                                <td>{formatDateTime(item.receiptPrintedAt)}</td>
                                                <td>{formatDateTime(item.pickedUpAt)}</td>
                                                <td>{formatDateTime(item.checkedInAt)}</td>
                                                <td>{formatDateTime(item.finishedAt)}</td>
                                                <td>{formatDateTime(item.latestStatusAt)}</td>
                                                <td>
                                                    <button type="button" className="btn btn--ghost btn--sm bib-tracking-focusable" onClick={() => handleOpenDetail(item.itemId)}>
                                                        查看详情
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </CommandDataTable>

                        {total > PAGE_LIMIT && (
                            <div className="bib-tracking-pagination">
                                <button
                                    type="button"
                                    className="btn btn--ghost btn--sm"
                                    disabled={currentPage <= 1}
                                    onClick={() => handlePageChange(currentPage - 1)}
                                >
                                    上一页
                                </button>
                                <span className="bib-tracking-pagination__status">
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
                    </CommandPanel>
                </>
            )}

            {detailOpen && (
                <div className="bib-tracking-drawer-overlay" onClick={closeDetail}>
                    <CommandDetailPane
                        className="bib-tracking-drawer"
                        title={detail?.item?.bibNumber || '-'}
                        subtitle="号码布详情"
                        actions={(
                            <button type="button" className="btn btn--ghost bib-tracking-focusable" onClick={closeDetail}>
                                关闭
                            </button>
                        )}
                    >
                        {loadingDetail ? <div className="bib-tracking-muted">正在加载详情...</div> : null}

                        {!loadingDetail && detail?.error ? (
                            <CommandNotice tone="danger">{detail.error}</CommandNotice>
                        ) : null}

                        {!loadingDetail && detail?.item ? (
                            <>
                                {detailNotice ? (
                                    <CommandNotice tone={detailNotice.type === 'error' ? 'danger' : 'success'}>
                                        {detailNotice.text}
                                    </CommandNotice>
                                ) : null}

                                <div className="bib-tracking-detail-grid">
                                    <DetailField label="姓名" value={detail.item.name || '-'} />
                                    <DetailField label="状态" value={<CommandStatusTag tone={statusTone(detail.item.status)}>{statusLabel(detail.item.status)}</CommandStatusTag>} />
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

                                <section className="bib-tracking-section">
                                    <div className="bib-tracking-section-card">
                                        <div className="bib-tracking-section-title">状态管理</div>
                                        <div className="bib-tracking-section-summary">
                                            仅支持按状态回退一步，用于撤回误扫描。每次撤回都会记录操作时间和账号。
                                        </div>

                                        {detail.rollbackAction?.canRollback ? (
                                            <>
                                                <div className="bib-tracking-rollback-copy">
                                                    当前可从“{detail.rollbackAction.fromStatusLabel}”撤回到“{detail.rollbackAction.targetStatusLabel}”
                                                </div>
                                                <label className="bib-tracking-label" htmlFor="bib-rollback-reason">撤回原因（选填）</label>
                                                <textarea
                                                    id="bib-rollback-reason"
                                                    value={rollbackReason}
                                                    maxLength={200}
                                                    onChange={(event) => setRollbackReason(event.target.value)}
                                                    placeholder="例如：窗口误扫、重复检录、完赛枪误同步"
                                                    className="bib-tracking-textarea"
                                                />
                                                <div className="bib-tracking-rollback-actions">
                                                    <div className="bib-tracking-muted">
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
                                            <CommandNotice tone="info">
                                                当前状态不能继续撤回。
                                            </CommandNotice>
                                        )}
                                    </div>
                                </section>

                                <section className="bib-tracking-section">
                                    <div className="bib-tracking-section-title">撤回记录</div>
                                    <div className="bib-tracking-stack">
                                        {(detail.rollbackHistory || []).map((entry) => (
                                            <article key={entry.id} className="bib-tracking-timeline-card">
                                                <div className="bib-tracking-timeline-card__head">
                                                    <div className="bib-tracking-timeline-card__title">
                                                        {entry.fromStatusLabel} → {entry.toStatusLabel}
                                                    </div>
                                                    <span className="bib-tracking-muted">{formatDateTime(entry.occurredAt)}</span>
                                                </div>
                                                <div className="bib-tracking-timeline-card__meta">
                                                    操作人：{entry.operatorName || '-'} · 来源：{entry.source || '-'}
                                                </div>
                                                <div className="bib-tracking-timeline-card__meta">
                                                    原因：{entry.reason || '-'}
                                                </div>
                                            </article>
                                        ))}
                                        {(!detail.rollbackHistory || detail.rollbackHistory.length === 0) ? (
                                            <div className="bib-tracking-muted">暂无撤回记录</div>
                                        ) : null}
                                    </div>
                                </section>

                                <section className="bib-tracking-section">
                                    <div className="bib-tracking-section-title">状态时间线</div>
                                    <div className="bib-tracking-stack">
                                        {(detail.timeline || []).map((entry) => (
                                            <article key={entry.status} className="bib-tracking-timeline-card">
                                                <div className="bib-tracking-timeline-card__head">
                                                    <CommandStatusTag tone={statusTone(entry.status)}>{entry.label}</CommandStatusTag>
                                                    <span className="bib-tracking-muted">{formatDateTime(entry.occurredAt)}</span>
                                                </div>
                                                <div className="bib-tracking-timeline-card__meta">
                                                    操作人：{entry.operatorName || '-'} · 来源：{entry.source || '-'}
                                                </div>
                                            </article>
                                        ))}
                                        {(!detail.timeline || detail.timeline.length === 0) ? (
                                            <div className="bib-tracking-muted">暂无状态时间线</div>
                                        ) : null}
                                    </div>
                                </section>
                            </>
                        ) : null}
                    </CommandDetailPane>
                </div>
            )}
        </div>
    )
}

function DetailField({ label, value }) {
    return (
        <div className="bib-tracking-detail-field">
            <div className="bib-tracking-detail-field__label">{label}</div>
            <div className="bib-tracking-detail-field__value">{value}</div>
        </div>
    )
}

export default BibTrackingPage
