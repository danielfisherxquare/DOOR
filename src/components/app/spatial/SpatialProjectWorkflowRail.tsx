import { Link } from 'react-router-dom'
import './spatial-project-workflow-rail.css'

export type SpatialProjectWorkflowStep = 'locate' | 'generate' | 'edit'

export interface SpatialProjectWorkflowRailProps {
  /** 当前需要用户完成的步骤。 */
  activeStep: SpatialProjectWorkflowStep
  /** 已完成的步骤，用于显示项目进度。 */
  completedSteps?: SpatialProjectWorkflowStep[]
  /** 当前唯一主动作的文案。 */
  primaryActionLabel: string
  /** 在地图工作台内完成动作时使用。 */
  onPrimaryAction?: () => void
  /** 进入另一个路由时使用。 */
  primaryActionHref?: string
  /** 主动作不可用时提供明确原因。 */
  primaryActionDisabled?: boolean
  /** 向用户解释当前状态与下一步。 */
  statusText?: string
  /** 嵌入紧凑型标题栏时使用。 */
  compact?: boolean
}

const WORKFLOW_STEPS: Array<{
  key: SpatialProjectWorkflowStep
  index: string
  label: string
}> = [
  { key: 'locate', index: '01', label: '卫星选址' },
  { key: 'generate', index: '02', label: '生成参考数据' },
  { key: 'edit', index: '03', label: '实体布置' },
]

export default function SpatialProjectWorkflowRail({
  activeStep,
  completedSteps = [],
  primaryActionLabel,
  onPrimaryAction,
  primaryActionHref,
  primaryActionDisabled = false,
  statusText = '',
  compact = false,
}: SpatialProjectWorkflowRailProps) {
  const completedSet = new Set(completedSteps)
  const actionClassName = 'spatial-project-workflow__action'
  const actionContent = (
    <>
      <span>{primaryActionLabel}</span>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
    </>
  )

  return (
    <section
      className={`spatial-project-workflow ${compact ? 'is-compact' : ''}`.trim()}
      aria-label="空间项目流程"
    >
      <ol className="spatial-project-workflow__steps">
        {WORKFLOW_STEPS.map((step) => {
          const isActive = activeStep === step.key
          const isCompleted = completedSet.has(step.key)
          return (
            <li
              key={step.key}
              className={`spatial-project-workflow__step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-complete' : ''}`.trim()}
              data-state={isCompleted ? 'complete' : isActive ? 'active' : 'pending'}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="spatial-project-workflow__index">
                {isCompleted ? (
                  <span className="material-symbols-outlined" aria-hidden="true">check</span>
                ) : step.index}
              </span>
              <span>{step.label}</span>
            </li>
          )
        })}
      </ol>

      <div className="spatial-project-workflow__next">
        {statusText ? (
          <p className="spatial-project-workflow__status" role="status" aria-live="polite">
            {statusText}
          </p>
        ) : null}
        {primaryActionHref && !primaryActionDisabled ? (
          <Link className={actionClassName} to={primaryActionHref}>
            {actionContent}
          </Link>
        ) : (
          <button
            type="button"
            className={actionClassName}
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled}
          >
            {actionContent}
          </button>
        )}
      </div>
    </section>
  )
}
