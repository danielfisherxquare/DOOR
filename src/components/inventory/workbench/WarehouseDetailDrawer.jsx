import { useNavigate } from 'react-router-dom'

export default function WarehouseDetailDrawer({ item, fallbackTitle = '详情', fallbackSummary = '点击左侧任务或异常后，在这里查看下一步动作。' }) {
    const navigate = useNavigate()

    return (
        <section className="warehouse-panel warehouse-detail-drawer">
            <h3>{item?.title || fallbackTitle}</h3>
            <p className="warehouse-detail-drawer__summary">{item?.meta || fallbackSummary}</p>

            {item ? (
                <>
                    <div className="warehouse-detail-drawer__meta">
                        <span>{item.type}</span>
                        <span>{item.status}</span>
                        <span>{item.warehouseName || '未指定仓库'}</span>
                    </div>
                    <div className="warehouse-detail-drawer__body">
                        <div className="warehouse-detail-drawer__row">
                            <label>库位</label>
                            <div>{item.locationCode || '未指定库位'}</div>
                        </div>
                        <div className="warehouse-detail-drawer__row">
                            <label>更新时间</label>
                            <div>{item.updatedAt ? new Date(item.updatedAt).toLocaleString('zh-CN') : '-'}</div>
                        </div>
                    </div>
                    <div className="warehouse-detail-drawer__actions">
                        {item.nextActionHref ? (
                            <button className="btn btn--primary" onClick={() => navigate(item.nextActionHref)}>
                                打开下一步
                            </button>
                        ) : null}
                    </div>
                </>
            ) : <div className="warehouse-detail-drawer__empty">当前没有选中项。</div>}
        </section>
    )
}

