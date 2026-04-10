import { CommandShell } from '../../command/CommandPrimitives'
import './workbench.css'

export default function WarehouseWorkbenchShell({
    eyebrow,
    title,
    summary,
    actions = null,
    contextBar = null,
    metrics = null,
    tabs = null,
    main,
    side,
}) {
    return (
        <CommandShell
            className="warehouse-workbench warehouse-workbench__shell surface-admin"
            eyebrow={eyebrow}
            title={title}
            summary={summary}
            actions={actions}
        >
            {tabs ? <div className="warehouse-workbench__tabs">{tabs}</div> : null}
            {contextBar}
            {metrics}

            <div className="warehouse-workbench__layout">
                <div className="warehouse-workbench__main">{main}</div>
                <aside className="warehouse-workbench__side">{side}</aside>
            </div>
        </CommandShell>
    )
}
