import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import racesApi from '../../api/races'
import adminApi from '../../api/adminApi'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandShell,
} from '../../components/command/CommandPrimitives'

const createEmptyEvent = () => ({
  name: '',
  targetCount: 0,
})

const normalizeEventsForForm = (events) => {
  if (!Array.isArray(events) || events.length === 0) return [createEmptyEvent()]
  return events.map((event) => ({
    name: typeof event?.name === 'string' ? event.name : '',
    targetCount: Number.isFinite(Number(event?.targetCount)) ? Math.max(0, Math.floor(Number(event.targetCount))) : 0,
  }))
}

const normalizeEventsForSubmit = (events) => {
  if (!Array.isArray(events)) return []
  return events
    .map((event) => ({
      name: typeof event?.name === 'string' ? event.name.trim() : '',
      targetCount: Number.isFinite(Number(event?.targetCount)) ? Math.max(0, Math.floor(Number(event.targetCount))) : 0,
    }))
    .filter((event) => event.name)
}

const buildEmptyForm = (orgId = '') => ({
  name: '',
  date: '',
  location: '',
  conflictRule: 'strict',
  orgId,
  events: [createEmptyEvent()],
})

function RaceManagementPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const [searchParams] = useSearchParams()
  const selectedOrgId = searchParams.get('orgId') || ''

  const [orgs, setOrgs] = useState([])
  const [races, setRaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')

  const [editingRace, setEditingRace] = useState(null)
  const [form, setForm] = useState(buildEmptyForm(selectedOrgId))

  useEffect(() => {
    if (!isSuperAdmin) return
    adminApi.getOrgs({ limit: 500 })
      .then((res) => {
        if (res.success) setOrgs(res.data.items || [])
      })
      .catch(() => {})
  }, [isSuperAdmin])

  useEffect(() => {
    if (!isSuperAdmin || editingRace) return
    setForm((prev) => ({ ...prev, orgId: selectedOrgId || prev.orgId }))
  }, [isSuperAdmin, selectedOrgId, editingRace])

  const orgNameById = useMemo(
    () => new Map((orgs || []).map((org) => [String(org.id), org.name])),
    [orgs],
  )

  const sanitizedEvents = useMemo(() => normalizeEventsForSubmit(form.events), [form.events])

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false
    if (!form.date) return false
    if (sanitizedEvents.length === 0) return false
    if (!isSuperAdmin) return true
    const targetOrgId = editingRace?.orgId || form.orgId || selectedOrgId
    return !!targetOrgId
  }, [form.name, form.date, form.orgId, isSuperAdmin, editingRace, selectedOrgId, sanitizedEvents.length])

  const metrics = useMemo(() => {
    const totalEvents = races.reduce((sum, race) => sum + (Array.isArray(race.events) ? race.events.length : 0), 0)
    const totalTargets = races.reduce((sum, race) => sum + (Array.isArray(race.events) ? race.events.reduce((acc, item) => acc + (Number(item?.targetCount) || 0), 0) : 0), 0)
    return [
      { key: 'races', label: '赛事总数', value: races.length, meta: '当前上下文内可见的赛事数量', pill: 'RC' },
      { key: 'events', label: '项目总数', value: totalEvents, meta: '各赛事下配置的比赛项目数量', pill: 'EV' },
      { key: 'targets', label: '目标人数', value: totalTargets.toLocaleString(), meta: '所有项目目标人数的合计', pill: 'TG' },
    ]
  }, [races])

  const loadRaces = async () => {
    setLoading(true)
    setMessage('')

    try {
      const params = isSuperAdmin && selectedOrgId ? { orgId: selectedOrgId } : undefined
      const res = await racesApi.getAll(params)
      if (res.success) {
        setRaces(Array.isArray(res.data) ? res.data : [])
      }
    } catch (err) {
      setMessage(`加载赛事失败：${err.message}`)
      setMessageTone('danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRaces()
  }, [isSuperAdmin, selectedOrgId])

  const resetForm = () => {
    setEditingRace(null)
    setForm(buildEmptyForm(selectedOrgId))
  }

  const updateEvent = (index, key, value) => {
    setForm((prev) => {
      const nextEvents = [...(prev.events || [])]
      const current = nextEvents[index] || createEmptyEvent()
      nextEvents[index] = {
        ...current,
        [key]: key === 'targetCount'
          ? (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0)
          : value,
      }
      return { ...prev, events: nextEvents }
    })
  }

  const addEventRow = () => {
    setForm((prev) => ({ ...prev, events: [...(prev.events || []), createEmptyEvent()] }))
  }

  const removeEventRow = (index) => {
    setForm((prev) => {
      const nextEvents = (prev.events || []).filter((_, idx) => idx !== index)
      return { ...prev, events: nextEvents.length > 0 ? nextEvents : [createEmptyEvent()] }
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return

    setSaving(true)
    setMessage('')

    const payload = {
      name: form.name.trim(),
      date: form.date || '',
      location: form.location || '',
      conflictRule: form.conflictRule,
      events: sanitizedEvents,
    }

    if (isSuperAdmin) {
      const targetOrgId = editingRace?.orgId || form.orgId || selectedOrgId
      payload.orgId = targetOrgId
    }

    try {
      if (editingRace?.id) {
        const res = await racesApi.update(editingRace.id, payload)
        if (res.success) {
          setMessage('赛事更新成功')
          setMessageTone('success')
        }
      } else {
        const res = await racesApi.create(payload)
        if (res.success) {
          setMessage('赛事创建成功')
          setMessageTone('success')
        }
      }

      resetForm()
      await loadRaces()
    } catch (err) {
      setMessage(`保存失败：${err.message}`)
      setMessageTone('danger')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (race) => {
    setEditingRace(race)
    setForm({
      name: race.name || '',
      date: race.date || '',
      location: race.location || '',
      conflictRule: race.conflictRule || 'strict',
      orgId: race.orgId || selectedOrgId || '',
      events: normalizeEventsForForm(race.events),
    })
    setMessage('')
  }

  const handleDelete = async (race) => {
    if (!window.confirm(`确定删除赛事「${race.name}」吗？该操作不可恢复。`)) return

    setMessage('')
    try {
      const res = await racesApi.remove(race.id)
      if (res.success) {
        setMessage('赛事删除成功')
        setMessageTone('success')
        if (editingRace?.id === race.id) resetForm()
        await loadRaces()
      }
    } catch (err) {
      setMessage(`删除失败：${err.message}`)
      setMessageTone('danger')
    }
  }

  const eventCount = (race) => (Array.isArray(race.events) ? race.events.length : 0)
  const eventTargetTotal = (race) => (Array.isArray(race.events)
    ? race.events.reduce((sum, item) => sum + (Number(item?.targetCount) || 0), 0)
    : 0)

  return (
    <div className="command-page surface-admin">
      <CommandShell
        eyebrow="赛事管理"
        title="赛事配置"
        summary="统一维护赛事主信息、项目设置与目标人数。创建、编辑和列表都对齐到指挥台语法。"
        actions={<button className="btn btn--secondary" onClick={loadRaces} disabled={loading || saving}>刷新</button>}
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      {isSuperAdmin && !selectedOrgId ? (
        <CommandNotice tone="warning">未锁定机构：当前展示全平台赛事。创建赛事时请在表单中明确所属机构。</CommandNotice>
      ) : null}

      {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}
      {loading ? <CommandNotice tone="info">正在加载赛事列表...</CommandNotice> : null}

      <div className="command-grid command-grid--stacked">
        <CommandPanel title={editingRace ? '编辑赛事' : '创建赛事'} subtitle="先定义赛事，再补齐比赛项目和目标人数。">
          <form onSubmit={handleSubmit} className="command-stack">
            {isSuperAdmin ? (
              <div className="input-group">
                <label>所属机构 *</label>
                <select
                  className="input"
                  value={form.orgId}
                  onChange={(event) => setForm((prev) => ({ ...prev, orgId: event.target.value }))}
                  disabled={!!editingRace}
                >
                  <option value="">请选择机构</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="input-group">
              <label>赛事名称 *</label>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：2026 春季马拉松"
              />
            </div>

            <div className="command-field-grid">
              <div className="input-group">
                <label>赛事日期</label>
                <input
                  className="input"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                />
              </div>

              <div className="input-group">
                <label>地点</label>
                <input
                  className="input"
                  value={form.location}
                  onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                  placeholder="例如：北京"
                />
              </div>
            </div>

            <div className="input-group">
              <label>比赛项目与目标人数 *</label>
              <div className="event-rows-compact">
                {(form.events || []).map((eventItem, index) => (
                  <div key={`event-${index}`} className="event-row-compact">
                    <input
                      className="input input--compact"
                      value={eventItem.name}
                      onChange={(event) => updateEvent(index, 'name', event.target.value)}
                      placeholder="项目名称"
                    />
                    <input
                      className="input input--compact input--number"
                      type="number"
                      min={0}
                      step={1}
                      value={eventItem.targetCount}
                      onChange={(event) => updateEvent(index, 'targetCount', event.target.value)}
                      placeholder="目标人数"
                    />
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--icon"
                      onClick={() => removeEventRow(index)}
                      disabled={(form.events || []).length <= 1}
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="event-row-actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={addEventRow}>+ 添加项目</button>
                <span className="event-total">总计：{sanitizedEvents.reduce((sum, item) => sum + item.targetCount, 0).toLocaleString()} 人</span>
              </div>
            </div>

            <div className="input-group">
              <label>冲突规则</label>
              <select
                className="input"
                value={form.conflictRule}
                onChange={(event) => setForm((prev) => ({ ...prev, conflictRule: event.target.value }))}
              >
                <option value="strict">严格</option>
                <option value="permissive">宽松</option>
              </select>
            </div>

            <div className="command-actions-row">
              <button type="submit" className="btn btn--primary" disabled={!canSubmit || saving}>
                {saving ? '保存中...' : (editingRace ? '保存修改' : '创建赛事')}
              </button>
              {editingRace ? (
                <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={saving}>
                  取消编辑
                </button>
              ) : null}
            </div>
          </form>
        </CommandPanel>

        <CommandPanel title="赛事列表" subtitle="编辑会把当前赛事带回左侧表单，删除将直接移除该赛事。">
          {!loading && races.length === 0 ? (
            <CommandEmptyState title="暂无赛事" description="先创建一个赛事，再配置项目、目标人数和规则。" icon="RC" />
          ) : null}

          {!loading && races.length > 0 ? (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>名称</th>
                  {isSuperAdmin ? <th>机构</th> : null}
                  <th>日期</th>
                  <th>地点</th>
                  <th>项目数</th>
                  <th>目标人数</th>
                  <th>规则</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {races.map((race) => (
                  <tr key={race.id}>
                    <td>{race.name}</td>
                    {isSuperAdmin ? <td>{orgNameById.get(String(race.orgId)) || race.orgId || '-'}</td> : null}
                    <td>{race.date || '-'}</td>
                    <td>{race.location || '-'}</td>
                    <td>{eventCount(race)}</td>
                    <td>{eventTargetTotal(race).toLocaleString()}</td>
                    <td>{race.conflictRule === 'permissive' ? '宽松' : '严格'}</td>
                    <td>
                      <div className="command-actions-row">
                        <button className="btn btn--ghost btn--sm" onClick={() => handleEdit(race)}>编辑</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(race)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          ) : null}
        </CommandPanel>
      </div>
    </div>
  )
}

export default RaceManagementPage
