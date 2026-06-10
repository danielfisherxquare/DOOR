import { useCallback, useEffect, useRef, useState } from 'react'
import { AppH5Notice, AppH5Panel } from '../../../../components/app/AppH5Surface'

/**
 * 名单条目编辑 Modal
 *
 * 替代 window.prompt 的三连弹窗，提供统一的字段校验和交互体验。
 * 使用系统已有的 H5 面板样式 + overlay 覆盖层。
 */
export default function ListEntryEditModal({ entry, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: entry?.name || '',
    idNumber: entry?.idNumber || '',
    phone: entry?.phone || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  const handleChange = useCallback((field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
    setError('')
  }, [])

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault()

    const trimmed = {
      name: form.name.trim(),
      idNumber: form.idNumber.trim(),
      phone: form.phone.trim(),
    }

    if (!trimmed.idNumber) {
      setError('证件号为必填项。')
      return
    }

    setSaving(true)
    try {
      await onSave?.(trimmed)
    } catch (err) {
      setError(err.message || '保存失败')
      setSaving(false)
    }
  }, [form, onSave])

  return (
    <div
      className="processing-modal-overlay"
      onClick={(event) => { if (event.target === event.currentTarget) onCancel?.() }}
      role="dialog"
      aria-modal="true"
      aria-label="编辑名单条目"
    >
      <div className="processing-modal-content">
        <AppH5Panel
          title="编辑名单条目"
          subtitle={'修改后需手动点击"重新应用匹配"以更新关联状态。'}
        >
          <form onSubmit={handleSubmit} className="processing-modal-form">
            {error ? <AppH5Notice tone="danger">{error}</AppH5Notice> : null}

            <div className="processing-modal-field">
              <label htmlFor="edit-entry-name">姓名</label>
              <input
                id="edit-entry-name"
                ref={nameInputRef}
                className="input"
                value={form.name}
                onChange={handleChange('name')}
                placeholder="选手姓名"
              />
            </div>

            <div className="processing-modal-field">
              <label htmlFor="edit-entry-id">
                证件号 <span className="required">*</span>
              </label>
              <input
                id="edit-entry-id"
                className="input"
                value={form.idNumber}
                onChange={handleChange('idNumber')}
                placeholder="支持 * / ? 通配符"
                required
              />
            </div>

            <div className="processing-modal-field">
              <label htmlFor="edit-entry-phone">手机号</label>
              <input
                id="edit-entry-phone"
                className="input"
                value={form.phone}
                onChange={handleChange('phone')}
                placeholder="手机号（可选）"
              />
            </div>

            <div className="processing-inline-actions processing-modal-actions">
              <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
                取消
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </form>
        </AppH5Panel>
      </div>
    </div>
  )
}
