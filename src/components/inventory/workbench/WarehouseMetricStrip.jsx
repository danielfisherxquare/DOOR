export default function WarehouseMetricStrip({ items = [] }) {
    return (
        <section className="warehouse-metric-strip">
            {items.map((item) => (
                <article key={item.key} className="warehouse-metric-card">
                    <div className="warehouse-metric-card__label">{item.label}</div>
                    <div className="warehouse-metric-card__value">{item.value}</div>
                    {item.meta ? <div className="warehouse-metric-card__meta">{item.meta}</div> : null}
                </article>
            ))}
        </section>
    )
}

