import { useEffect, useMemo, useState } from 'react'
import identityCenterApi from '../../../api/identityCenter'
import {
  AdminEmptyState,
  AdminSurface,
  AdminToolbar,
} from '../../../components/admin/AdminWorkbench'
import { ROLE_LABELS } from './shared'

export default function IdentityModuleMatrixPanel({ orgId, refreshToken, onDirtyChange, onMessage }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState([])
  const [modules, setModules] = useState(null)
  const [defaultModules, setDefaultModules] = useState([])
  const [matrix, setMatrix] = useState({})
  const [originalMatrix, setOriginalMatrix] = useState({})
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const flattenedModules = useMemo(() => {
    if (!modules) return []
    const result = []
    for (const [surface, items] of Object.entries(modules)) {
      result.push({ type: 'header', key: surface, label: surface.toUpperCase(), colSpan: items.length })
      for (const item of items) result.push({ type: 'module', ...item, surface })
    }
    return result
  }, [modules])

  const allModuleIds = useMemo(
    () => flattenedModules.filter((item) => item.type === 'module').map((item) => item.id),
    [flattenedModules],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    identityCenterApi.getModuleMatrix({ orgId, keyword })
      .then((res) => {
        if (!active || !res?.success) return
        const nextMatrix = {}
        for (const [userId, moduleList] of Object.entries(res.data.matrix || {})) {
          nextMatrix[userId] = new Set(moduleList)
        }
        setUsers(res.data.users || [])
        setModules(res.data.modules || null)
        setDefaultModules(res.data.defaultModules || [])
        setMatrix(nextMatrix)
        setOriginalMatrix(res.data.matrix || {})
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
  }, [keyword, onMessage, orgId, refreshToken])

  const hasChanges = useMemo(() => {
    for (const user of users) {
      const current = matrix[user.id] || new Set()
      const original = new Set(originalMatrix[user.id] || [])
      if (current.size !== original.size) return true
      for (const moduleId of current) {
        if (!original.has(moduleId)) return true
      }
    }
    return false
  }, [matrix, originalMatrix, users])

  useEffect(() => {
    onDirtyChange(hasChanges)
  }, [hasChanges, onDirtyChange])

  const handleSearch = (event) => {
    event.preventDefault()
    setKeyword(keywordInput.trim())
  }

  const togglePermission = (userId, moduleId) => {
    setMatrix((current) => {
      const next = { ...current }
      const modulesForUser = new Set(next[userId] || [])
      const moduleInfo = flattenedModules.find((item) => item.id === moduleId)
      if (moduleInfo?.isDefault) return current
      if (modulesForUser.has(moduleId)) {
        modulesForUser.delete(moduleId)
      } else {
        modulesForUser.add(moduleId)
      }
      next[userId] = modulesForUser
      return next
    })
  }

  const toggleUserAll = (userId) => {
    setMatrix((current) => {
      const next = { ...current }
      const currentModules = next[userId] || new Set()
      const shouldEnableAll = allModuleIds.some((moduleId) => !currentModules.has(moduleId))
      next[userId] = new Set(shouldEnableAll ? allModuleIds : defaultModules)
      return next
    })
  }

  const toggleModuleAll = (moduleId, checked) => {
    const moduleInfo = flattenedModules.find((item) => item.id === moduleId)
    if (moduleInfo?.isDefault) return

    setMatrix((current) => {
      const next = { ...current }
      for (const user of users) {
        const currentModules = new Set(next[user.id] || [])
        if (checked) {
          currentModules.add(moduleId)
        } else {
          currentModules.delete(moduleId)
        }
        next[user.id] = currentModules
      }
      return next
    })
  }

  const handleReset = () => {
    const resetMatrix = {}
    for (const [userId, moduleList] of Object.entries(originalMatrix)) {
      resetMatrix[userId] = new Set(moduleList)
    }
    setMatrix(resetMatrix)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = users.map((user) => ({
        userId: user.id,
        modules: Array.from(matrix[user.id] || []),
      }))
      const res = await identityCenterApi.saveModuleMatrix({ orgId }, updates)
      const nextMatrix = {}
      for (const [userId, moduleList] of Object.entries(res.data.matrix || {})) {
        nextMatrix[userId] = new Set(moduleList)
      }
      setUsers(res.data.users || [])
      setMatrix(nextMatrix)
      setOriginalMatrix(res.data.matrix || {})
      onMessage('success', '模块权限矩阵已保存。')
    } catch (error) {
      onMessage('danger', error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminSurface
      title="应用授权"
      subtitle="按应用入口分组授权模块，入口能否进入和动作能否执行不再混在同一张表里。"
      footer={(
        <div className="identity-access-center-page__matrix-legend">
          <div className="identity-access-center-page__matrix-legend-item">
            <input type="checkbox" checked disabled />
            <span>默认应用（自动启用，不可取消）</span>
          </div>
          <div className="identity-access-center-page__matrix-legend-item">
            <input type="checkbox" readOnly />
            <span>可选应用（可授权/取消）</span>
          </div>
        </div>
      )}
    >
      <AdminToolbar>
        <form className="identity-access-center-page__toolbar" onSubmit={handleSearch}>
          <input
            className="input identity-access-center-page__search"
            placeholder="搜索账号"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
          />
          <button type="submit" className="btn btn--secondary">搜索</button>
          {hasChanges ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={handleReset}>重置变更</button>
              <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存应用授权'}
              </button>
            </>
          ) : null}
        </form>
      </AdminToolbar>

      {loading ? (
        <AdminEmptyState title="应用授权载入中" description="正在读取应用定义和当前授权关系。" />
      ) : users.length === 0 ? (
        <AdminEmptyState title="暂无可治理账号" description="当前机构下没有需要配置应用授权的账号。" />
      ) : (
        <div className="identity-access-center-page__table-wrapper identity-access-center-page__table-wrapper--module-matrix">
          <table className="identity-access-center-page__matrix-table identity-access-center-page__matrix-table--module">
            <thead>
              <tr>
                <th className="identity-access-center-page__sticky-cell">账号</th>
                {flattenedModules.map((item) => (
                  item.type === 'header' ? (
                    <th key={item.key} colSpan={item.colSpan} className="identity-access-center-page__matrix-group">
                      {item.label}
                    </th>
                  ) : null
                ))}
              </tr>
              <tr>
                <th className="identity-access-center-page__sticky-cell">整行</th>
                {flattenedModules.map((item) => {
                  if (item.type !== 'module') return null
                  const allChecked = users.every((user) => (matrix[user.id] || new Set()).has(item.id))
                  const someChecked = users.some((user) => (matrix[user.id] || new Set()).has(item.id))
                  return (
                    <th key={item.id} className="identity-access-center-page__matrix-header-cell identity-access-center-page__matrix-header-cell--module">
                      <label className="identity-access-center-page__matrix-header-checkbox">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={(element) => {
                            if (element) element.indeterminate = someChecked && !allChecked
                          }}
                          onChange={(event) => toggleModuleAll(item.id, event.target.checked)}
                          disabled={item.isDefault}
                          aria-label={`切换所有用户的${item.name}权限`}
                        />
                        <span title={item.name}>{item.name}</span>
                      </label>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const currentModules = matrix[user.id] || new Set()
                const hasAllModules = allModuleIds.every((moduleId) => currentModules.has(moduleId))
                return (
                  <tr key={user.id}>
                    <td className="identity-access-center-page__sticky-cell">
                      <div className="identity-access-center-page__matrix-user">
                        <div>
                          <div className="identity-access-center-page__primary-cell">{user.username}</div>
                          <div className="identity-access-center-page__secondary-cell">{ROLE_LABELS[user.role] || user.role}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm identity-access-center-page__matrix-row-toggle"
                          onClick={() => toggleUserAll(user.id)}
                          title={hasAllModules ? '还原为默认模块' : '开启该用户所有模块'}
                        >
                          {hasAllModules ? '默认' : '全开'}
                        </button>
                      </div>
                    </td>
                    {flattenedModules.map((item) => {
                      if (item.type !== 'module') return null
                      const checked = currentModules.has(item.id)
                      return (
                        <td key={item.id} className="identity-access-center-page__matrix-cell">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={item.isDefault}
                            onChange={() => togglePermission(user.id, item.id)}
                            aria-label={`${user.username} ${item.name}`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminSurface>
  )
}
