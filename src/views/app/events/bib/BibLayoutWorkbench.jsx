import { useEffect, useMemo, useRef, useState } from 'react'
import bibApi from '../../../../api/bib'
import {
  CommandEmptyState,
  CommandNotice,
  CommandPanel,
} from '../../../../components/command/CommandPrimitives'

const DEFAULT_TEMPLATE_NAME = '标准号码布'
const TEMPLATE_STORAGE_PREFIX = 'bib-layout-templates:'
const TEMPLATE_WIDTH = 24
const TEMPLATE_HEIGHT = 20

const FIELD_LIBRARY = [
  { key: 'bibNumber', label: '号码布号', sample: 'A10248', color: '#143c67' },
  { key: 'name', label: '姓名', sample: '张三', color: '#0f172a' },
  { key: 'event', label: '项目', sample: '马拉松', color: '#106e7a' },
  { key: 'bagWindowNo', label: '存衣窗口', sample: '03', color: '#9a4b16' },
  { key: 'bagNo', label: '存衣袋号', sample: '128', color: '#8b5cf6' },
  { key: 'expoWindowNo', label: '博览会窗口', sample: '11', color: '#0d8b68' },
]

function createDefaultTemplate() {
  return {
    id: `tpl-${Date.now()}`,
    name: DEFAULT_TEMPLATE_NAME,
    pageWidth: TEMPLATE_WIDTH,
    pageHeight: TEMPLATE_HEIGHT,
    background: 'linear-gradient(135deg, #fff8ef 0%, #ffffff 42%, #eef7f8 100%)',
    fields: [
      { id: 'bibNumber', key: 'bibNumber', label: '号码布号', x: 0.08, y: 0.12, w: 0.84, h: 0.22, fontSize: 36, weight: 800, color: '#143c67', align: 'center' },
      { id: 'name', key: 'name', label: '姓名', x: 0.14, y: 0.42, w: 0.72, h: 0.12, fontSize: 20, weight: 700, color: '#0f172a', align: 'center' },
      { id: 'event', key: 'event', label: '项目', x: 0.14, y: 0.57, w: 0.32, h: 0.08, fontSize: 14, weight: 700, color: '#106e7a', align: 'left' },
      { id: 'bagWindowNo', key: 'bagWindowNo', label: '存衣窗口', x: 0.14, y: 0.7, w: 0.18, h: 0.08, fontSize: 14, weight: 700, color: '#9a4b16', align: 'center' },
      { id: 'bagNo', key: 'bagNo', label: '存衣袋号', x: 0.4, y: 0.7, w: 0.18, h: 0.08, fontSize: 14, weight: 700, color: '#8b5cf6', align: 'center' },
      { id: 'expoWindowNo', key: 'expoWindowNo', label: '博览会窗口', x: 0.66, y: 0.7, w: 0.2, h: 0.08, fontSize: 14, weight: 700, color: '#0d8b68', align: 'center' },
    ],
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getStorageKey(raceId) {
  return `${TEMPLATE_STORAGE_PREFIX}${raceId}`
}

function mapDatasetRow(row) {
  return {
    id: Number(row.id || 0),
    name: String(row.name || '').trim(),
    event: String(row.event || '').trim(),
    bibNumber: String(row.bibNumber || row.bib_number || '').trim(),
    bagWindowNo: String(row.bagWindowNo || row.bag_window_no || '').trim(),
    bagNo: String(row.bagNo || row.bag_no || '').trim(),
    expoWindowNo: String(row.expoWindowNo || row.expo_window_no || '').trim(),
    bibColor: String(row.bibColor || row.bib_color || '').trim(),
  }
}

function formatFieldValue(field, sampleRow) {
  const raw = sampleRow?.[field.key]
  const value = String(raw || '').trim()
  if (value) return value
  const fallback = FIELD_LIBRARY.find((item) => item.key === field.key)
  return fallback?.sample || field.label
}

function StageField({ field, stageSize, selected, onSelect, onChange }) {
  const dragStateRef = useRef(null)
  const width = stageSize.width * field.w
  const height = stageSize.height * field.h
  const left = stageSize.width * field.x
  const top = stageSize.height * field.y

  const handlePointerDown = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const mode = event.target.dataset.resizeHandle ? 'resize' : 'move'
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode,
      fieldSnapshot: { ...field },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(field.id)
  }

  const handlePointerMove = (event) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const deltaX = (event.clientX - dragState.startX) / stageSize.width
    const deltaY = (event.clientY - dragState.startY) / stageSize.height

    if (dragState.mode === 'move') {
      onChange(field.id, {
        x: clamp(dragState.fieldSnapshot.x + deltaX, 0, 1 - field.w),
        y: clamp(dragState.fieldSnapshot.y + deltaY, 0, 1 - field.h),
      })
      return
    }

    onChange(field.id, {
      w: clamp(dragState.fieldSnapshot.w + deltaX, 0.08, 1 - dragState.fieldSnapshot.x),
      h: clamp(dragState.fieldSnapshot.h + deltaY, 0.05, 1 - dragState.fieldSnapshot.y),
    })
  }

  const handlePointerUp = (event) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className={`bib-layout-stage__field ${selected ? 'is-selected' : ''}`}
      style={{
        left,
        top,
        width,
        height,
        color: field.color,
        fontSize: field.fontSize,
        fontWeight: field.weight,
        textAlign: field.align,
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(field.id)
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="bib-layout-stage__field-label">{field.label}</div>
      <div className="bib-layout-stage__field-handle" data-resize-handle="true" />
    </div>
  )
}

export default function BibLayoutWorkbench({ raceId }) {
  const [templates, setTemplates] = useState([])
  const [activeTemplateId, setActiveTemplateId] = useState('')
  const [sampleRows, setSampleRows] = useState([])
  const [sampleRowIndex, setSampleRowIndex] = useState(0)
  const [selectedFieldId, setSelectedFieldId] = useState('')
  const [message, setMessage] = useState('')
  const stageRef = useRef(null)
  const [stageSize, setStageSize] = useState({ width: 620, height: 516 })

  useEffect(() => {
    const storageKey = getStorageKey(raceId)
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) {
        const initial = [createDefaultTemplate()]
        setTemplates(initial)
        setActiveTemplateId(initial[0].id)
        localStorage.setItem(storageKey, JSON.stringify(initial))
        return
      }
      const parsed = JSON.parse(raw)
      const nextTemplates = Array.isArray(parsed) && parsed.length > 0 ? parsed : [createDefaultTemplate()]
      setTemplates(nextTemplates)
      setActiveTemplateId(nextTemplates[0].id)
    } catch {
      const fallback = [createDefaultTemplate()]
      setTemplates(fallback)
      setActiveTemplateId(fallback[0].id)
    }
  }, [raceId])

  useEffect(() => {
    let alive = true
    bibApi.getBibDataset(raceId)
      .then((rows) => {
        if (!alive) return
        const mapped = (rows || []).map(mapDatasetRow)
        const withBib = mapped.filter((row) => row.bibNumber)
        setSampleRows(withBib.length > 0 ? withBib : mapped)
      })
      .catch((error) => {
        if (!alive) return
        setMessage(`加载排版样例失败：${error.message}`)
      })
    return () => {
      alive = false
    }
  }, [raceId])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = entry.contentRect.width
      setStageSize({ width, height: width * (TEMPLATE_HEIGHT / TEMPLATE_WIDTH) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const persistTemplates = (nextTemplates) => {
    setTemplates(nextTemplates)
    localStorage.setItem(getStorageKey(raceId), JSON.stringify(nextTemplates))
  }

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === activeTemplateId) || templates[0] || null,
    [activeTemplateId, templates],
  )

  useEffect(() => {
    if (!activeTemplate && templates[0]) {
      setActiveTemplateId(templates[0].id)
    }
  }, [activeTemplate, templates])

  useEffect(() => {
    if (!activeTemplate?.fields?.length) {
      setSelectedFieldId('')
      return
    }
    if (!activeTemplate.fields.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(activeTemplate.fields[0].id)
    }
  }, [activeTemplate, selectedFieldId])

  const selectedField = activeTemplate?.fields?.find((field) => field.id === selectedFieldId) || null
  const sampleRow = sampleRows[sampleRowIndex] || sampleRows[0] || null

  const updateActiveTemplate = (updater) => {
    if (!activeTemplate) return
    const nextTemplates = templates.map((template) => {
      if (template.id !== activeTemplate.id) return template
      return updater(template)
    })
    persistTemplates(nextTemplates)
  }

  const updateField = (fieldId, patch) => {
    updateActiveTemplate((template) => ({
      ...template,
      fields: template.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    }))
  }

  const handleAddField = (fieldDef) => {
    if (!activeTemplate) return
    const nextId = `${fieldDef.key}-${Date.now()}`
    updateActiveTemplate((template) => ({
      ...template,
      fields: [
        ...template.fields,
        {
          id: nextId,
          key: fieldDef.key,
          label: fieldDef.label,
          x: 0.14,
          y: 0.14 + (template.fields.length % 5) * 0.1,
          w: 0.3,
          h: 0.08,
          fontSize: 16,
          weight: 700,
          color: fieldDef.color,
          align: 'left',
        },
      ],
    }))
    setSelectedFieldId(nextId)
  }

  const handleDeleteField = () => {
    if (!activeTemplate || !selectedFieldId) return
    const nextFields = activeTemplate.fields.filter((field) => field.id !== selectedFieldId)
    updateActiveTemplate((template) => ({ ...template, fields: nextFields }))
    setSelectedFieldId(nextFields[0]?.id || '')
  }

  const handleDuplicateTemplate = () => {
    if (!activeTemplate) return
    const duplicated = {
      ...activeTemplate,
      id: `tpl-${Date.now()}`,
      name: `${activeTemplate.name} 副本`,
      fields: activeTemplate.fields.map((field) => ({ ...field, id: `${field.key}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` })),
    }
    const nextTemplates = [duplicated, ...templates]
    persistTemplates(nextTemplates)
    setActiveTemplateId(duplicated.id)
  }

  const handleCreateTemplate = () => {
    const template = createDefaultTemplate()
    const nextTemplates = [template, ...templates]
    persistTemplates(nextTemplates)
    setActiveTemplateId(template.id)
  }

  const handleDeleteTemplate = () => {
    if (!activeTemplate) return
    if (!window.confirm(`确认删除模板“${activeTemplate.name}”吗？`)) return
    const nextTemplates = templates.filter((template) => template.id !== activeTemplate.id)
    const fallbackTemplates = nextTemplates.length > 0 ? nextTemplates : [createDefaultTemplate()]
    persistTemplates(fallbackTemplates)
    setActiveTemplateId(fallbackTemplates[0].id)
  }

  const copyTemplateJson = async () => {
    if (!activeTemplate) return
    await navigator.clipboard.writeText(JSON.stringify(activeTemplate, null, 2))
    setMessage('模板 JSON 已复制到剪贴板。')
    setTimeout(() => setMessage(''), 2400)
  }

  if (!activeTemplate) {
    return (
      <CommandPanel title="号码布排版" subtitle="本地模板初始化中。">
        <CommandEmptyState title="正在初始化模板" description="请稍候片刻，模板工作台会自动恢复。" icon="TPL" />
      </CommandPanel>
    )
  }

  return (
    <div className="bib-layout-workbench">
      {message ? <CommandNotice tone="info">{message}</CommandNotice> : null}

      <div className="bib-layout-grid">
        <CommandPanel
          title="模板列表"
          subtitle="当前按赛事保存在浏览器本地，可复制 JSON 做共享。"
          footer="如果后续需要多人协同，我们再把这块接成后端模板存储。"
        >
          <div className="bib-layout-template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`bib-layout-template-item ${template.id === activeTemplate.id ? 'is-active' : ''}`}
                onClick={() => setActiveTemplateId(template.id)}
              >
                <strong>{template.name}</strong>
                <small>{template.fields.length} 个字段</small>
              </button>
            ))}
          </div>
          <div className="bib-layout-actions">
            <button type="button" className="btn btn--secondary" onClick={handleCreateTemplate}>新建模板</button>
            <button type="button" className="btn btn--ghost" onClick={handleDuplicateTemplate}>复制模板</button>
            <button type="button" className="btn btn--ghost" onClick={copyTemplateJson}>复制 JSON</button>
            <button type="button" className="btn btn--ghost" onClick={handleDeleteTemplate}>删除模板</button>
          </div>
        </CommandPanel>

        <CommandPanel title="字段库" subtitle="点击把字段放到号码布画布里。">
          <div className="bib-layout-template-list">
            {FIELD_LIBRARY.map((field) => (
              <button
                key={field.key}
                type="button"
                className="bib-layout-template-item"
                onClick={() => handleAddField(field)}
              >
                <strong>{field.label}</strong>
                <small>{field.sample}</small>
              </button>
            ))}
          </div>
        </CommandPanel>
      </div>

      <div className="bib-layout-main-grid">
        <CommandPanel title="画布预览" subtitle="拖动字段可移动，右下角手柄可缩放。">
          <div className="bib-layout-canvas-shell" ref={stageRef}>
            <div
              className="bib-layout-stage"
              style={{
                height: stageSize.height,
                background: activeTemplate.background,
              }}
              onClick={() => setSelectedFieldId('')}
            >
              <div className="bib-layout-stage__safe-line" />
              {activeTemplate.fields.map((field) => (
                <div
                  key={`${field.id}-preview`}
                  className="bib-layout-stage__preview-text"
                  style={{
                    left: `${field.x * 100}%`,
                    top: `${field.y * 100}%`,
                    width: `${field.w * 100}%`,
                    height: `${field.h * 100}%`,
                    color: field.color,
                    fontSize: field.fontSize,
                    fontWeight: field.weight,
                    textAlign: field.align,
                  }}
                >
                  {formatFieldValue(field, sampleRow)}
                </div>
              ))}
              {activeTemplate.fields.map((field) => (
                <StageField
                  key={field.id}
                  field={field}
                  stageSize={stageSize}
                  selected={field.id === selectedFieldId}
                  onSelect={setSelectedFieldId}
                  onChange={updateField}
                />
              ))}
            </div>
          </div>
          <div className="bib-layout-samples">
            <span>样例数据</span>
            <select
              className="lottery-select"
              value={sampleRowIndex}
              onChange={(event) => setSampleRowIndex(Number(event.target.value))}
            >
              {sampleRows.length > 0 ? sampleRows.map((row, index) => (
                <option key={row.id || index} value={index}>
                  {row.bibNumber || '未排号'} · {row.name || '未命名'} · {row.event || '未分项目'}
                </option>
              )) : (
                <option value={0}>暂无样例，先完成排号后再预览</option>
              )}
            </select>
          </div>
        </CommandPanel>

        <CommandPanel title="属性面板" subtitle="可精确微调模板名、底色和字段参数。">
          <div className="bib-layout-form-grid">
            <label className="lottery-field">
              <span>模板名称</span>
              <input
                className="lottery-input"
                value={activeTemplate.name}
                onChange={(event) => updateActiveTemplate((template) => ({ ...template, name: event.target.value }))}
              />
            </label>
            <label className="lottery-field">
              <span>底板背景</span>
              <input
                className="lottery-input"
                value={activeTemplate.background}
                onChange={(event) => updateActiveTemplate((template) => ({ ...template, background: event.target.value }))}
              />
            </label>
          </div>

          {selectedField ? (
            <div className="bib-layout-field-editor">
              <div className="bib-layout-field-editor__head">
                <strong>{selectedField.label}</strong>
                <button type="button" className="btn btn--ghost btn--sm" onClick={handleDeleteField}>删除字段</button>
              </div>
              <div className="bib-layout-form-grid">
                <label className="lottery-field">
                  <span>显示名称</span>
                  <input className="lottery-input" value={selectedField.label} onChange={(event) => updateField(selectedField.id, { label: event.target.value })} />
                </label>
                <label className="lottery-field">
                  <span>颜色</span>
                  <input className="lottery-input" value={selectedField.color} onChange={(event) => updateField(selectedField.id, { color: event.target.value })} />
                </label>
              </div>
              <div className="bib-layout-form-grid bib-layout-form-grid--compact">
                {[
                  ['x', 'X 比例'],
                  ['y', 'Y 比例'],
                  ['w', '宽度'],
                  ['h', '高度'],
                ].map(([key, label]) => (
                  <label key={key} className="lottery-field">
                    <span>{label}</span>
                    <input
                      className="lottery-input"
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedField[key]}
                      onChange={(event) => updateField(selectedField.id, { [key]: clamp(Number(event.target.value), 0, 1) })}
                    />
                  </label>
                ))}
                <label className="lottery-field">
                  <span>字号</span>
                  <input
                    className="lottery-input"
                    type="number"
                    min="10"
                    max="72"
                    step="1"
                    value={selectedField.fontSize}
                    onChange={(event) => updateField(selectedField.id, { fontSize: Number(event.target.value) })}
                  />
                </label>
                <label className="lottery-field">
                  <span>字重</span>
                  <input
                    className="lottery-input"
                    type="number"
                    min="400"
                    max="900"
                    step="100"
                    value={selectedField.weight}
                    onChange={(event) => updateField(selectedField.id, { weight: Number(event.target.value) })}
                  />
                </label>
                <label className="lottery-field">
                  <span>对齐</span>
                  <select
                    className="lottery-select"
                    value={selectedField.align}
                    onChange={(event) => updateField(selectedField.id, { align: event.target.value })}
                  >
                    <option value="left">左对齐</option>
                    <option value="center">居中</option>
                    <option value="right">右对齐</option>
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <CommandEmptyState
              title="未选中字段"
              description="点击画布里的字段盒子后，这里会显示它的精确参数。"
              icon="LAY"
            />
          )}
        </CommandPanel>
      </div>
    </div>
  )
}
