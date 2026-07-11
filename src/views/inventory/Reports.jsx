import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { workbenchApi } from '../../services/inventoryApi'
import { showError } from '../../utils/toast'
import StatusPill from '../../components/inventory/StatusPill'
import '../../components/inventory/workbench/workbench.css'
import './Reports.css'
import { useInventorySurface } from './useInventorySurface'

export default function Reports() {
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const { buildHref } = useInventorySurface()
    const [analytics, setAnalytics] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        workbenchApi.getAnalytics(selectedOrgId)
            .then((result) => setAnalytics(result.data))
            .catch((error) => showError(`加载仓储复盘失败：${error.message}`))
            .finally(() => setLoading(false))
    }, [selectedOrgId])

    const trend = useMemo(() => analytics?.trend || [], [analytics?.trend])
    const totalInbound = useMemo(
        () => trend.reduce((sum, item) => sum + Number(item.inbound || 0), 0),
        [trend]
    )
    const totalOutbound = useMemo(
        () => trend.reduce((sum, item) => sum + Number(item.outbound || 0), 0),
        [trend]
    )
    const maxTrendValue = useMemo(
        () => Math.max(1, ...trend.map((item) => Math.max(Number(item.inbound || 0), Number(item.outbound || 0)))),
        [trend]
    )

    if (loading) {
        return (
            <section className="warehouse-panel">
                <div className="loading-state">
                    <div className="loading-state__spinner" />
                    <p>正在生成仓储复盘视图...</p>
                </div>
            </section>
        )
    }

    return (
        <div className="warehouse-inline-stack">
            <section className="warehouse-panel">
                <div className="warehouse-panel__header">
                    <div>
                        <h1 className="page-title">复盘报表</h1>
                        <p className="warehouse-workbench__summary">趋势、结构分布和最近流转都改成真实接口，复盘页不再承担假总览的角色。</p>
                    </div>
                    <div className="warehouse-inline-actions">
                        <Link className="btn btn--ghost" to={buildHref('/inventory/control', { orgId: selectedOrgId, params: { tab: 'alerts' } })}>
                            查看异常中心
                        </Link>
                        <Link className="btn btn--primary" to={buildHref('/inventory', { orgId: selectedOrgId })}>
                            返回作业台
                        </Link>
                    </div>
                </div>

                <div className="warehouse-card-grid warehouse-card-grid--quad">
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">总库存</span>
                        <strong className="warehouse-stat-tile__value">{analytics?.statistics?.totalUnits || 0}</strong>
                        <span className="warehouse-stat-tile__meta">当前机构所有库存单元</span>
                    </div>
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">7 天入库</span>
                        <strong className="warehouse-stat-tile__value">{totalInbound}</strong>
                        <span className="warehouse-stat-tile__meta">来自真实流转趋势</span>
                    </div>
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">7 天出库</span>
                        <strong className="warehouse-stat-tile__value">{totalOutbound}</strong>
                        <span className="warehouse-stat-tile__meta">包含领取与分配动作</span>
                    </div>
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">批次数</span>
                        <strong className="warehouse-stat-tile__value">{analytics?.statistics?.totalBatches || 0}</strong>
                        <span className="warehouse-stat-tile__meta">活跃业务批次总量</span>
                    </div>
                </div>
            </section>

            <section className="warehouse-report-grid">
                <div className="warehouse-inline-stack">
                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>近 7 天出入库趋势</h3>
                            <span className="warehouse-panel__subtitle">让节奏可见，而不是只盯库存总量。</span>
                        </div>

                        <div className="warehouse-trend-chart">
                            <div className="warehouse-trend-chart__y-axis">
                                {[1, 0.75, 0.5, 0.25, 0].map((step) => (
                                    <span key={step}>{Math.round(maxTrendValue * step)}</span>
                                ))}
                            </div>
                            <div className="warehouse-trend-chart__bars">
                                {trend.map((item) => (
                                    <div key={item.date} className="warehouse-trend-chart__group">
                                        <div className="warehouse-trend-chart__columns">
                                            <div
                                                className="warehouse-trend-chart__bar warehouse-trend-chart__bar--inbound"
                                                style={{ height: `${(Number(item.inbound || 0) / maxTrendValue) * 100}%` }}
                                                title={`入库 ${item.inbound || 0}`}
                                            />
                                            <div
                                                className="warehouse-trend-chart__bar warehouse-trend-chart__bar--outbound"
                                                style={{ height: `${(Number(item.outbound || 0) / maxTrendValue) * 100}%` }}
                                                title={`出库 ${item.outbound || 0}`}
                                            />
                                        </div>
                                        <span className="warehouse-trend-chart__label">{item.date}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="warehouse-inline-actions">
                            <span className="warehouse-pill warehouse-pill--success">入库</span>
                            <span className="warehouse-pill">出库</span>
                        </div>
                    </section>

                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>最近流转记录</h3>
                            <span className="warehouse-panel__subtitle">{analytics?.transactions?.length || 0} 条记录</span>
                        </div>

                        {analytics?.transactions?.length ? (
                            <div className="warehouse-record-table">
                                <div className="warehouse-record-table__head">
                                    <span>时间</span>
                                    <span>动作</span>
                                    <span>物资</span>
                                    <span>操作人</span>
                                </div>
                                {analytics.transactions.slice(0, 12).map((transaction) => (
                                    <div key={transaction.id} className="warehouse-record-table__row">
                                        <span>{formatDateTime(transaction.created_at)}</span>
                                        <span><StatusPill status={transaction.transaction_type} /></span>
                                        <span>#{transaction.unit_id}</span>
                                        <span>{transaction.operator_name || transaction.remarks || '-'}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="warehouse-empty-state">
                                <strong>暂无流转记录</strong>
                                <span>当前机构下还没有可复盘的出入库动作。</span>
                            </div>
                        )}
                    </section>
                </div>

                <div className="warehouse-inline-stack">
                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>物资类型分布</h3>
                            <span className="warehouse-panel__subtitle">按真实库存单元汇总</span>
                        </div>
                        <div className="warehouse-distribution-list">
                            {(analytics?.typeDistribution || []).map((item) => (
                                <div key={item.type} className="warehouse-distribution-item">
                                    <div className="warehouse-distribution-item__header">
                                        <span>{item.type || '未分类'}</span>
                                        <strong>{item.count}</strong>
                                    </div>
                                    <div className="warehouse-progress__bar">
                                        <div className="warehouse-progress__fill" style={{ width: `${item.percentage || 0}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>状态分布</h3>
                            <span className="warehouse-panel__subtitle">统一状态词典，不再每页各写一套。</span>
                        </div>
                        <div className="warehouse-status-list">
                            {(analytics?.statusDistribution || []).map((item) => (
                                <div key={item.status} className="warehouse-status-list__item">
                                    <span>{formatStatusLabel(item.status)}</span>
                                    <strong>{item.count}</strong>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>Top Movers</h3>
                            <span className="warehouse-panel__subtitle">最近动作最密集的物资类型</span>
                        </div>
                        <div className="warehouse-distribution-list">
                            {(analytics?.topMovers || []).map((item) => (
                                <div key={item.label} className="warehouse-status-list__item">
                                    <span>{item.label}</span>
                                    <strong>{item.count}</strong>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>仓库分布</h3>
                            <span className="warehouse-panel__subtitle">看哪几个仓库最繁忙</span>
                        </div>
                        <div className="warehouse-distribution-list">
                            {(analytics?.warehouseDistribution || []).map((item) => (
                                <div key={item.warehouse} className="warehouse-status-list__item">
                                    <span>{item.warehouse}</span>
                                    <strong>{item.count}</strong>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </section>
        </div>
    )
}

function formatStatusLabel(status) {
    const labelMap = {
        in_stock: '在库',
        allocated: '待领取',
        picked: '已领取',
        damaged: '损坏',
        lost: '丢失',
    }
    return labelMap[status] || status || '-'
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
