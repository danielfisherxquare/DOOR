import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import useImportStore from '../../../../stores/importStore'
import columnMappingsApi from '../../../../api/column-mappings'
import { parseFile } from '../../../../utils/excelProcessor'
import useAuthStore from '../../../../stores/authStore'
import {
  AppH5ContextState,
  AppH5EmptyState,
  AppH5Notice,
  AppH5Panel,
  AppH5Surface,
  AppH5Tabs,
} from '../../../../components/app/AppH5Surface'
import DataCleaner from './DataCleaner'
import DataPreview from './DataPreview'
import SurnamePinyinSettings from './SurnamePinyinSettings'
import './import-page.css'

const STEPS = [
  { key: 'upload', label: '上传', icon: '1', desc: '上传 Excel 或 CSV 格式的报名名单' },
  { key: 'mapping', label: '字段映射', icon: '2', desc: '将原始列名映射到标准字段' },
  { key: 'cleaning', label: '数据清洗', icon: '3', desc: '对导入数据进行去重和规范化处理' },
  { key: 'preview', label: '预览', icon: '4', desc: '提交前预览导入结果' },
]

export default function ImportPage() {
  const [searchParams] = useSearchParams()
  const raceId = searchParams.get('raceId')
  const orgId = searchParams.get('orgId')

  const user = useAuthStore((state) => state.user)
  const role = user?.role

  const {
    standardFields,
    uploadedFiles,
    currentStep,
    importSessionId,
    addFile,
    removeFile,
    updateFileMappings,
    setStep,
    addStandardField,
    removeStandardField,
  } = useImportStore()

  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [useMappingMemory, setUseMappingMemory] = useState(true)
  const [memoryFlags, setMemoryFlags] = useState({})
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')

  const scopedOrgId = role === 'super_admin' ? orgId : user?.orgId

  useEffect(() => {
    setMemoryFlags((prev) => {
      const next = { ...prev }
      uploadedFiles.forEach((file) => {
        if (next[file.id] === undefined) {
          next[file.id] = true
        }
      })
      Object.keys(next).forEach((fileId) => {
        if (!uploadedFiles.some((file) => file.id === fileId)) {
          delete next[fileId]
        }
      })
      return next
    })
  }, [uploadedFiles])

  const handleFiles = useCallback(async (files) => {
    setLoading(true)
    setMessage('')
    try {
      let savedMappings
      if (useMappingMemory) {
        try {
          if (role === 'super_admin' && !scopedOrgId) {
            throw new Error('super_admin 未锁定机构时跳过映射记忆读取')
          }
          const effectiveMappings = await columnMappingsApi.getAll({
            scope: 'effective',
            orgId: scopedOrgId,
          })
          if (effectiveMappings.length > 0) {
            savedMappings = {}
            for (const mapping of effectiveMappings) {
              savedMappings[mapping.sourceColumn] = mapping.targetFieldId
            }
          }
        } catch (error) {
          console.warn('获取映射记忆失败:', error)
        }
      }

      const processedFiles = []
      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        if (uploadedFiles.some((item) => item.name === file.name)) continue
        const data = await parseFile(file, standardFields, savedMappings)
        processedFiles.push(...data)
      }
      processedFiles.forEach((file) => addFile(file))
    } catch (error) {
      console.error(error)
      setMessage(`文件解析失败：${error.message}`)
      setMessageTone('danger')
    } finally {
      setLoading(false)
    }
  }, [addFile, scopedOrgId, standardFields, uploadedFiles, useMappingMemory])

  const persistMappings = useCallback(async () => {
    if (role === 'super_admin' && !scopedOrgId) return

    const mappingsToSave = []
    for (const file of uploadedFiles) {
      if (memoryFlags[file.id] === false) continue
      for (const mapping of file.mappings) {
        if (!mapping.targetFieldId) continue
        mappingsToSave.push({
          sourceColumn: mapping.sourceColumn,
          targetFieldId: mapping.targetFieldId,
        })
      }
    }

    if (mappingsToSave.length === 0) return

    await columnMappingsApi.save(mappingsToSave, {
      scope: 'user',
      orgId: scopedOrgId,
    })
  }, [memoryFlags, role, scopedOrgId, uploadedFiles])

  const onDrop = (event) => {
    event.preventDefault()
    setDragOver(false)
    if (event.dataTransfer.files) {
      void handleFiles(event.dataTransfer.files)
    }
  }

  const handleAddField = () => {
    const name = window.prompt('请输入新字段名称:')
    if (name && name.trim()) {
      addStandardField({ id: `custom_${Date.now()}`, name: name.trim(), required: false })
    }
  }

  const handleRemoveField = (id, name) => {
    if (window.confirm(`确定要删除字段 "${name}" 吗？`)) {
      removeStandardField(id)
    }
  }

  const sortedFields = useMemo(() => {
    return [...standardFields].sort((left, right) => {
      if (left.required && !right.required) return -1
      if (!left.required && right.required) return 1
      return 0
    })
  }, [standardFields])

  const canProceedFromMapping = uploadedFiles.every((file) => file.mappings.some((mapping) => mapping.targetFieldId))
  const currentStepIndex = STEPS.findIndex((item) => item.key === currentStep)

  const canNavigateToStep = useCallback((stepKey) => {
    switch (stepKey) {
      case 'upload':
        return true
      case 'mapping':
        return uploadedFiles.length > 0
      case 'cleaning':
        return uploadedFiles.length > 0 && canProceedFromMapping
      case 'preview':
        return uploadedFiles.length > 0 && Boolean(importSessionId)
      default:
        return false
    }
  }, [canProceedFromMapping, importSessionId, uploadedFiles.length])

  const stepStates = useMemo(() => {
    return STEPS.map((step, index) => ({
      ...step,
      completed: currentStepIndex > index,
      disabled: !canNavigateToStep(step.key),
    }))
  }, [canNavigateToStep, currentStepIndex])

  const stepTabs = useMemo(() => stepStates.map((step) => ({
    key: step.key,
    label: step.label,
    badge: step.icon,
    active: step.key === currentStep,
    disabled: step.disabled,
    onClick: () => setStep(step.key),
  })), [currentStep, setStep, stepStates])

  const totalRows = useMemo(
    () => uploadedFiles.reduce((sum, file) => sum + Number(file.totalRows || 0), 0),
    [uploadedFiles],
  )

  const metrics = useMemo(() => ([
    {
      key: 'step',
      label: '当前阶段',
      value: currentStepInfoLabel(currentStep),
      meta: '沿着上传、映射、清洗、预览四段顺序推进。',
      pill: 'FLOW',
    },
    {
      key: 'files',
      label: '已载入文件',
      value: uploadedFiles.length,
      meta: '当前导入会话内待处理的文件数量。',
      pill: 'FILE',
    },
    {
      key: 'rows',
      label: '待处理行数',
      value: totalRows.toLocaleString('zh-CN'),
      meta: '所有已载入文件的原始数据量。',
      pill: 'ROWS',
    },
    {
      key: 'memory',
      label: '映射记忆',
      value: useMappingMemory ? '启用' : '停用',
      meta: '是否尝试复用历史字段映射。',
      pill: 'MEM',
    },
  ]), [currentStep, totalRows, uploadedFiles.length, useMappingMemory])

  const renderMappingStep = () => (
    <div className="import-mapping-shell">
      <div className="import-mapping-toolbar">
        <div className="import-mapping-toolbar__copy">
          <h3 className="import-mapping-toolbar__title">字段映射</h3>
          <p className="import-mapping-toolbar__summary">
            将原始列名映射到标准字段后，再进入数据清洗。
          </p>
        </div>
        <div className="import-mapping-toolbar__actions">
          <button className="btn btn--secondary" onClick={handleAddField}>+ 新增字段</button>
          <button className="btn btn--secondary" onClick={() => setStep('upload')}>← 返回</button>
          <button
            className="btn btn--primary"
            disabled={!canProceedFromMapping}
            onClick={async () => {
              try {
                await persistMappings()
                setStep('cleaning')
              } catch (error) {
                console.error(error)
                setMessage(`保存映射记忆失败：${error.message}`)
                setMessageTone('danger')
              }
            }}
          >
            继续清洗 →
          </button>
        </div>
      </div>

      {uploadedFiles.map((file) => (
        <div key={file.id} className="import-mapping-card">
          <div className="import-mapping-card__header">
            <div>
              <div className="import-mapping-card__title">{file.name}</div>
              <div className="import-mapping-card__meta">
                <span>{file.totalRows} 行</span>
                {file.extractedSource ? <span className="import-file-tag source">来源: {file.extractedSource}</span> : null}
                {file.extractedEvent ? <span className="import-file-tag event">项目: {file.extractedEvent}</span> : null}
              </div>
            </div>
            <div className="import-mapping-card__memory">
              <span>保存映射记忆</span>
              <button
                type="button"
                className={`toggle-switch ${memoryFlags[file.id] !== false ? 'active' : ''}`}
                onClick={() => setMemoryFlags((prev) => ({ ...prev, [file.id]: !(prev[file.id] !== false) }))}
              />
            </div>
          </div>

          <div className="import-mapping-grid">
            <div className="import-mapping-grid__head">原始列名</div>
            <div className="import-mapping-grid__head">映射到</div>
            <div className="import-mapping-grid__head">样例</div>

            {file.mappings.map((mapping) => {
              const otherUsedIds = new Set(
                file.mappings
                  .filter((item) => item.sourceColumn !== mapping.sourceColumn && item.targetFieldId)
                  .map((item) => item.targetFieldId),
              )

              return (
                <div key={mapping.sourceColumn} className="import-mapping-grid__row">
                  <div className="import-mapping-grid__source">{mapping.sourceColumn}</div>
                  <div>
                    <select
                      className="import-mapping-grid__select"
                      value={mapping.targetFieldId || ''}
                      onChange={(event) => {
                        const newMappings = file.mappings.map((item) => (
                          item.sourceColumn === mapping.sourceColumn
                            ? { ...item, targetFieldId: event.target.value || null }
                            : item
                        ))
                        updateFileMappings(file.id, newMappings)
                      }}
                    >
                      <option value="">-- 忽略 --</option>
                      {sortedFields.map((field) => (
                        <option
                          key={field.id}
                          value={field.id}
                          disabled={otherUsedIds.has(field.id)}
                        >
                          {field.name}{field.required ? '*' : ''}{otherUsedIds.has(field.id) ? ' (已使用)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="import-mapping-grid__sample">
                    {file.previewData[0]?.[mapping.sourceColumn] || <span className="import-mapping-grid__empty">(empty)</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )

  const renderUploadStep = () => (
    <div className="import-upload-section">
      <div
        onDrop={onDrop}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`import-dropzone ${dragOver ? 'is-dragover' : ''}`}
      >
        <div className="import-dropzone-icon">UP</div>
        <h3>拖拽报名文件到此处</h3>
        <p>支持 .xlsx、.csv 格式，或点击上传</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => event.target.files && handleFiles(event.target.files)}
        />
        {loading ? <div className="import-loading-badge">处理中...</div> : null}
      </div>

      <div className="import-option-card">
        <div className="import-option-icon">✎</div>
        <div className="import-option-content">
          <div className="import-option-title">映射记忆</div>
          <div className="import-option-desc">自动应用上次保存的字段映射</div>
        </div>
        <button
          type="button"
          className={`toggle-switch ${useMappingMemory ? 'active' : ''}`}
          onClick={() => setUseMappingMemory((value) => !value)}
        />
      </div>

      <div className="import-fields-card">
        <div className="import-fields-header">
          <span>字段管理（点击 ✕ 删除）</span>
          <button className="btn btn--sm btn--secondary" onClick={handleAddField}>
            + 新增字段
          </button>
        </div>
        <div className="import-fields-list">
          {sortedFields.map((field) => (
            <span key={field.id} className={`import-field-pill ${field.required ? 'required' : ''}`}>
              {field.name}{field.required ? '*' : ''}
              {!field.required ? (
                <button onClick={() => handleRemoveField(field.id, field.name)}>✕</button>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {uploadedFiles.length > 0 ? (
        <div className="import-files-card">
          <div className="import-files-header">
            <h4>已上传文件 ({uploadedFiles.length})</h4>
            <button className="btn btn--primary" onClick={() => setStep('mapping')}>
              进入字段映射 →
            </button>
          </div>
          <div className="import-files-list">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="import-file-item">
                <div className="import-file-info">
                  <div className="import-file-name">{file.name}</div>
                  <div className="import-file-meta">
                    {file.extractedSource ? <span className="import-file-tag source">{file.extractedSource}</span> : null}
                    {file.extractedEvent ? <span className="import-file-tag event">{file.extractedEvent}</span> : null}
                  </div>
                  <div className="import-file-rows">{file.totalRows} 行数据</div>
                </div>
                <button
                  className="btn btn--ghost import-file-remove"
                  onClick={() => removeFile(file.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )

  const currentStepInfo = STEPS.find((step) => step.key === currentStep) || STEPS[0]

  if (!raceId) {
    return (
      <AppH5Surface
        className="import-page"
        eyebrow="我的赛事"
        title="名单导入"
        summary="上传报名名单、校正字段、执行清洗并提交入库，让选手链路从源头保持一致。"
        metrics={metrics}
      >
        <AppH5ContextState
          title="请先选择赛事"
          description="在顶部控制面板中选择目标赛事后，才能导入名单。"
        />
      </AppH5Surface>
    )
  }

  return (
    <AppH5Surface
      className="import-page"
      eyebrow="我的赛事"
      title="名单导入"
      summary="上传本地报名数据，完成字段映射、清洗与预览后，再安全提交。"
      metrics={metrics}
    >

      {message ? <AppH5Notice tone={messageTone}>{message}</AppH5Notice> : null}

      <AppH5Panel title="导入阶段" summary="保持同一条作业链路，避免在多个旧页面之间来回跳转。">
        <AppH5Tabs
          className="import-steps"
          items={stepTabs}
          ariaLabel="名单导入步骤"
        />
      </AppH5Panel>

      <AppH5Panel title={currentStepInfo.label} summary={currentStepInfo.desc}>
        {currentStep === 'upload' ? renderUploadStep() : null}
        {currentStep === 'mapping' ? renderMappingStep() : null}
        {currentStep === 'cleaning' ? (
          uploadedFiles.length > 0
            ? <DataCleaner raceId={raceId} />
            : <AppH5EmptyState icon="CLN" title="请先上传文件" description="完成字段映射后，才能进入数据清洗。" />
        ) : null}
        {currentStep === 'preview' ? (
          uploadedFiles.length > 0
            ? <DataPreview raceId={raceId} />
            : <AppH5EmptyState icon="PVW" title="请先上传文件" description="请先完成前面的导入步骤。" />
        ) : null}
      </AppH5Panel>

      <AppH5Panel
        title="姓氏拼音补充规则"
        summary="名单清洗和姓名转拼音会共享这里的本地补充映射，行为与 TOOL 端保持一致。"
      >
        <SurnamePinyinSettings />
      </AppH5Panel>
    </AppH5Surface>
  )
}

function currentStepInfoLabel(stepKey) {
  return STEPS.find((step) => step.key === stepKey)?.label || '上传'
}
