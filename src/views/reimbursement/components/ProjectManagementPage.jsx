import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useReimbursementStore from '../../../stores/reimbursementStore'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandStatusTag,
} from '../../../components/command/CommandPrimitives'

function currency(value) {
  return `¥${Number(value || 0).toLocaleString()}`
}

function formatDate(value) {
  if (!value) return '未更新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未更新'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function createInitialDraft() {
  return {
    name: '',
    shortName: '',
    description: '',
  }
}

function ProjectManagementPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    projects,
    activeProjectId,
    isLoading,
    error,
    clearError,
    createProject,
    switchProject,
    updateProject,
    deleteProject,
    clearProjectRecords,
  } = useReimbursementStore()

  const [createDraft, setCreateDraft] = useState(createInitialDraft())
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editDraft, setEditDraft] = useState(createInitialDraft())

  const metrics = useMemo(() => {
    const activeCount = projects.filter((project) => project.status === 'active').length
    const totalRecords = projects.reduce((sum, project) => sum + Number(project.record_count || 0), 0)
    const totalExpense = projects.reduce((sum, project) => sum + Number(project.total_expense || 0), 0)
    return [
      { key: 'count', label: '项目总数', value: String(projects.length), meta: '你创建并可直接维护的项目。', pill: 'PRJ' },
      { key: 'active', label: '进行中', value: String(activeCount), meta: '当前仍在使用中的报销项目。', pill: 'LIVE' },
      { key: 'records', label: '明细总量', value: String(totalRecords), meta: '所有项目下累计的报销记录。', pill: 'ROW' },
      { key: 'expense', label: '累计支出', value: currency(totalExpense), meta: '按项目汇总后的历史支出。', pill: 'OUT' },
    ]
  }, [projects])

  const resetCreateDraft = () => setCreateDraft(createInitialDraft())
  const resetEditDraft = () => {
    setEditingProjectId(null)
    setEditDraft(createInitialDraft())
  }

  const handleCreate = async () => {
    if (!createDraft.name.trim()) return
    await createProject(
      createDraft.name.trim(),
      createDraft.shortName.trim() || null,
      createDraft.description.trim() || null,
    )
    resetCreateDraft()
  }

  const handleEditStart = (project) => {
    setEditingProjectId(project.id)
    setEditDraft({
      name: project.name || '',
      shortName: project.short_name || '',
      description: project.description || '',
    })
  }

  const handleEditSave = async () => {
    if (!editingProjectId || !editDraft.name.trim()) return
    await updateProject(editingProjectId, {
      name: editDraft.name.trim(),
      shortName: editDraft.shortName.trim() || null,
      description: editDraft.description.trim() || null,
    })
    resetEditDraft()
  }

  const handleOpenProject = async (projectId) => {
    await switchProject(projectId)
    navigate({ pathname: '/app/reimbursements', search: location.search })
  }

  const handleClearRecords = async (project) => {
    const ok = window.confirm(`确认清空“${project.name}”的全部报销明细吗？此操作会删除该项目下的记录、匹配结果和处理状态。`)
    if (!ok) return
    await clearProjectRecords(project.id)
  }

  const handleDelete = async (project) => {
    const hasRecords = Number(project.record_count || 0) > 0
    const message = hasRecords
      ? `确认删除“${project.name}”吗？项目及其 ${project.record_count} 条记录会被永久删除。`
      : `确认删除空项目“${project.name}”吗？`
    const ok = window.confirm(message)
    if (!ok) return
    await deleteProject(project.id)
    if (editingProjectId === project.id) {
      resetEditDraft()
    }
  }

  return (
    <div className="reimbursement-project-admin">
      {error ? (
        <CommandNotice tone="danger">
          {error}
          <button className="btn btn--ghost btn--sm" onClick={clearError}>关闭</button>
        </CommandNotice>
      ) : null}

      <CommandMetricGrid items={metrics} />

      <div className="reimbursement-project-admin__grid">
        <CommandPanel
          title="新建项目"
          subtitle="集中维护项目名称、简称和归档用途，避免只靠下拉框操作。"
          className="reimbursement-project-admin__panel"
          actions={(
            <button
              className="btn btn--primary"
              onClick={handleCreate}
              disabled={isLoading || !createDraft.name.trim()}
            >
              创建项目
            </button>
          )}
        >
          <div className="reimbursement-project-form">
            <label className="reimbursement-project-form__field">
              <span>项目名称</span>
              <input
                type="text"
                className="input"
                placeholder="例如：上海差旅 2026-04"
                value={createDraft.name}
                onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="reimbursement-project-form__field">
              <span>项目简称</span>
              <input
                type="text"
                className="input"
                placeholder="导出文件前缀，可留空"
                maxLength={20}
                value={createDraft.shortName}
                onChange={(event) => setCreateDraft((current) => ({ ...current, shortName: event.target.value }))}
              />
            </label>
            <label className="reimbursement-project-form__field reimbursement-project-form__field--full">
              <span>项目说明</span>
              <textarea
                className="input reimbursement-project-form__textarea"
                placeholder="记录用途、月份或报销范围，方便后续回看。"
                value={createDraft.description}
                onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
          </div>
          <div className="reimbursement-project-form__footer">
            <span className="reimbursement-project-form__hint">创建后会自动切换为当前项目，随后可直接返回工作区继续导入与识别。</span>
            <button className="btn btn--ghost" onClick={resetCreateDraft} disabled={isLoading}>
              重置
            </button>
          </div>
        </CommandPanel>

        <CommandPanel
          title={editingProjectId ? '编辑项目' : '编辑区'}
          subtitle={editingProjectId ? '更新当前项目的名称、简称和说明。' : '从下方列表选择“编辑”，在这里修改项目信息。'}
          className="reimbursement-project-admin__panel"
          actions={editingProjectId ? (
            <div className="command-actions-row">
              <button className="btn btn--primary" onClick={handleEditSave} disabled={isLoading || !editDraft.name.trim()}>
                保存修改
              </button>
              <button className="btn btn--ghost" onClick={resetEditDraft} disabled={isLoading}>
                取消
              </button>
            </div>
          ) : null}
        >
          {editingProjectId ? (
            <div className="reimbursement-project-form">
              <label className="reimbursement-project-form__field">
                <span>项目名称</span>
                <input
                  type="text"
                  className="input"
                  value={editDraft.name}
                  onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="reimbursement-project-form__field">
                <span>项目简称</span>
                <input
                  type="text"
                  className="input"
                  maxLength={20}
                  value={editDraft.shortName}
                  onChange={(event) => setEditDraft((current) => ({ ...current, shortName: event.target.value }))}
                />
              </label>
              <label className="reimbursement-project-form__field reimbursement-project-form__field--full">
                <span>项目说明</span>
                <textarea
                  className="input reimbursement-project-form__textarea"
                  value={editDraft.description}
                  onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
            </div>
          ) : (
            <CommandEmptyState
              title="还没有选择要编辑的项目"
              description="项目管理页已经接入删除和清空动作，建议先在这里核对再回到报销工作区。"
              icon="PM"
            />
          )}
        </CommandPanel>
      </div>

      <CommandPanel
        title="我的项目"
        subtitle="从这里进入项目、清空历史明细或直接删除不再需要的项目。"
        actions={(
          <button className="btn btn--ghost" onClick={() => navigate({ pathname: '/app/reimbursements', search: location.search })}>
            返回工作区
          </button>
        )}
      >
        {!projects.length ? (
          <CommandEmptyState
            title="还没有报销项目"
            description="先创建一个项目，随后就可以在这里继续维护、清空或删除。"
            icon="RB"
          />
        ) : (
          <CommandDataTable>
            <thead>
              <tr>
                <th>项目</th>
                <th>简称</th>
                <th>状态</th>
                <th>明细数</th>
                <th>总支出</th>
                <th>最后更新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <div className="reimbursement-project-row">
                      <strong>{project.name}</strong>
                      <span>{project.description || '未填写项目说明'}</span>
                    </div>
                  </td>
                  <td>{project.short_name || '-'}</td>
                  <td>
                    <div className="reimbursement-project-tags">
                      <CommandStatusTag tone={project.status === 'active' ? 'success' : 'warning'}>
                        {project.status === 'active' ? '进行中' : '已归档'}
                      </CommandStatusTag>
                      {project.id === activeProjectId ? (
                        <CommandStatusTag tone="warning">当前项目</CommandStatusTag>
                      ) : null}
                    </div>
                  </td>
                  <td>{Number(project.record_count || 0)}</td>
                  <td>{currency(project.total_expense)}</td>
                  <td>{formatDate(project.updated_at || project.created_at)}</td>
                  <td>
                    <div className="reimbursement-project-actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => handleOpenProject(project.id)} disabled={isLoading}>
                        进入
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={() => handleEditStart(project)} disabled={isLoading}>
                        编辑
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={() => handleClearRecords(project)} disabled={isLoading || Number(project.record_count || 0) === 0}>
                        清空明细
                      </button>
                      <button className="btn btn--danger btn--sm" onClick={() => handleDelete(project)} disabled={isLoading}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </CommandDataTable>
        )}
      </CommandPanel>
    </div>
  )
}

export default ProjectManagementPage
