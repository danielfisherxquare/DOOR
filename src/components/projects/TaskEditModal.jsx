import { useCallback, useEffect, useMemo, useState } from 'react'
import projectsApi from '../../api/projects'
import './projects-components.css'

const MEMBER_TYPE_LABELS = {
  employee: '正式成员',
  external_support: '外援',
}

const EXTERNAL_TYPE_LABELS = {
  temporary: '临时外援',
  long_term: '长期外援',
}

export default function TaskEditModal({ task, projectId, onClose, onSaveSuccess }) {
  const [payload, setPayload] = useState({
    title: '',
    status: 'TODO',
    start_date: '',
    end_date: '',
    is_milestone: false,
    notes: '',
  })
  const [candidates, setCandidates] = useState([])
  const [candidateKeyword, setCandidateKeyword] = useState('')
  const [selectedAssignees, setSelectedAssignees] = useState([])
  const [saving, setSaving] = useState(false)
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  useEffect(() => {
    if (!task) return
    setPayload({
      title: task.title || '',
      status: task.status || 'TODO',
      start_date: task.start_date ? task.start_date.substring(0, 10) : '',
      end_date: task.end_date ? task.end_date.substring(0, 10) : '',
      is_milestone: Boolean(task.is_milestone),
      notes: task.notes || '',
    })
    setSelectedAssignees(
      (task.assignees || [])
        .filter((item) => item.teamMemberId)
        .map((item) => ({
          teamMemberId: item.teamMemberId,
          position: item.position || '',
        })),
    )
  }, [task])

  const selectedAssigneeMap = useMemo(
    () => new Map(selectedAssignees.map((item) => [item.teamMemberId, item])),
    [selectedAssignees],
  )

  const selectedSummary = useMemo(() => {
    const candidateMap = new Map(candidates.map((item) => [item.id, item]))
    return selectedAssignees
      .map((item) => {
        const candidate = candidateMap.get(item.teamMemberId)
        return candidate
          ? {
            ...candidate,
            scopedPosition: item.position || candidate.position || '',
          }
          : null
      })
      .filter(Boolean)
  }, [candidates, selectedAssignees])

  const positionOptions = useMemo(
    () => [...new Set(candidates.map((item) => String(item.position || '').trim()).filter(Boolean))],
    [candidates],
  )

  const loadCandidates = useCallback(async (keyword = '') => {
    setLoadingCandidates(true)
    try {
      const res = await projectsApi.getTeamCandidates(projectId, keyword)
      if (res.success) setCandidates(res.data || [])
    } finally {
      setLoadingCandidates(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!task) return
    void loadCandidates('')
  }, [loadCandidates, task])

  const toggleCandidate = (candidateId) => {
    setSelectedAssignees((prev) => {
      const existing = prev.find((item) => item.teamMemberId === candidateId)
      if (existing) return prev.filter((item) => item.teamMemberId !== candidateId)
      const candidate = candidates.find((item) => item.id === candidateId)
      return [...prev, { teamMemberId: candidateId, position: candidate?.position || '' }]
    })
  }

  const updateAssigneePosition = (candidateId, position) => {
    setSelectedAssignees((prev) => prev.map((item) => (
      item.teamMemberId === candidateId
        ? { ...item, position }
        : item
    )))
  }

  const handleSave = async () => {
    if (!payload.title.trim()) {
      window.alert('任务名称不能为空')
      return
    }
    if (payload.start_date && payload.end_date && new Date(payload.start_date) > new Date(payload.end_date)) {
      window.alert('开始日期不能晚于结束日期')
      return
    }

    setSaving(true)
    try {
      const taskPayload = {
        ...payload,
        start_date: payload.start_date || null,
        end_date: payload.end_date || null,
        responsible_group: null,
      }

      const taskRes = await projectsApi.updateTask(projectId, task.id, taskPayload)
      if (!taskRes.success) {
        window.alert(`保存失败：${taskRes.message || '未知错误'}`)
        return
      }

      const assigneePayload = selectedAssignees.map((item) => {
        const candidate = candidates.find((entry) => entry.id === item.teamMemberId)
        return {
          sourceType: 'team_member',
          teamMemberId: item.teamMemberId,
          employeeCode: candidate?.employeeCode || '',
          employeeName: candidate?.employeeName || '',
          position: item.position || candidate?.position || '',
        }
      })

      const assigneeRes = await projectsApi.setTaskAssignees(projectId, task.id, assigneePayload)
      if (!assigneeRes.success) {
        window.alert(`负责人保存失败：${assigneeRes.message || '未知错误'}`)
        return
      }

      onSaveSuccess()
    } catch (error) {
      window.alert(error.message || '网络错误')
    } finally {
      setSaving(false)
    }
  }

  if (!task) return null

  return (
    <div className="task-edit-backdrop">
      <div className="task-edit-card">
        <h3 className="task-edit-title">编辑任务</h3>

        <div className="task-edit-field">
          <label className="task-edit-label">任务名称 *</label>
          <input className="task-edit-input" value={payload.title} onChange={(event) => setPayload({ ...payload, title: event.target.value })} />
        </div>

        <div className="task-edit-row">
          <div>
            <label className="task-edit-label">状态</label>
            <select className="task-edit-select" value={payload.status} onChange={(event) => setPayload({ ...payload, status: event.target.value })}>
              <option value="TODO">待办</option>
              <option value="IN_PROGRESS">进行中</option>
              <option value="DONE">已完成</option>
              <option value="CANCELLED">已取消</option>
            </select>
          </div>
          <div>
            <label className="task-edit-label">里程碑</label>
            <select className="task-edit-select" value={payload.is_milestone ? 'yes' : 'no'} onChange={(event) => setPayload({ ...payload, is_milestone: event.target.value === 'yes' })}>
              <option value="no">否</option>
              <option value="yes">是</option>
            </select>
          </div>
        </div>

        <div className="task-edit-row">
          <div>
            <label className="task-edit-label">开始日期</label>
            <input className="task-edit-input" type="date" value={payload.start_date} onChange={(event) => setPayload({ ...payload, start_date: event.target.value })} />
          </div>
          <div>
            <label className="task-edit-label">结束日期</label>
            <input className="task-edit-input" type="date" value={payload.end_date} onChange={(event) => setPayload({ ...payload, end_date: event.target.value })} />
          </div>
        </div>

        <div className="task-edit-field">
          <label className="task-edit-label">负责人</label>
          <div className="task-edit-search-row">
            <input
              className="task-edit-input task-edit-search-input"
              value={candidateKeyword}
              onChange={(event) => setCandidateKeyword(event.target.value)}
              placeholder="搜索工号、姓名、岗位、部门"
            />
            <button className="btn btn--secondary" onClick={() => void loadCandidates(candidateKeyword)} disabled={loadingCandidates}>搜索</button>
          </div>
          <datalist id={`task-position-options-${task.id}`}>
            {positionOptions.map((item) => <option key={item} value={item} />)}
          </datalist>
          <div className="task-edit-candidate-list">
            {candidates.map((candidate) => {
              const selected = selectedAssigneeMap.get(candidate.id)
              return (
                <label key={candidate.id} className="task-edit-candidate-card">
                  <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleCandidate(candidate.id)} />
                  <div className="task-edit-candidate-info">
                    <div className="task-edit-candidate-name">{candidate.employeeCode} {candidate.employeeName}</div>
                    <div className="task-edit-candidate-meta">
                      {candidate.position || '未填写岗位'} · {candidate.department || '未填写部门'} · {MEMBER_TYPE_LABELS[candidate.memberType] || candidate.memberType}
                      {candidate.externalEngagementType ? ` · ${EXTERNAL_TYPE_LABELS[candidate.externalEngagementType] || candidate.externalEngagementType}` : ''}
                    </div>
                    {selected && (
                      <div className="task-edit-candidate-position">
                        <div className="task-edit-mini-label">本项目岗位 / 板块</div>
                        <input
                          className="task-edit-input task-edit-candidate-position-input"
                          value={selected.position}
                          onChange={(event) => updateAssigneePosition(candidate.id, event.target.value)}
                          placeholder="输入本项目岗位"
                          list={`task-position-options-${task.id}`}
                        />
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
            {candidates.length === 0 && <div className="task-edit-candidate-empty">当前没有可选团队成员。</div>}
          </div>
          {selectedSummary.length > 0 && (
            <div className="task-edit-selected-summary">
              {selectedSummary.map((item) => (
                <div key={item.id}>{item.employeeCode} {item.employeeName} · {item.scopedPosition || '未填写岗位'}</div>
              ))}
            </div>
          )}
        </div>

        <div className="task-edit-field">
          <label className="task-edit-label">备注</label>
          <textarea className="task-edit-textarea" rows={4} value={payload.notes} onChange={(event) => setPayload({ ...payload, notes: event.target.value })} />
        </div>

        <div className="task-edit-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存修改'}</button>
        </div>
      </div>
    </div>
  )
}

// 样式已迁移到 projects-components.css
