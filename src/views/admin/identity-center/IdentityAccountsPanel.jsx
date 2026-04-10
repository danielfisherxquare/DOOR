import { useEffect, useState } from 'react'
import adminApi from '../../../api/adminApi'
import identityCenterApi from '../../../api/identityCenter'
import {
  AdminDataTable,
  AdminEmptyState,
  AdminPagination,
  AdminStatusPill,
  AdminSurface,
  AdminToolbar,
} from '../../../components/admin/AdminWorkbench'
import {
  ACCOUNT_SOURCE_LABELS,
  buildAccountRoleOptions,
  ROLE_LABELS,
} from './shared'

export default function IdentityAccountsPanel({
  orgId,
  isSuperAdmin,
  refreshToken,
  hasPendingMatrixChanges,
  onRefresh,
  onMessage,
}) {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [orgs, setOrgs] = useState([])
  const [editingRoleUser, setEditingRoleUser] = useState(null)
  const [editingOrgUser, setEditingOrgUser] = useState(null)

  useEffect(() => {
    setPage(1)
  }, [orgId])

  useEffect(() => {
    let active = true
    setLoading(true)
    identityCenterApi.getAccounts({ orgId, page, limit: 12, keyword })
      .then((res) => {
        if (!active || !res?.success) return
        setAccounts(res.data.items || [])
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

  useEffect(() => {
    if (!isSuperAdmin) return
    adminApi.getOrgs({ limit: 200 })
      .then((res) => {
        if (res?.success) setOrgs(res.data.items || [])
      })
      .catch(() => {})
  }, [isSuperAdmin])

  const totalPages = Math.max(1, Math.ceil(total / 12))

  const ensureNoMatrixChanges = () => {
    if (!hasPendingMatrixChanges) return true
    onMessage('warning', '请先保存或重置当前矩阵改动，再修改账号角色或机构。')
    return false
  }

  const handleSearch = (event) => {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  const updateAccount = async (user, payload) => {
    if (isSuperAdmin) {
      await adminApi.updateUser(user.id, payload)
      return
    }
    await adminApi.updateOrgUser(user.id, payload, orgId)
  }

  const handleResetPassword = async (user) => {
    if (!window.confirm(`确认重置 ${user.username} 的密码吗？`)) return
    try {
      if (isSuperAdmin) {
        await adminApi.resetUserPassword(user.id)
      } else {
        await adminApi.resetOrgUserPassword(user.id, orgId)
      }
      onMessage('success', `${user.username} 的密码已重置。`)
      onRefresh()
    } catch (error) {
      onMessage('danger', error.message)
    }
  }

  const handleDeleteAccount = async (user) => {
    if (!window.confirm(`确认删除用户 ${user.username} 吗？此操作不可恢复。`)) return
    try {
      if (isSuperAdmin) {
        await adminApi.deleteUser(user.id)
      } else {
        await adminApi.deleteOrgUser(user.id, orgId)
      }
      onMessage('success', `${user.username} 已删除。`)
      onRefresh()
    } catch (error) {
      onMessage('danger', error.message)
    }
  }

  const handleToggleStatus = async (user) => {
    if (!ensureNoMatrixChanges()) return
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    try {
      await updateAccount(user, { status: nextStatus })
      onMessage('success', `${user.username} 已${nextStatus === 'active' ? '启用' : '禁用'}。`)
      onRefresh()
    } catch (error) {
      onMessage('danger', error.message)
    }
  }

  const handleSaveRole = async () => {
    if (!editingRoleUser || !ensureNoMatrixChanges()) return
    try {
      await updateAccount(editingRoleUser, {
        role: editingRoleUser.nextRole,
        ...(isSuperAdmin ? { orgId: editingRoleUser.org_id } : {}),
      })
      setEditingRoleUser(null)
      onMessage('success', '角色已更新，相关矩阵已按新角色重新加载。')
      onRefresh()
    } catch (error) {
      onMessage('danger', error.message)
    }
  }

  const handleSaveOrg = async () => {
    if (!editingOrgUser || !ensureNoMatrixChanges()) return
    try {
      await adminApi.updateUser(editingOrgUser.id, { orgId: editingOrgUser.nextOrgId })
      setEditingOrgUser(null)
      onMessage('success', '所属机构已更新，相关矩阵已重新加载。')
      onRefresh()
    } catch (error) {
      onMessage('danger', error.message)
    }
  }

  const roleOptions = buildAccountRoleOptions(isSuperAdmin)

  return (
    <AdminSurface
      title="账号状态工作台"
      subtitle="账号属性不做矩阵化，保留列表工作台处理启停、改密、成员绑定、机构归属和角色调整。"
      footer={(
        <AdminPagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((current) => current - 1)}
          onNext={() => setPage((current) => current + 1)}
        />
      )}
    >
      <AdminToolbar>
        <form className="identity-access-center-page__toolbar" onSubmit={handleSearch}>
          <input
            className="input identity-access-center-page__search"
            placeholder="搜索账号、邮箱、成员姓名"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
          />
          <button type="submit" className="btn btn--secondary">搜索</button>
        </form>
      </AdminToolbar>

      {loading ? (
        <AdminEmptyState title="账号数据加载中" description="正在读取当前机构下的账号状态工作台。" />
      ) : accounts.length === 0 ? (
        <AdminEmptyState title="没有匹配账号" description="换一个关键词，或者先创建成员与账号后再回来治理。" />
      ) : (
        <AdminDataTable>
          <thead>
            <tr>
              <th>账号</th>
              <th>绑定成员</th>
              <th>机构</th>
              <th>角色</th>
              <th>来源</th>
              <th>状态</th>
              <th>改密</th>
              <th>动作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const canEditRole = isSuperAdmin || ['race_admin', 'user'].includes(account.role)
              const canDelete = isSuperAdmin || account.role !== 'org_admin'

              return (
                <tr key={account.id}>
                  <td>
                    <div className="identity-access-center-page__primary-cell">{account.username}</div>
                    <div className="identity-access-center-page__secondary-cell">{account.email || '未填写邮箱'}</div>
                  </td>
                  <td>
                    {account.team_member_name ? (
                      <>
                        <div className="identity-access-center-page__primary-cell">{account.team_member_name}</div>
                        <div className="identity-access-center-page__secondary-cell">{account.member_type || '-'}</div>
                      </>
                    ) : (
                      <AdminStatusPill tone="warning">未绑定成员</AdminStatusPill>
                    )}
                  </td>
                  <td>
                    {isSuperAdmin ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setEditingOrgUser({ ...account, nextOrgId: account.org_id })}
                      >
                        {account.org_name || '点击选择机构'}
                      </button>
                    ) : (
                      <span>{account.org_name || '-'}</span>
                    )}
                  </td>
                  <td>
                    {canEditRole ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setEditingRoleUser({ ...account, nextRole: account.role })}
                      >
                        {ROLE_LABELS[account.role] || account.role}
                      </button>
                    ) : (
                      <span>{ROLE_LABELS[account.role] || account.role}</span>
                    )}
                  </td>
                  <td>{ACCOUNT_SOURCE_LABELS[account.account_source] || account.account_source || '-'}</td>
                  <td>
                    <AdminStatusPill tone={account.status === 'active' ? 'success' : 'warning'}>
                      {account.status === 'active' ? '启用' : '禁用'}
                    </AdminStatusPill>
                  </td>
                  <td>
                    <AdminStatusPill tone={account.must_change_password ? 'warning' : 'neutral'}>
                      {account.must_change_password ? '待改密' : '正常'}
                    </AdminStatusPill>
                  </td>
                  <td>
                    <div className="identity-access-center-page__action-row">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleToggleStatus(account)}>
                        {account.status === 'active' ? '禁用' : '启用'}
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleResetPassword(account)}>
                        重置密码
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm identity-access-center-page__danger-action"
                          onClick={() => handleDeleteAccount(account)}
                        >
                          删除
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </AdminDataTable>
      )}

      {editingRoleUser ? (
        <div className="identity-access-center-page__modal-backdrop" onClick={() => setEditingRoleUser(null)}>
          <div className="identity-access-center-page__modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>调整账号角色</h3>
            <p>为 <strong>{editingRoleUser.username}</strong> 选择新的角色。</p>
            <select
              className="input"
              value={editingRoleUser.nextRole}
              onChange={(event) => setEditingRoleUser((current) => ({ ...current, nextRole: event.target.value }))}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="identity-access-center-page__modal-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setEditingRoleUser(null)}>取消</button>
              <button type="button" className="btn btn--primary" onClick={handleSaveRole}>保存角色</button>
            </div>
          </div>
        </div>
      ) : null}

      {editingOrgUser ? (
        <div className="identity-access-center-page__modal-backdrop" onClick={() => setEditingOrgUser(null)}>
          <div className="identity-access-center-page__modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>调整所属机构</h3>
            <p>调整 <strong>{editingOrgUser.username}</strong> 的机构归属会触发授权矩阵重新加载。</p>
            <select
              className="input"
              value={editingOrgUser.nextOrgId || ''}
              onChange={(event) => setEditingOrgUser((current) => ({ ...current, nextOrgId: event.target.value }))}
            >
              <option value="" disabled>请选择机构</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
            <div className="identity-access-center-page__modal-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setEditingOrgUser(null)}>取消</button>
              <button type="button" className="btn btn--primary" onClick={handleSaveOrg}>保存机构</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminSurface>
  )
}
