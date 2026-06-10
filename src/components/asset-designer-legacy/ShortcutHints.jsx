/**
 * ShortcutHints — 右下角快捷键提示卡
 */

export default function ShortcutHints({ items = [] }) {
    if (items.length === 0) return null

    return (
        <div className="floating-panel shortcut-hints">
            {items.map((item) => (
                <div key={item.key} className="shortcut-hints__item">
                    <span className="shortcut-hints__key">{item.key}</span>
                    <span className="shortcut-hints__desc">{item.desc}</span>
                </div>
            ))}
        </div>
    )
}
