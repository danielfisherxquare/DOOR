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

  const selectedRace = useMemo(
    () => races.find((race) => String(race.id) === String(form.raceId)),
    [races, form.raceId],
  )

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
      const res = await assessmentAdminApi.createCampaign({
        raceId: Number(form.raceId),
        name: form.name.trim() || selectedRace?.name || '',
        year: Number(form.year),
      })
      if (res.success) {
        setMessage('考评活动创建成功')
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
            <select
              className="input"
              value={form.raceId}
              onChange={(e) => setForm((prev) => ({ ...prev, raceId: e.target.value }))}
            >
              <option value="">请选择赛事</option>
              {races.map((race) => (
                <option key={race.id} value={race.id}>{race.name}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>考评名称</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="默认使用赛事名称"
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>年份</label>
            <input
              className="input"
              type="number"
              value={form.year}
              onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
            />
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
