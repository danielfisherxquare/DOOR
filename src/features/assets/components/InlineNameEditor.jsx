import { useEffect, useRef, useState } from 'react'

/** @typedef {{ label: string, initialValue?: string, initialColor?: string, withColor?: boolean, onSave: (value: { name: string, color: string }) => void | Promise<void>, onCancel: () => void }} InlineNameEditorProps */

/** @param {InlineNameEditorProps} props */
export default function InlineNameEditor({ label, initialValue = '', initialColor = '#d8262c', withColor = false, onSave, onCancel }) {
  const inputRef = useRef(null)
  const [name, setName] = useState(initialValue)
  const [color, setColor] = useState(initialColor)
  const [saving, setSaving] = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <form className="asset-inline-editor" onSubmit={async (event) => {
      event.preventDefault()
      if (!name.trim() || saving) return
      setSaving(true)
      try { await onSave({ name: name.trim(), color }) } finally { setSaving(false) }
    }}>
      <label>
        <span>{label}</span>
        <input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
      </label>
      {withColor && <input className="asset-color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="标签颜色" />}
      <button type="submit" className="icon-button" disabled={!name.trim() || saving} aria-label="保存">
        <span className="material-symbols-outlined" aria-hidden="true">check</span>
      </button>
      <button type="button" className="icon-button" onClick={onCancel} aria-label="取消">
        <span className="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </form>
  )
}
