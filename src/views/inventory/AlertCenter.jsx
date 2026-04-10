import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { alertApi } from '../../services/inventoryApi'
import { showError, showSuccess } from '../../utils/toast'

const FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'unread', label: '未读' },
    { key: 'open', label: '待处理' },
    { key: 'resolved', label: '已解决' },
]

const severityLabelMap = {
    critical: '严重',
    warning: '警告',
    info: '信息',
}

const severityClassMap = {
    critical: 'warehouse-pill--critical',
    warning: 'warehouse-pill--warning',
}

export default function AlertCenter({ onChange }) {
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const highlightedAlertId = searchParams.get('alertId')
    const [alerts, setAlerts] = useState([])
    const [loading, setLoading] = useState(true)
    const [actingId, setActingId] = useState(null)
    const [filter, setFilter] = useState('all')

    const loadAlerts = async () => {
        setLoading(true)
        try {
            const params = { limit: 100 }
            if (selectedOrgId) params.orgId = selectedOrgId
            const result = await alertApi.getAlerts(params)
            setAlerts(result.data || [])
        } catch (error) {
            showError(`加载预警列表失败：${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadAlerts()
    }, [selectedOrgId])

    const filteredAlerts = useMemo(() => {
        const alertList = [...alerts]
        if (highlightedAlertId) {
            alertList.sort((left, right) => {
                if (String(left.id) === highlightedAlertId) return -1
                if (String(right.id) === highlightedAlertId) return 1
                return 0
            })
        }

        return alertList.filter((alert) => {
            if (filter === 'unread') return !alert.is_read
            if (filter === 'resolved') return alert.is_resolved
            if (filter === 'open') return !alert.is_resolved
            return true
        })
    }, [alerts, filter, highlightedAlertId])

    const unreadCount = alerts.filter((alert) => !alert.is_read).length
    const pendingCount = alerts.filter((alert) => !alert.is_resolved).length
    const resolvedCount = alerts.filter((alert) => alert.is_resolved).length

    const handleMarkAsRead = async (id) => {
        setActingId(id)
        try {
            await alertApi.markAsRead(id)
            showSuccess('已标记为已读')
            await loadAlerts()
            onChange?.()
        } catch (error) {
            showError(`标记已读失败：${error.message}`)
        } finally {
            setActingId(null)
        }
    }

    const handleMarkAsResolved = async (id) => {
        setActingId(id)
        try {
            await alertApi.markAsResolved(id)
            showSuccess('已标记为已解决')
            await loadAlerts()
            onChange?.()
        } catch (error) {
            showError(`更新预警状态失败：${error.message}`)
        } finally {
            setActingId(null)
        }
    }

    const handleMarkAllAsRead = async () => {
        const unreadAlerts = alerts.filter((alert) => !alert.is_read)
        if (!unreadAlerts.length) return

        setActingId('all')
        try {
            await Promise.all(unreadAlerts.map((alert) => alertApi.markAsRead(alert.id)))
            showSuccess('全部已标记为已读')
            await loadAlerts()
            onChange?.()
        } catch (error) {
            showError(`批量标记失败：${error.message}`)
        } finally {
            setActingId(null)
        }
    }

    if (loading) {
        return (
            <section className="warehouse-panel">
                <div className="loading-state">
                    <div className="loading-state__spinner" />
                    <p>正在同步预警中心...</p>
                </div>
            </section>
        )
    }

    return (
        <div className="warehouse-inline-stack">
            <section className="warehouse-panel">
                <div className="warehouse-panel__header">
                    <div>
                        <h3>预警收件箱</h3>
                        <div className="warehouse-panel__subtitle">所有异常都来自真实预警记录，不再回退到本地样本。</div>
                    </div>
                    <div className="warehouse-inline-actions">
                        {FILTERS.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                className={`warehouse-chip ${filter === item.key ? 'warehouse-chip--active' : ''}`}
                                onClick={() => setFilter(item.key)}
                            >
                                {item.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={handleMarkAllAsRead}
                            disabled={!unreadCount || actingId === 'all'}
                        >
                            全部标记已读
                        </button>
                    </div>
                </div>

                <div className="warehouse-card-grid warehouse-card-grid--triple">
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">未读预警</span>
                        <strong className="warehouse-stat-tile__value">{unreadCount}</strong>
                        <span className="warehouse-stat-tile__meta">需要先完成分拣和确认</span>
                    </div>
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">待处理</span>
                        <strong className="warehouse-stat-tile__value">{pendingCount}</strong>
                        <span className="warehouse-stat-tile__meta">仍会阻塞一线作业</span>
                    </div>
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">已解决</span>
                        <strong className="warehouse-stat-tile__value">{resolvedCount}</strong>
                        <span className="warehouse-stat-tile__meta">可回到报表页做复盘</span>
                    </div>
                </div>
            </section>

            <section className="warehouse-panel">
                <div className="warehouse-panel__header">
                    <h3>异常列表</h3>
                    <span className="warehouse-panel__subtitle">{filteredAlerts.length} 条记录</span>
                </div>

                {filteredAlerts.length ? (
                    <div className="warehouse-task-list">
                        {filteredAlerts.map((alert) => (
                            <article
                                key={alert.id}
                                className={`warehouse-task-item warehouse-task-item--static ${String(alert.id) === highlightedAlertId ? 'warehouse-list-card--highlight' : ''}`}
                            >
                                <div className="warehouse-task-item__top">
                                    <div>
                                        <div className="warehouse-task-item__title">{alert.title}</div>
                                        <div className="warehouse-task-item__meta">
                                            <span>{formatAlertType(alert.alert_type)}</span>
                                            <span>{formatDateTime(alert.created_at)}</span>
                                        </div>
                                    </div>
                                    <div className="warehouse-inline-actions">
                                        <span className={`warehouse-pill ${severityClassMap[alert.severity] || ''}`}>
                                            {severityLabelMap[alert.severity] || alert.severity}
                                        </span>
                                        <span className={`warehouse-pill ${alert.is_resolved ? 'warehouse-pill--success' : ''}`}>
                                            {alert.is_resolved ? '已解决' : '待处理'}
                                        </span>
                                    </div>
                                </div>

                                <p className="warehouse-list-card__content">{alert.content}</p>

                                <div className="warehouse-inline-actions">
                                    {!alert.is_read ? (
                                        <button
                                            type="button"
                                            className="btn btn--ghost btn--sm"
                                            onClick={() => handleMarkAsRead(alert.id)}
                                            disabled={actingId === alert.id}
                                        >
                                            标记已读
                                        </button>
                                    ) : null}
                                    {!alert.is_resolved ? (
                                        <button
                                            type="button"
                                            className="btn btn--primary btn--sm"
                                            onClick={() => handleMarkAsResolved(alert.id)}
                                            disabled={actingId === alert.id}
                                        >
                                            标记已解决
                                        </button>
                                    ) : null}
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="warehouse-empty-state">
                        <strong>当前筛选下没有预警</strong>
                        <span>异常中心已经和真实数据接通，没有命中的时候直接展示空状态。</span>
                    </div>
                )}
            </section>
        </div>
    )
}

function formatAlertType(type) {
    const labels = {
        low_stock: '低库存',
        expiring: '临近过期',
        slow_moving: '滞留物资',
        abnormal_loss: '异常损耗',
    }
    return labels[type] || type || '异常'
}

function formatDateTime(value) {
    if (!value) return '-'
    return new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}
