import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import racesApi from '../../../api/races'
import assessmentAdminApi from '../../../api/assessmentAdmin'

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

function AssessmentCampaignListPage() {
  const [campaigns, setCampaigns] = useState([])
  const [races, setRaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    raceId: '',
    name: '',
    year: new Date().getFullYear(),
  })

  const selectedRace = useMemo(() => races.find((race) => String(race.id) === String(form.raceId)), [races, form.raceId])

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
        setForm({ raceId: '', name: '', year: new Date().getFullYear() })
        await loadData()
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>考评管理</h1>
        <button className="btn btn--secondary" onClick={() => void loadData()} disabled={loading || saving}>刷新</button>
      </div>

      {message && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.1)' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16 }}>
        <form onSubmit={handleCreate} style={cardStyle}>
          <div style={cardTitleStyle}>创建考评活动</div>

          <div style={fieldStyle}>
            <label style={labelStyle}>赛事</label>
            <select className="input" value={form.raceId} onChange={(event) => setForm((prev) => ({ ...prev, raceId: event.target.value }))}>
              <option value="">请选择赛事</option>
              {races.map((race) => (
                <option key={race.id} value={race.id}>{race.name}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>考评名称</label>
            <input className="input" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="默认使用赛事名称" />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>年份</label>
            <input className="input" type="number" value={form.year} onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))} />
          </div>

          <button className="btn btn--primary" type="submit" disabled={saving || !form.raceId}>
            {saving ? '创建中...' : '创建'}
          </button>
        </form>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>考评活动列表</div>
          {loading ? (
            <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>加载中...</div>
          ) : campaigns.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>暂无考评活动</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>名称</th>
                  <th style={thStyle}>赛事</th>
                  <th style={thStyle}>状态</th>
                  <th style={thStyle}>成员</th>
                  <th style={thStyle}>邀请码</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                    <td style={tdStyle}>{campaign.name}</td>
                    <td style={tdStyle}>{campaign.raceName || '-'}</td>
                    <td style={tdStyle}>{STATUS_LABELS[campaign.status] || campaign.status}</td>
                    <td style={tdStyle}>{campaign.memberCount}</td>
                    <td style={tdStyle}>{campaign.inviteCodeCount}</td>
                    <td style={tdStyle}>
                      <Link className="btn btn--ghost btn--sm" to={`/admin/assessment/${campaign.id}`}>详情</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

const cardStyle = {
  background: 'var(--color-bg-card, #fff)',
  borderRadius: 12,
  padding: 20,
  boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
}

const cardTitleStyle = { fontSize: 18, fontWeight: 700, marginBottom: 16 }
const fieldStyle = { display: 'grid', gap: 8, marginBottom: 14 }
const labelStyle = { fontSize: 13, fontWeight: 600 }
const thStyle = { textAlign: 'left', padding: '10px 8px', fontSize: 13 }
const tdStyle = { padding: '12px 8px', fontSize: 14 }

export default AssessmentCampaignListPage
