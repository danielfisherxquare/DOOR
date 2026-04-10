import { useEffect, useMemo, useState } from 'react'
import identityCenterApi from '../../../api/identityCenter'
import {
  AdminEmptyState,
  AdminNotice,
  AdminStatusPill,
  AdminSurface,
} from '../../../components/admin/AdminWorkbench'

export default function IdentityOrgRacePanel({ orgId, refreshToken, onDirtyChange, onMessage, onRefresh }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [matrixData, setMatrixData] = useState(null)
  const [selection, setSelection] = useState({})
  const [originalSelection, setOriginalSelection] = useState({})

  useEffect(() => {
    let active = true
    setLoading(true)
    identityCenterApi.getOrgRaceMatrix({ orgId })
      .then((res) => {
        if (!active || !res?.success) return
        const nextSelection = {}
        for (const race of res.data.races || []) {
          nextSelection[race.id] = race.ownership === 'owned' ? 'owned' : (race.explicitAccessLevel || '')
        }
        setMatrixData(res.data)
        setSelection(nextSelection)
        setOriginalSelection(nextSelection)
      })
      .catch((error) => {
        if (active) onMessage('danger', error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [onMessage, orgId, refreshToken])

  const hasChanges = useMemo(() => {
    const keys = new Set([...Object.keys(selection), ...Object.keys(originalSelection)])
    for (const key of keys) {
      if ((selection[key] || '') !== (originalSelection[key] || '')) return true
    }
    return false
  }, [originalSelection, selection])

  useEffect(() => {
    onDirtyChange(hasChanges)
  }, [hasChanges, onDirtyChange])

  const handleSave = async () => {
    if (!matrixData?.canEdit) return
    setSaving(true)
    try {
      const permissions = Object.entries(selection)
        .filter(([, value]) => value === 'viewer' || value === 'editor')
        .map(([raceId, accessLevel]) => ({ raceId: Number(raceId), accessLevel }))
      const res = await identityCenterApi.saveOrgRaceMatrix({ orgId }, permissions)
      const nextSelection = {}
      for (const race of res.data.races || []) {
        nextSelection[race.id] = race.ownership === 'owned' ? 'owned' : (race.explicitAccessLevel || '')
      }
      setMatrixData(res.data)
      setSelection(nextSelection)
      setOriginalSelection(nextSelection)
      onMessage('success', '机构赛事范围已保存，用户赛事矩阵已按新范围重新加载。')
      onRefresh()
    } catch (error) {
      onMessage('danger', error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminSurface
      title="机构赛事范围矩阵"
      subtitle="机构赛事范围是个人赛事授权的上游。本机构自有赛事固定为 editor，外部赛事才允许配置 viewer / editor / 未授权。"
      actions={matrixData?.canEdit && hasChanges ? (
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelection(originalSelection)}>重置变更</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存范围'}
          </button>
        </>
      ) : null}
    >
      {loading ? (
        <AdminEmptyState title="机构赛事范围载入中" description="正在读取当前机构的自有赛事与外部授权范围。" />
      ) : !matrixData ? (
        <AdminEmptyState title="未获取到机构赛事范围" description="请稍后重试。" />
      ) : (
        <>
          {!matrixData.canEdit ? (
            <AdminNotice tone="info">当前角色只能查看机构赛事范围，不能修改机构级授权。</AdminNotice>
          ) : null}
          <div className="identity-access-center-page__race-card-grid">
            {matrixData.races.map((race) => (
              <div key={race.id} className="identity-access-center-page__race-card">
                <div className="identity-access-center-page__race-card-header">
                  <div>
                    <div className="identity-access-center-page__primary-cell">{race.name}</div>
                    <div className="identity-access-center-page__secondary-cell">
                      {race.orgName || '-'}
                      {race.date ? ` · ${race.date}` : ''}
                    </div>
                  </div>
                  <AdminStatusPill tone={race.ownership === 'owned' ? 'success' : race.effectiveAccessLevel ? 'warning' : 'neutral'}>
                    {race.ownership === 'owned' ? '自有/editor' : race.effectiveAccessLevel || '未授权'}
                  </AdminStatusPill>
                </div>
                <div className="identity-access-center-page__race-card-body">
                  {race.editable ? (
                    <select
                      className="input"
                      value={selection[race.id] || ''}
                      onChange={(event) => setSelection((current) => ({ ...current, [race.id]: event.target.value }))}
                    >
                      <option value="">未授权</option>
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                    </select>
                  ) : (
                    <div className="identity-access-center-page__read-only-value">
                      {race.ownership === 'owned' ? '本机构自有赛事，固定 editor' : '当前角色只读'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AdminSurface>
  )
}
