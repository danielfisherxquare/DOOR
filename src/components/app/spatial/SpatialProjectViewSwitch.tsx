import { Link } from 'react-router-dom'
import './spatial-project-view-switch.css'

export type SpatialProjectView = 'map' | 'model'

export interface SpatialProjectViewSwitchProps {
  /** 当前正在使用的空间项目视图。 */
  activeView: SpatialProjectView
  /** 保留当前项目与重点区域上下文的地图规划地址。 */
  mapHref: string
  /** 保留当前项目与重点区域上下文的实体编辑地址。 */
  modelHref: string
  /** 参考数据尚未生成时，阻止误入空白实体编辑器。 */
  modelDisabled?: boolean
  /** 解释实体编辑暂不可用的原因。 */
  modelDisabledReason?: string
  /** 可选的附加样式类，用于嵌入不同编辑器标题栏。 */
  className?: string
}

const VIEW_OPTIONS: Array<{
  key: SpatialProjectView
  label: string
  icon: string
}> = [
  { key: 'map', label: '地图规划', icon: 'map' },
  { key: 'model', label: '实体编辑', icon: 'view_in_ar' },
]

export default function SpatialProjectViewSwitch({
  activeView,
  mapHref,
  modelHref,
  modelDisabled = false,
  modelDisabledReason = '',
  className = '',
}: SpatialProjectViewSwitchProps) {
  const hrefByView: Record<SpatialProjectView, string> = {
    map: mapHref,
    model: modelHref,
  }

  return (
    <nav
      className={`spatial-project-view-switch ${className}`.trim()}
      aria-label="空间项目视图"
    >
      {VIEW_OPTIONS.map((option) => {
        const isActive = activeView === option.key
        const isDisabled = option.key === 'model' && modelDisabled
        const content = (
          <>
            <span className="material-symbols-outlined" aria-hidden="true">{option.icon}</span>
            <span>{option.label}</span>
          </>
        )

        if (isDisabled) {
          return (
            <span
              key={option.key}
              className="spatial-project-view-switch__item is-disabled"
              aria-disabled="true"
              title={modelDisabledReason}
            >
              {content}
            </span>
          )
        }

        return (
          <Link
            key={option.key}
            to={hrefByView[option.key]}
            className={`spatial-project-view-switch__item ${isActive ? 'is-active' : ''}`.trim()}
            aria-current={isActive ? 'page' : undefined}
          >
            {content}
          </Link>
        )
      })}
    </nav>
  )
}
