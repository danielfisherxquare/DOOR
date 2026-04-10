import { useEffect, useMemo, useState } from 'react'
import identityCenterApi from '../../../api/identityCenter'
import {
  AdminEmptyState,
  AdminPagination,
  AdminStatusPill,
  AdminSurface,
  AdminToolbar,
} from '../../../components/admin/AdminWorkbench'
import {
  buildUserRaceCell,
  cloneData,
  getUserRaceChoice,
  getUserRaceOptions,
  ROLE_LABELS,
} from './shared'

export default function IdentityUserRacePanel({ orgId, refreshToken, onDirtyChange, onMessage }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([])
  const [originalRows, setOriginalRows] = useState([])
  const [races, setRaces] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const limit = 10

  useEffect(() => {
    setPage(1)
  }, [orgId])

  useEffect(() => {
    let active = true
    setLoading(true)
    identityCenterApi.getUserRaceMatrix({ orgId, page, limit, keyword })
      .then((res) => {
        if (!active || !res?.success) return
        const nextRows = cloneData(res.data.items || [])
        setRows(nextRows)
        setOriginalRows(nextRows)
        setRaces(res.data.races || [])
        setTotal(Number(res.data.total || 0))
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
  }, [keyword, onMessage, orgId, page, refreshToken])

  const snapshot = useMemo(
    () => JSON.stringify(rows.map((row) => ({
      id: row.id,
      permissions: Object.values(row.permissions || {}).map((cell) => ({
        raceId: cell.raceId,
        explicitAccessLevel: cell.explicitAccessLevel || null,
      })),
    }))),
    [rows],
  )

  const originalSnapshot = useMemo(
    () => JSON.stringify(originalRows.map((row) => ({
      id: row.id,
      permissions: Object.values(row.permissions || {}).map((cell) => ({
        raceId: cell.raceId,
        explicitAccessLevel: cell.explicitAccessLevel || null,
      })),
    }))),
    [originalRows],
  )

  const hasChanges = snapshot !== originalSnapshot

  useEffect(() => {
    onDirtyChange(hasChanges)
  }, [hasChanges, onDirtyChange])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const handleSearch = (event) => {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  const updateChoice = (userId, race, choice) => {
    setRows((current) => current.map((row) => {
      if (row.id !== userId) return row
      const previousCell = row.permissions[race.id]
      return {
        ...row,
        permissions: {
          ...row.permissions,
          [race.id]: buildUserRaceCell(row.role, race, previousCell, choice),
        },
      }
    }))
  }

  const handleReset = () => {
    setRows(cloneData(originalRows))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = rows.map((row) => ({
        userId: row.id,
        explicitPermissions: Object.values(row.permissions || {})
          .filter((cell) => cell.explicitAccessLevel)
          .map((cell) => ({ raceId: Number(cell.raceId), accessLevel: cell.explicitAccessLevel })),
      }))
      await identityCenterApi.saveUserRaceMatrix({ orgId }, updates)
      setOriginalRows(cloneData(rows))
      onMessage('success', '用户赛事显式授权已保存。')
    } catch (error) {
      onMessage('danger', error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminSurface
      title="用户赛事授权矩阵"
      subtitle="这里展示的是继承态、显式态和最终生效态。保存只会写回显式授权层，不会修改机构赛事范围。"
      actions={hasChanges ? (
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleReset}>重置变更</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存授权'}
          </button>
        </>
      ) : null}
    >
      <AdminToolbar>
        <form className="identity-access-center-page__toolbar" onSubmit={handleSearch}>
          <input
            className="input identity-access-center-page__search"
            placeholder="搜索矩阵内账号"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
          />
          <button type="submit" className="btn btn--secondary">搜索</button>
        </form>
      </AdminToolbar>

      {loading ? (
        <AdminEmptyState title="用户赛事矩阵载入中" description="正在读取当前机构的可见赛事池和用户显式授权。" />
      ) : rows.length === 0 ? (
        <AdminEmptyState title="暂无可治理账号" description="当前机构下没有需要进入用户赛事矩阵的账号。" />
      ) : (
        <>
          <div className="identity-access-center-page__table-wrapper">
            <table className="identity-access-center-page__matrix-table">
              <thead>
                <tr>
                  <th className="identity-access-center-page__sticky-cell">账号</th>
                  <th className="identity-access-center-page__sticky-cell identity-access-center-page__sticky-cell--second">角色</th>
                  {races.map((race) => (
                    <th key={race.id} className="identity-access-center-page__matrix-header-cell">
                      <div>{race.name}</div>
                      <div className="identity-access-center-page__matrix-submeta">{race.orgAccessLevel}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="identity-access-center-page__sticky-cell">
                      <div className="identity-access-center-page__primary-cell">{row.username}</div>
                      <div className="identity-access-center-page__secondary-cell">{row.team_member_name || row.email || '-'}</div>
                    </td>
                    <td className="identity-access-center-page__sticky-cell identity-access-center-page__sticky-cell--second">
                      <AdminStatusPill tone={row.role === 'race_admin' ? 'warning' : 'neutral'}>
                        {ROLE_LABELS[row.role] || row.role}
                      </AdminStatusPill>
                    </td>
                    {races.map((race) => {
                      const cell = row.permissions[race.id]
                      const options = getUserRaceOptions(row.role, cell)
                      return (
                        <td key={race.id} className="identity-access-center-page__matrix-cell identity-access-center-page__matrix-cell--select">
                          <select
                            className="input identity-access-center-page__mini-select"
                            value={getUserRaceChoice(cell)}
                            onChange={(event) => updateChoice(row.id, race, event.target.value)}
                          >
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <div className="identity-access-center-page__matrix-state">{cell.state.replaceAll('_', ' / ')}</div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AdminPagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((current) => current - 1)}
            onNext={() => setPage((current) => current + 1)}
          />
        </>
      )}
    </AdminSurface>
  )
}
