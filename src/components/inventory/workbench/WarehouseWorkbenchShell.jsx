import { AppH5Surface, AppH5Tabs } from '../../app/AppH5Surface'
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
    const tabsNode = Array.isArray(tabs)
        ? <AppH5Tabs items={tabs} ariaLabel={(title || '仓储') + '视图'} />
        : tabs

    return (
        <AppH5Surface
            className="warehouse-workbench warehouse-workbench__shell"
            eyebrow={eyebrow}
            title={title}
            summary={summary}
            actions={actions}
        >
            {tabsNode}
            {contextBar}
            {metrics}

            <div className="warehouse-workbench__layout">
                <div className="warehouse-workbench__main">{main}</div>
                <aside className="warehouse-workbench__side">{side}</aside>
            </div>
        </AppH5Surface>
    )
}
