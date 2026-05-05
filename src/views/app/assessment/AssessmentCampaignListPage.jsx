import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import racesApi from '../../../api/races'
import assessmentAdminApi from '../../../api/assessmentAdmin'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandShell,
  CommandStatusTag,
} from '../../../components/command/CommandPrimitives'

const STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  closed: '已关闭',
  archived: '已归档',
}

const DEFAULT_TEMPLATE_ITEMS = [
  { id: 'skill', title: '业务技能与专业度', description: '个人硬技能扎实，能熟练操作负责的设备或精准提供对应服务，无低级业务失误。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'quality', title: '工作质量与完成度', description: '负责的具体工作按质、按量完成，交付结果达到赛事标准，无明显偷工减料或敷衍。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'schedule', title: '进度把控与履约', description: '个人动作迅速，进场、彩排、正赛、撤场等环节严守时间节点，不拖团队后腿。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'coordination', title: '协同配合与大局观', description: '与团队内外部人员顺畅对接，互相补位，服从现场统一调度，不推诿扯皮。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'execution', title: '需求理解与执行力', description: '对甲方或总控下达的指令能一次性听懂，不跑偏，并迅速转化为实际行动。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'feedback', title: '信息反馈与响应', description: '保持通讯畅通，遇到问题、进度受阻或完成任务时，能第一时间真实汇报，不隐瞒。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'discipline', title: '工作纪律与风貌', description: '精神面貌积极饱满，严格遵守赛场纪律，不迟到早退，不酒后上岗，不擅自离岗。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'ownership', title: '服务意识与责任心', description: '具备主人翁意识，眼里有活，能主动发现并填补负责区域内的服务、安全或执行盲区。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'risk', title: '风险意识与敏锐度', description: '能够敏锐察觉自己点位上的安全隐患、设备异常、极端天气前兆等问题并预警。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
  { id: 'pressure', title: '突发应变与抗压能力', description: '面对现场高压、突发状况或临时加派的任务，能保持情绪稳定，反应迅速且处理得当。', weight: 1, scoreMin: 0, scoreMax: 10, required: true },
]

function getStatusTone(status) {
  if (status === 'published') return 'success'
  if (status === 'closed') return 'warning'
  if (status === 'archived') return 'danger'
  return 'neutral'
}

function AssessmentCampaignListPage() {
  const [campaigns, setCampaigns] = useState([])
  const [races, setRaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')
  const [form, setForm] = useState({
    raceId: '',
    name: '',
    year: new Date().getFullYear(),
  })

  const selectedRace = useMemo(
    () => races.find((race) => String(race.id) === String(form.raceId)),
    [races, form.raceId],
  )

  const metrics = useMemo(() => {
    const published = campaigns.filter((campaign) => campaign.status === 'published').length
    const memberCount = campaigns.reduce((sum, campaign) => sum + Number(campaign.memberCount || 0), 0)
    return [
      { key: 'total', label: '活动总数', value: campaigns.length, meta: '当前后台已创建的考评活动', pill: 'AS' },
      { key: 'published', label: '已发布', value: published, meta: '正在对外开放或正在执行的考评活动', pill: 'PUB' },
      { key: 'members', label: '成员覆盖', value: memberCount, meta: '纳入考评流程的成员总数', pill: 'MB' },
    ]
  }, [campaigns])

  const loadData = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [campaignRes, raceRes] = await Promise.all([
        assessmentAdminApi.listCampaigns(),
        racesApi.getAll(),
      ])
      if (campaignRes.success) setCampaigns(campaignRes.data || [])
      if (raceRes.success) setRaces(raceRes.data || [])
    } catch (error) {
      setMessage(error.message)
      setMessageTone('danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!form.raceId) return
    setSaving(true)
    setMessage('')
    try {
      const campaignName = form.name.trim() || selectedRace?.name || ''
      const res = await assessmentAdminApi.createCampaign({
        raceId: Number(form.raceId),
        name: campaignName,
        year: Number(form.year),
        templateTitle: campaignName ? `${campaignName}考评表` : '赛事考评表',
        templateInstructions: '',
        templateItems: DEFAULT_TEMPLATE_ITEMS,
      })
      if (res.success) {
        setMessage('考评活动创建成功。')
        setMessageTone('success')
        setForm({ raceId: '', name: '', year: new Date().getFullYear() })
        await loadData()
      }
    } catch (error) {
      setMessage(error.message)
      setMessageTone('danger')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (campaign) => {
    if (!campaign?.id) return
    const confirmed = window.confirm(`确认删除考评活动“${campaign.name}”吗？删除后将同时清理该活动下的成员、邀请码、草稿、提交和报表数据，此操作不可恢复。`)
    if (!confirmed) return

    setDeletingId(campaign.id)
    setMessage('')
    try {
      const res = await assessmentAdminApi.deleteCampaign(campaign.id)
      if (res.success) {
        setMessage(`考评活动“${campaign.name}”已删除。`)
        setMessageTone('success')
        await loadData()
      }
    } catch (error) {
      setMessage(error.message)
      setMessageTone('danger')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="command-page surface-app">
      <CommandShell
        eyebrow="考评管理"
        title="考评活动"
        summary="统一管理赛事考评活动、成员覆盖范围与邀请码分发链路。"
        actions={<button className="btn btn--secondary" onClick={() => void loadData()} disabled={loading || saving || Boolean(deletingId)}>刷新</button>}
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}
      {loading ? <CommandNotice tone="info">正在加载考评活动与赛事列表...</CommandNotice> : null}

      <div className="command-grid command-grid--two">
        <CommandPanel title="创建考评活动" subtitle="选择赛事后，系统会自动注入默认考评模板。">
          <form onSubmit={handleCreate} className="command-stack">
            <div className="input-group">
              <label>赛事</label>
              <select
                className="input"
                value={form.raceId}
                onChange={(event) => setForm((prev) => ({ ...prev, raceId: event.target.value }))}
              >
                <option value="">请选择赛事</option>
                {races.map((race) => (
                  <option key={race.id} value={race.id}>{race.name}</option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label>考评名称</label>
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="默认使用赛事名称"
              />
            </div>

            <div className="input-group">
              <label>年份</label>
              <input
                className="input"
                type="number"
                value={form.year}
                onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
              />
            </div>

            <div className="command-actions-row">
              <button className="btn btn--primary" type="submit" disabled={saving || !form.raceId || Boolean(deletingId)}>
                {saving ? '创建中...' : '创建活动'}
              </button>
            </div>
          </form>
        </CommandPanel>

        <CommandPanel title="活动列表" subtitle="进入详情页可以继续管理成员、邀请码、模板和报表。">
          {!loading && campaigns.length === 0 ? (
            <CommandEmptyState title="暂无考评活动" description="先创建一个考评活动，再进入详情页完成模板和成员配置。" icon="AS" />
          ) : null}

          {!loading && campaigns.length > 0 ? (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>赛事</th>
                  <th>状态</th>
                  <th>成员</th>
                  <th>邀请码</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>{campaign.name}</td>
                    <td>{campaign.raceName || '-'}</td>
                    <td>
                      <CommandStatusTag tone={getStatusTone(campaign.status)}>
                        {STATUS_LABELS[campaign.status] || campaign.status}
                      </CommandStatusTag>
                    </td>
                    <td>{campaign.memberCount}</td>
                    <td>{campaign.inviteCodeCount}</td>
                    <td>
                      <div className="command-actions-row">
                        <Link className="btn btn--ghost btn--sm" to={`/app/assessment/${campaign.id}`}>详情</Link>
                        <button
                          className="btn btn--ghost btn--sm"
                          type="button"
                          onClick={() => void handleDelete(campaign)}
                          disabled={saving || loading || deletingId === campaign.id}
                        >
                          {deletingId === campaign.id ? '删除中...' : '删除'}
                        </button>
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

export default AssessmentCampaignListPage
