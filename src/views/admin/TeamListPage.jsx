import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

const MEMBER_TYPE_LABELS = {
  employee: '正式成员',
  external_support: '外援',
}

const EXTERNAL_TYPE_LABELS = {
  temporary: '临时外援',
  long_term: '长期外援',
}

const emptyForm = {
  employeeCode: '',
  employeeName: '',
  position: '',
  department: '',
  memberType: 'employee',
  externalEngagementType: '',
  idNumber: '',
  contact: '',
}

function TeamListPage() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const isSuperAdmin = user?.role === 'super_admin'
  const orgId = searchParams.get('orgId') || ''

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [message, setMessage] = useState('')
  const [keyword, setKeyword] = useState('')
  const [memberType, setMemberType] = useState('')
  const [externalType, setExternalType] = useState('')
  const [status, setStatus] = useState('')
  const [hasAccount, setHasAccount] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState(undefined)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const limit = 20
  const effectiveOrgId = isSuperAdmin ? orgId : undefined
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const canUsePage = !isSuperAdmin || Boolean(effectiveOrgId)

  const query = useMemo(() => ({
    page,
    limit,
    keyword,
    memberType,
    externalEngagementType: externalType,
    status,
    hasAccount,
    ...(effectiveOrgId ? { orgId: effectiveOrgId } : {}),
  }), [page, limit, keyword, memberType, externalType, status, hasAccount, effectiveOrgId])

  const loadItems = async () => {
    if (!canUsePage) {
      setItems([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await adminApi.getTeamMembers(query)
      if (res.success) {
        setItems(res.data.items || [])
        setTotal(Number(res.data.total || 0))
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [canUsePage, query])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
  }

  const openEdit = async (item) => {
    try {
      const res = await adminApi.getTeamMember(item.id, effectiveOrgId ? { orgId: effectiveOrgId } : undefined)
      if (res.success) {
        setEditing(item)
        setForm({
          employeeCode: res.data.employeeCode || '',
          employeeName: res.data.employeeName || '',
          position: res.data.position || '',
          department: res.data.department || '',
          memberType: res.data.memberType || 'employee',
          externalEngagementType: res.data.externalEngagementType || '',
          idNumber: res.data.idNumber || '',
          contact: res.data.contact || '',
        })
      }
    } catch (error) {
      setMessage(error.message)
    }
  }

  const closeDialog = () => {
    setEditing(undefined)
    setForm(emptyForm)
  }

  const saveMember = async () => {
    setSaving(true)
    setMessage('')
    try {
      const payload = {
        ...form,
        externalEngagementType: form.memberType === 'external_support' ? form.externalEngagementType : undefined,
      }
      const res = editing
        ? await adminApi.updateTeamMember(editing.id, payload, effectiveOrgId)
        : await adminApi.createTeamMember(payload, effectiveOrgId)
      if (res.success) {
        if (res.data?.initialPassword) {
          setMessage(`账号已创建：${res.data.account?.username || ''}，初始密码：${res.data.initialPassword}`)
        } else {
          setMessage(editing ? '成员已更新。' : '成员已创建。')
        }
        closeDialog()
        await loadItems()
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const runMemberAction = async (action) => {
    try {
      const res = await action()
      if (res.success && res.data?.initialPassword) {
        setMessage(`账号操作完成，初始密码：${res.data.initialPassword}`)
      } else {
        setMessage('操作已完成。')
      }
      await loadItems()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const downloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx')
      const res = await adminApi.getTeamImportTemplate(effectiveOrgId)
      const template = res.data
      const columns = template.columns || []
      const sheetRows = (template.sampleRows || []).map((row) => {
        const next = {}
        columns.forEach((column) => {
          next[column.title] = row[column.key]
        })
        return next
      })
      const worksheet = XLSX.utils.json_to_sheet(sheetRows, {
        header: columns.map((item) => item.title),
      })
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'team_members')
      XLSX.writeFile(workbook, template.fileName || 'team_members_template.xlsx', { bookType: 'xlsx' })
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((row) => ({
        employeeCode: row.工号,
        employeeName: row.姓名,
        position: row.岗位,
        department: row.部门,
        idNumber: row.身份证号,
        contact: row.联系方式,
        memberType: row.成员类型,
        externalEngagementType: row.外援类型,
      }))
      const preview = await adminApi.previewTeamImport(rows, effectiveOrgId)
      if (!preview.success) return
      const duplicates = preview.data.duplicateEmployeeCodes || []
      if (duplicates.length > 0) {
        setMessage(`导入失败，工号重复：${duplicates.join('、')}`)
        return
      }
      const commit = await adminApi.commitTeamImport(preview.data.rows, effectiveOrgId)
      if (commit.success) {
        setMessage(`导入完成，新增 ${commit.data.importedCount} 人。`)
        await loadItems()
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>团队管理</h1>
          <div style={{ color: '#6b7280', marginTop: 6 }}>统一维护正式成员、临时外援和长期外援。</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn--secondary" onClick={downloadTemplate} disabled={!canUsePage}>下载导入模板</button>
          <label className="btn btn--secondary" style={{ cursor: 'pointer' }}>
            导入 xlsx
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
          </label>
          <button className="btn btn--primary" onClick={openCreate} disabled={!canUsePage}>新增成员</button>
        </div>
      </div>

      {isSuperAdmin && !effectiveOrgId && (
        <div style={noticeStyle}>请先在左侧选择一个机构，再进入团队管理。</div>
      )}

      {message && <div style={noticeStyle}>{message}</div>}

      <div style={panelStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(4, minmax(0, 1fr))', gap: 10 }}>
          <input className="input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索工号、姓名、岗位、部门" />
          <select className="input" value={memberType} onChange={(event) => setMemberType(event.target.value)}>
            <option value="">全部类型</option>
            <option value="employee">正式成员</option>
            <option value="external_support">外援</option>
          </select>
          <select className="input" value={externalType} onChange={(event) => setExternalType(event.target.value)}>
            <option value="">全部外援类型</option>
            <option value="temporary">临时外援</option>
            <option value="long_term">长期外援</option>
          </select>
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="inactive">停用</option>
            <option value="archived">归档</option>
          </select>
          <select className="input" value={hasAccount} onChange={(event) => setHasAccount(event.target.value)}>
            <option value="">全部账号状态</option>
            <option value="true">已开通账号</option>
            <option value="false">未开通账号</option>
          </select>
        </div>
      </div>

      <div style={panelStyle}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>工号</th>
                  <th style={thStyle}>姓名</th>
                  <th style={thStyle}>岗位 / 部门</th>
                  <th style={thStyle}>成员类型</th>
                  <th style={thStyle}>联系方式</th>
                  <th style={thStyle}>账号</th>
                  <th style={thStyle}>状态</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={tdStyle}>{item.employeeCode}</td>
                    <td style={tdStyle}>{item.employeeName}</td>
                    <td style={tdStyle}>
                      <div>{item.position || '-'}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>{item.department || '-'}</div>
                    </td>
                    <td style={tdStyle}>
                      <div>{MEMBER_TYPE_LABELS[item.memberType] || item.memberType}</div>
                      {item.externalEngagementType && (
                        <div style={{ color: '#6b7280', fontSize: 12 }}>{EXTERNAL_TYPE_LABELS[item.externalEngagementType] || item.externalEngagementType}</div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div>{item.contactMasked}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>{item.idNumberMasked}</div>
                    </td>
                    <td style={tdStyle}>
                      {item.accountUsername ? (
                        <>
                          <div>{item.accountUsername}</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>{item.accountRole || '-'} / {item.accountStatus || '-'}</div>
                        </>
                      ) : '未开通'}
                    </td>
                    <td style={tdStyle}>{item.status}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => openEdit(item)}>编辑</button>
                        {!item.accountUsername && item.memberType === 'external_support' && (
                          <button className="btn btn--ghost btn--sm" onClick={() => runMemberAction(() => adminApi.enableTeamMemberAccount(item.id, effectiveOrgId))}>
                            启用账号
                          </button>
                        )}
                        {item.accountUsername && (
                          <button className="btn btn--ghost btn--sm" onClick={() => runMemberAction(() => adminApi.resetTeamMemberPassword(item.id, effectiveOrgId))}>
                            重置密码
                          </button>
                        )}
                        {item.status === 'archived' ? (
                          <button className="btn btn--ghost btn--sm" onClick={() => runMemberAction(() => adminApi.restoreTeamMember(item.id, effectiveOrgId))}>恢复</button>
                        ) : (
                          <button className="btn btn--ghost btn--sm" onClick={() => runMemberAction(() => adminApi.archiveTeamMember(item.id, effectiveOrgId))}>归档</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>暂无团队成员</td>
                  </tr>
                )}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button className="btn btn--ghost btn--sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>上一页</button>
                <span style={{ padding: '6px 12px' }}>{page} / {totalPages}</span>
                <button className="btn btn--ghost btn--sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>下一页</button>
              </div>
            )}
          </>
        )}
      </div>

      {editing !== undefined && (
        <div style={modalBackdropStyle}>
          <div style={modalCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{editing ? '编辑团队成员' : '新增团队成员'}</h2>
              <button className="btn btn--ghost btn--sm" onClick={closeDialog}>关闭</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input className="input" value={form.employeeCode} onChange={(event) => setForm((prev) => ({ ...prev, employeeCode: event.target.value }))} placeholder="工号" />
              <input className="input" value={form.employeeName} onChange={(event) => setForm((prev) => ({ ...prev, employeeName: event.target.value }))} placeholder="姓名" />
              <input className="input" value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} placeholder="岗位（非必填）" />
              <input className="input" value={form.department} onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))} placeholder="部门" />
              <select className="input" value={form.memberType} onChange={(event) => setForm((prev) => ({ ...prev, memberType: event.target.value, externalEngagementType: event.target.value === 'employee' ? '' : prev.externalEngagementType }))}>
                <option value="employee">正式成员</option>
                <option value="external_support">外援</option>
              </select>
              <select className="input" value={form.externalEngagementType} onChange={(event) => setForm((prev) => ({ ...prev, externalEngagementType: event.target.value }))} disabled={form.memberType !== 'external_support'}>
                <option value="">选择外援类型</option>
                <option value="temporary">临时外援</option>
                <option value="long_term">长期外援</option>
              </select>
              <input className="input" value={form.idNumber} onChange={(event) => setForm((prev) => ({ ...prev, idNumber: event.target.value }))} placeholder="身份证号" />
              <input className="input" value={form.contact} onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))} placeholder="联系方式" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn--ghost" onClick={closeDialog}>取消</button>
              <button className="btn btn--primary" onClick={saveMember} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const panelStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
}

const noticeStyle = {
  ...panelStyle,
  background: 'rgba(59,130,246,0.08)',
  color: '#1e3a8a',
}

const thStyle = {
  textAlign: 'left',
  fontSize: 13,
  color: '#6b7280',
  padding: '10px 8px',
}

const tdStyle = {
  padding: '12px 8px',
  fontSize: 14,
  verticalAlign: 'top',
}

const modalBackdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.35)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 1000,
}

const modalCardStyle = {
  width: 'min(760px, calc(100vw - 32px))',
  background: '#fff',
  borderRadius: 20,
  padding: 20,
  boxShadow: '0 20px 60px rgba(15,23,42,0.22)',
}

export default TeamListPage
