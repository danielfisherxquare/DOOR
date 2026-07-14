import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './spatial-project-create-dialog.css'

interface SpatialProjectCreateDialogProps {
  /** Controls whether the dialog is rendered. */
  open: boolean
  /** Initial project name shown whenever the dialog opens. */
  defaultName: string
  /** Disables dismissal and form controls while the project request is running. */
  submitting: boolean
  /** API or workflow error shown without dismissing the dialog. */
  error?: string | null
  /** Creates the project with the validated, trimmed name. */
  onSubmit: (name: string) => void | Promise<void>
  /** Leaves the creation flow without creating a draft project. */
  onCancel: () => void
}

export default function SpatialProjectCreateDialog({
  open,
  defaultName,
  submitting,
  error = null,
  onSubmit,
  onCancel,
}: SpatialProjectCreateDialogProps) {
  const [name, setName] = useState(defaultName)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return undefined

    setName(defaultName)
    setValidationError(null)
    const focusFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
    }
  }, [defaultName, open])

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, open, submitting])

  if (!open) return null

  const visibleError = validationError || error

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setValidationError('请输入空间项目名称')
      inputRef.current?.focus()
      return
    }

    setValidationError(null)
    await onSubmit(normalizedName)
  }

  return (
    <div
      className="spatial-project-create-dialog__overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel()
      }}
    >
      <section
        className="spatial-project-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spatial-project-create-title"
        aria-describedby="spatial-project-create-summary"
      >
        <header className="spatial-project-create-dialog__header">
          <div className="spatial-project-create-dialog__icon" aria-hidden="true">
            <span className="material-symbols-outlined">add_location_alt</span>
          </div>
          <div>
            <div className="spatial-project-create-dialog__eyebrow">空间项目 · 地图规划</div>
            <h2 id="spatial-project-create-title">新建赛事场地</h2>
            <p id="spatial-project-create-summary">
              先建立项目，再在卫星地图上框选场地。地图与实体编辑会共享同一份项目数据。
            </p>
          </div>
        </header>

        <form className="spatial-project-create-dialog__form" onSubmit={handleSubmit}>
          <label className="spatial-project-create-dialog__field" htmlFor="spatial-project-name">
            <span>项目名称</span>
            <input
              ref={inputRef}
              id="spatial-project-name"
              name="projectName"
              value={name}
              maxLength={80}
              autoComplete="off"
              disabled={submitting}
              aria-invalid={Boolean(visibleError)}
              aria-describedby={visibleError ? 'spatial-project-create-error' : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (validationError) setValidationError(null)
              }}
            />
            <small>创建后可继续调整名称；当前地图中心会作为项目初始定位。</small>
          </label>

          <div className="spatial-project-create-dialog__flow" aria-label="创建后的工作流程">
            <div>
              <span>01</span>
              <strong>卫星地图选址</strong>
            </div>
            <div>
              <span>02</span>
              <strong>绘制现场范围</strong>
            </div>
            <div>
              <span>03</span>
              <strong>生成三维底场</strong>
            </div>
          </div>

          {visibleError && (
            <div
              id="spatial-project-create-error"
              className="spatial-project-create-dialog__error"
              role="alert"
            >
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              {visibleError}
            </div>
          )}

          <footer className="spatial-project-create-dialog__actions">
            <button type="button" className="is-secondary" disabled={submitting} onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="is-primary" disabled={submitting}>
              <span className="material-symbols-outlined" aria-hidden="true">
                {submitting ? 'progress_activity' : 'arrow_forward'}
              </span>
              {submitting ? '正在创建项目…' : '创建并进入地图'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
