import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandShell,
  CommandStatusTag,
  ContextRequirementState,
} from '../../components/command/CommandPrimitives'
import TeamMemberPhoto, {
  revokePreviewUrl,
  validatePortraitPhotoFile,
} from './TeamMemberPhoto'
import {
  buildEmployeeCodeOptions,
  buildTeamMemberMetrics,
  EMPLOYEE_CODE_PAGE_SIZE,
  EMPLOYEE_CODE_SUGGESTION_LIMIT,
  EMPTY_TEAM_MEMBER_FORM,
  EXTERNAL_TYPE_LABELS,
  MEMBER_TYPE_LABELS,
  PAGE_LIMIT,
} from './teamListPageData.js'
import {
  parseTeamImportWorkbook,
  writeTeamImportTemplate,
} from './teamMemberWorkbook.js'
import './team-list-page.css'

export default function TeamListPage() {
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
  const [form, setForm] = useState(EMPTY_TEAM_MEMBER_FORM)
  const [saving, setSaving] = useState(false)
  const [employeeCodeCatalog, setEmployeeCodeCatalog] = useState([])
  const [loadingEmployeeCodes, setLoadingEmployeeCodes] = useState(false)
  const [employeeCodeMenuOpen, setEmployeeCodeMenuOpen] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [photoMarkedForDeletion, setPhotoMarkedForDeletion] = useState(false)
  const [importing, setImporting] = useState(false)
  const employeeCodeCloseTimerRef = useRef(null)
  const photoInputRef = useRef(null)
  const importInputRef = useRef(null)

  const effectiveOrgId = isSuperAdmin ? orgId : undefined
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT))
  const canUsePage = !isSuperAdmin || Boolean(effectiveOrgId)

  const query = useMemo(() => ({
    page,
    limit: PAGE_LIMIT,
    keyword,
    memberType,
    externalEngagementType: externalType,
    status,
    hasAccount,
    ...(effectiveOrgId ? { orgId: effectiveOrgId } : {}),
  }), [page, keyword, memberType, externalType, status, hasAccount, effectiveOrgId])

  const employeeCodeOptions = useMemo(
    () => buildEmployeeCodeOptions(employeeCodeCatalog, form.employeeCode),
    [employeeCodeCatalog, form.employeeCode],
  )

  const metrics = useMemo(() => buildTeamMemberMetrics(items, total), [items, total])

  const filteredEmployeeCodeOptions = useMemo(() => {
    const input = String(form.employeeCode || '').trim().toLowerCase()
    const normalizedEditingCode = String(editing?.employeeCode || '').trim()

    return employeeCodeOptions
      .filter((item) => !input || item.code.toLowerCase().includes(input))
      .map((item) => ({
        ...item,
        disabled: item.occupied && item.code !== normalizedEditingCode,
      }))
      .slice(0, EMPLOYEE_CODE_SUGGESTION_LIMIT)
  }, [employeeCodeOptions, form.employeeCode, editing])

  useEffect(() => {
    return () => {
      if (employeeCodeCloseTimerRef.current) clearTimeout(employeeCodeCloseTimerRef.current)
      revokePreviewUrl(photoPreviewUrl)
    }
  }, [photoPreviewUrl])

  const loadItems = useCallback(async () => {
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
  }, [canUsePage, query])

  const loadEmployeeCodeCatalog = async () => {
    if (!canUsePage) {
      setEmployeeCodeCatalog([])
      return
    }

    setLoadingEmployeeCodes(true)
    try {
      const firstPage = await adminApi.getTeamMembers({
        page: 1,
        limit: EMPLOYEE_CODE_PAGE_SIZE,
        ...(effectiveOrgId ? { orgId: effectiveOrgId } : {}),
      })
      if (!firstPage.success) return

      const codeSet = new Set(
        (firstPage.data?.items || [])
          .map((item) => String(item.employeeCode || '').trim())
          .filter(Boolean),
      )
      const totalCount = Number(firstPage.data?.total || 0)
      const totalCodePages = Math.max(1, Math.ceil(totalCount / EMPLOYEE_CODE_PAGE_SIZE))

      for (let nextPage = 2; nextPage <= totalCodePages; nextPage += 1) {
        const response = await adminApi.getTeamMembers({
          page: nextPage,
          limit: EMPLOYEE_CODE_PAGE_SIZE,
          ...(effectiveOrgId ? { orgId: effectiveOrgId } : {}),
        })
        if (!response.success) continue
        ;(response.data?.items || []).forEach((item) => {
          const code = String(item.employeeCode || '').trim()
          if (code) codeSet.add(code)
        })
      }

      setEmployeeCodeCatalog([...codeSet])
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoadingEmployeeCodes(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const resetPhotoState = (hasPhoto = false) => {
    setPhotoFile(null)
    setPhotoMarkedForDeletion(false)
    setForm((prev) => ({ ...prev, hasPhoto }))
    setPhotoPreviewUrl((current) => {
      revokePreviewUrl(current)
      return ''
    })
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_TEAM_MEMBER_FORM)
    setEmployeeCodeMenuOpen(false)
    resetPhotoState(false)
    void loadEmployeeCodeCatalog()
  }

  const openEdit = async (item) => {
    try {
      const res = await adminApi.getTeamMember(item.id, effectiveOrgId ? { orgId: effectiveOrgId } : undefined)
      if (!res.success) return

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
        hasPhoto: Boolean(res.data.hasPhoto),
      })
      setEmployeeCodeMenuOpen(false)
      resetPhotoState(Boolean(res.data.hasPhoto))
      void loadEmployeeCodeCatalog()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const closeDialog = () => {
    setEditing(undefined)
    setForm(EMPTY_TEAM_MEMBER_FORM)
    setEmployeeCodeMenuOpen(false)
    resetPhotoState(false)
  }

  const handlePhotoSelected = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      await validatePortraitPhotoFile(file)
      setPhotoMarkedForDeletion(false)
      setPhotoFile(file)
      setPhotoPreviewUrl((current) => {
        revokePreviewUrl(current)
        return URL.createObjectURL(file)
      })
    } catch (error) {
      setMessage(error.message)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null)
    setPhotoMarkedForDeletion(Boolean(form.hasPhoto))
    setPhotoPreviewUrl((current) => {
      revokePreviewUrl(current)
      return ''
    })
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const saveMember = async () => {
    setSaving(true)
    setMessage('')
    try {
      const payload = {
        employeeCode: form.employeeCode,
        employeeName: form.employeeName,
        position: form.position,
        department: form.department,
        memberType: form.memberType,
        externalEngagementType: form.memberType === 'external_support' ? form.externalEngagementType : undefined,
        idNumber: form.idNumber,
        contact: form.contact,
      }

      const res = editing
        ? await adminApi.updateTeamMember(editing.id, payload, effectiveOrgId)
        : await adminApi.createTeamMember(payload, effectiveOrgId)

      if (!res.success) return

      const teamMemberId = editing ? editing.id : res.data?.teamMember?.id
      let partialMessage = ''

      try {
        if (teamMemberId && photoFile) {
          await adminApi.uploadTeamMemberPhoto(teamMemberId, photoFile, effectiveOrgId)
        } else if (teamMemberId && photoMarkedForDeletion && form.hasPhoto) {
          await adminApi.deleteTeamMemberPhoto(teamMemberId, effectiveOrgId)
        }
      } catch (photoError) {
        partialMessage = `，但照片处理失败：${photoError.message}`
      }

      if (res.data?.initialPassword) {
        setMessage(`账号已创建：${res.data.account?.username || ''}，初始密码：${res.data.initialPassword}${partialMessage}`)
      } else {
        setMessage(`${editing ? '成员已更新' : '成员已创建'}${partialMessage}`)
      }

      closeDialog()
      await Promise.all([loadItems(), loadEmployeeCodeCatalog()])
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const runMemberAction = async (action, successMessage = '操作已完成') => {
    try {
      const res = await action()
      if (res.success && res.data?.initialPassword) {
        setMessage(`账号操作完成，初始密码：${res.data.initialPassword}`)
      } else {
        setMessage(successMessage)
      }
      await loadItems()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const downloadTemplate = async () => {
    try {
      const res = await adminApi.getTeamImportTemplate(effectiveOrgId)
      if (!res.success) return

      const { fileName = 'team_members_template.xlsx', columns = [], sampleRows = [] } = res.data || {}
      writeTeamImportTemplate({ columns, sampleRows, fileName })
      setMessage('模板已下载')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    setMessage('')
    try {
      const templateRes = await adminApi.getTeamImportTemplate(effectiveOrgId)
      const columns = templateRes.data?.columns || []

      const buffer = await file.arrayBuffer()
      const normalizedRows = parseTeamImportWorkbook(buffer, columns)

      if (normalizedRows.length === 0) throw new Error('导入文件没有有效数据')

      const previewRes = await adminApi.previewTeamImport(normalizedRows, effectiveOrgId)
      if (!previewRes.success) return

      const duplicateCodes = previewRes.data?.duplicateEmployeeCodes || []
      if (duplicateCodes.length > 0) {
        throw new Error(`导入文件中存在重复工号：${duplicateCodes.join('、')}`)
      }

      const commitRes = await adminApi.commitTeamImport(normalizedRows, effectiveOrgId)
      if (!commitRes.success) return

      const accountsCreated = commitRes.data?.accountsCreated || []
      if (accountsCreated.length > 0) {
        setMessage(`已导入 ${commitRes.data.importedCount || normalizedRows.length} 条成员，自动创建账号 ${accountsCreated.length} 个`)
      } else {
        setMessage(`已导入 ${commitRes.data.importedCount || normalizedRows.length} 条成员`)
      }

      await Promise.all([loadItems(), loadEmployeeCodeCatalog()])
    } catch (error) {
      setMessage(error.message)
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const renderPhotoPreview = () => {
    const placeholder = <div style={photoPlaceholderStyle}>2:3 竖幅照片</div>
    if (photoPreviewUrl) return <img src={photoPreviewUrl} alt="成员照片预览" style={dialogPhotoStyle} />
    if (editing && form.hasPhoto && !photoMarkedForDeletion) {
      return (
        <TeamMemberPhoto
          teamMemberId={editing.id}
          hasPhoto={form.hasPhoto}
          orgId={effectiveOrgId}
          alt={form.employeeName || '成员照片'}
          style={dialogPhotoStyle}
          placeholder={placeholder}
        />
      )
    }
    return placeholder
  }

  if (!canUsePage) {
    return (
      <ContextRequirementState
        title="先锁定机构，再进入团队管理"
        description="超级管理员需要先在顶部上下文条中选择机构，才能导入、编辑和开通团队成员。"
      />
    )
  }

  return (
    <div className="command-page surface-admin">
      <CommandShell
        eyebrow="团队管理"
        title="团队成员"
        summary="统一维护正式成员、临时外援和长期外援，支持导入、账号开通、照片补齐和状态治理。"
        actions={(
          <div className="command-actions-row">
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
            <button className="btn btn--ghost" onClick={downloadTemplate}>下载导入模板</button>
            <button className="btn btn--secondary" onClick={() => importInputRef.current?.click()} disabled={importing}>
              {importing ? '导入中...' : '导入成员'}
            </button>
            <button className="btn btn--primary" onClick={openCreate}>新增成员</button>
          </div>
        )}
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      {message ? <CommandNotice tone={message.includes('失败') ? 'danger' : 'info'}>{message}</CommandNotice> : null}

      <CommandPanel title="筛选条件" subtitle="可以按成员类型、状态、账号与关键词快速定位目标成员。" className="team-list-page__filter-panel">
        <div className="team-list-page__filter-grid" style={filterGridStyle}>
          <input
            className="input"
            placeholder="搜索工号、姓名、岗位、部门"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <select className="input" value={memberType} onChange={(event) => { setMemberType(event.target.value); setPage(1) }}>
            <option value="">全部成员类型</option>
            <option value="employee">正式成员</option>
            <option value="external_support">外援</option>
          </select>
          <select className="input" value={externalType} onChange={(event) => { setExternalType(event.target.value); setPage(1) }}>
            <option value="">全部外援类型</option>
            <option value="temporary">临时外援</option>
            <option value="long_term">长期外援</option>
          </select>
          <select className="input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="archived">已归档</option>
          </select>
          <select className="input" value={hasAccount} onChange={(event) => { setHasAccount(event.target.value); setPage(1) }}>
            <option value="">全部账号状态</option>
            <option value="true">已有账号</option>
            <option value="false">未开通账号</option>
          </select>
          <button className="btn btn--secondary" onClick={() => { setPage(1); void loadItems() }}>搜索</button>
        </div>
      </CommandPanel>

      <CommandPanel title="成员列表" subtitle="编辑、归档、开通账号和密码重置都统一在当前列表完成。" className="team-list-page__list-panel">
        {loading ? (
          <CommandNotice tone="info">正在加载团队成员...</CommandNotice>
        ) : (
          <>
            {items.length === 0 ? (
              <CommandEmptyState title="暂无成员数据" description="可以先新增成员或通过模板批量导入。" icon="TM" />
            ) : (
              <CommandDataTable className="team-list-page__table-wrap">
                <thead>
                  <tr style={tableHeadRowStyle}>
                    <th style={thStyle} className="team-list-page__photo-col">照片</th>
                    <th style={thStyle} className="team-list-page__code-col">工号</th>
                    <th style={thStyle} className="team-list-page__name-col">姓名</th>
                    <th style={thStyle} className="team-list-page__position-col">岗位</th>
                    <th style={thStyle} className="team-list-page__department-col">部门</th>
                    <th style={thStyle} className="team-list-page__type-col">成员类型</th>
                    <th style={thStyle} className="team-list-page__private-col">身份证号</th>
                    <th style={thStyle} className="team-list-page__private-col">联系方式</th>
                    <th style={thStyle} className="team-list-page__account-col">账号</th>
                    <th style={thStyle} className="team-list-page__status-col">状态</th>
                    <th style={thStyle} className="team-list-page__actions-col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} style={tableRowStyle}>
                      <td style={tdStyle} className="team-list-page__photo-col">
                        <TeamMemberPhoto
                          teamMemberId={item.id}
                          hasPhoto={item.hasPhoto}
                          orgId={effectiveOrgId}
                          alt={item.employeeName}
                          style={listPhotoStyle}
                          placeholder={<div style={listPhotoPlaceholderStyle}>无照片</div>}
                        />
                      </td>
                      <td style={tdStyle} className="team-list-page__code-col">{item.employeeCode}</td>
                      <td style={tdStyle} className="team-list-page__name-col">
                        <div className="team-list-page__member-identity">
                          <span className="team-list-page__member-name">{item.employeeName}</span>
                          <span className="team-list-page__member-subline">
                            {item.employeeCode} · {item.position || '未填写岗位'} · {item.department || '未填写部门'}
                          </span>
                        </div>
                      </td>
                      <td style={tdStyle} className="team-list-page__position-col">{item.position || '-'}</td>
                      <td style={tdStyle} className="team-list-page__department-col">{item.department || '-'}</td>
                      <td style={tdStyle} className="team-list-page__type-col">
                        {MEMBER_TYPE_LABELS[item.memberType] || item.memberType}
                        {item.externalEngagementType ? ` / ${EXTERNAL_TYPE_LABELS[item.externalEngagementType] || item.externalEngagementType}` : ''}
                      </td>
                      <td style={tdStyle} className="team-list-page__private-col">{item.idNumberMasked || '-'}</td>
                      <td style={tdStyle} className="team-list-page__private-col">{item.contactMasked || '-'}</td>
                      <td style={tdStyle} className="team-list-page__account-col">
                        {item.accountUsername ? (
                          <div className="team-list-page__account-stack">
                            <span>{item.accountUsername}</span>
                            <span>{item.accountStatus || 'active'}</span>
                          </div>
                        ) : '未开通'}
                      </td>
                      <td style={tdStyle} className="team-list-page__status-col">
                        <CommandStatusTag tone={item.status === 'active' ? 'success' : 'warning'}>
                          {item.status === 'active' ? '启用' : '已归档'}
                        </CommandStatusTag>
                      </td>
                      <td style={tdStyle} className="team-list-page__actions-col">
                        <div className="team-list-page__row-actions">
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => void openEdit(item)}
                          >
                            编辑
                          </button>
                          {item.status === 'active' ? (
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => void runMemberAction(() => adminApi.archiveTeamMember(item.id, effectiveOrgId), '成员已归档')}
                              title="归档成员"
                              aria-label={`归档 ${item.employeeName}`}
                            >
                              档
                            </button>
                          ) : (
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => void runMemberAction(() => adminApi.restoreTeamMember(item.id, effectiveOrgId), '成员已恢复')}
                              title="恢复成员"
                              aria-label={`恢复 ${item.employeeName}`}
                            >
                              恢
                            </button>
                          )}
                          {!item.accountUsername && item.memberType === 'external_support' && (
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => void runMemberAction(() => adminApi.enableTeamMemberAccount(item.id, effectiveOrgId))}
                              title="开通账号"
                              aria-label={`为 ${item.employeeName} 开通账号`}
                            >
                              开号
                            </button>
                          )}
                          {item.accountUsername && (
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => void runMemberAction(() => adminApi.resetTeamMemberPassword(item.id, effectiveOrgId))}
                              title="重置密码"
                              aria-label={`重置 ${item.employeeName} 的密码`}
                            >
                              重密
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </CommandDataTable>
            )}

            {totalPages > 1 && (
              <div style={paginationStyle}>
                <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>上一页</button>
                <span style={{ fontSize: 14 }}>{page} / {totalPages}</span>
                <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>下一页</button>
              </div>
            )}
          </>
        )}
      </CommandPanel>

      {editing !== undefined && (
        <div style={backdropStyle} onClick={closeDialog}>
          <div style={dialogStyle} onClick={(event) => event.stopPropagation()}>
            <div style={dialogHeaderStyle}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>{editing ? '编辑团队成员' : '新增团队成员'}</h2>
                <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 14 }}>
                  照片为 2:3 竖幅，用于成员档案和后续项目、活动展示。
                </div>
              </div>
              <button className="btn btn--ghost" onClick={closeDialog}>关闭</button>
            </div>

            <div style={dialogBodyStyle}>
              <div style={photoPanelStyle}>
                {renderPhotoPreview()}
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoSelected} />
                <div style={{ display: 'grid', gap: 8 }}>
                  <button className="btn btn--secondary" onClick={() => photoInputRef.current?.click()}>上传照片</button>
                  <button className="btn btn--ghost" onClick={handleRemovePhoto} disabled={!photoPreviewUrl && !form.hasPhoto}>
                    删除照片
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    支持 JPG、PNG、WEBP，大小不超过 5MB。
                  </div>
                </div>
              </div>

              <div style={dialogFormGridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>工号 *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      value={form.employeeCode}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, employeeCode: event.target.value }))
                        setEmployeeCodeMenuOpen(true)
                      }}
                      onFocus={() => setEmployeeCodeMenuOpen(true)}
                      onBlur={() => {
                        employeeCodeCloseTimerRef.current = window.setTimeout(() => setEmployeeCodeMenuOpen(false), 120)
                      }}
                      placeholder="请输入或选择工号"
                    />
                    {employeeCodeMenuOpen && (
                      <div style={employeeCodeMenuStyle}>
                        {loadingEmployeeCodes ? (
                          <div style={employeeCodeHintStyle}>正在加载工号库...</div>
                        ) : filteredEmployeeCodeOptions.length > 0 ? (
                          filteredEmployeeCodeOptions.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              style={{
                                ...employeeCodeOptionStyle,
                                color: item.disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
                                cursor: item.disabled ? 'not-allowed' : 'pointer',
                                background: item.code === form.employeeCode ? '#eff6ff' : 'transparent',
                              }}
                              disabled={item.disabled}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setForm((prev) => ({ ...prev, employeeCode: item.code }))
                                setEmployeeCodeMenuOpen(false)
                              }}
                            >
                              <span>{item.code}</span>
                              <span style={{ fontSize: 12 }}>{item.disabled ? '已占用' : '可选'}</span>
                            </button>
                          ))
                        ) : (
                          <div style={employeeCodeHintStyle}>没有匹配工号，可直接输入新编号。</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>姓名 *</label>
                  <input className="input" value={form.employeeName} onChange={(event) => setForm((prev) => ({ ...prev, employeeName: event.target.value }))} />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>岗位</label>
                  <input className="input" value={form.position} onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))} />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>部门 *</label>
                  <input className="input" value={form.department} onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))} />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>成员类型 *</label>
                  <select
                    className="input"
                    value={form.memberType}
                    onChange={(event) => {
                      const nextType = event.target.value
                      setForm((prev) => ({
                        ...prev,
                        memberType: nextType,
                        externalEngagementType: nextType === 'external_support' ? prev.externalEngagementType : '',
                      }))
                    }}
                  >
                    <option value="employee">正式成员</option>
                    <option value="external_support">外援</option>
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>外援类型</label>
                  <select
                    className="input"
                    value={form.externalEngagementType}
                    onChange={(event) => setForm((prev) => ({ ...prev, externalEngagementType: event.target.value }))}
                    disabled={form.memberType !== 'external_support'}
                  >
                    <option value="">请选择外援类型</option>
                    <option value="temporary">临时外援</option>
                    <option value="long_term">长期外援</option>
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>身份证号 *</label>
                  <input className="input" value={form.idNumber} onChange={(event) => setForm((prev) => ({ ...prev, idNumber: event.target.value }))} />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>联系方式 *</label>
                  <input className="input" value={form.contact} onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))} />
                </div>
              </div>
            </div>

            <div style={dialogFooterStyle}>
              <button className="btn btn--ghost" onClick={closeDialog}>取消</button>
              <button className="btn btn--primary" onClick={saveMember} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const filterGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
}

const tableHeadRowStyle = {
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
}

const tableRowStyle = {
  borderBottom: '1px solid var(--border)',
}

const thStyle = {
  padding: '12px 10px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '14px 10px',
  fontSize: 14,
  verticalAlign: 'top',
}

const listPhotoStyle = {
  width: 48,
  height: 72,
  objectFit: 'cover',
  borderRadius: 0,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
}

const listPhotoPlaceholderStyle = {
  width: 48,
  height: 72,
  borderRadius: 0,
  border: '1px dashed var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-disabled)',
  fontSize: 11,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
}

const paginationStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 10,
  marginTop: 16,
}

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.22)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 9999,
}

const dialogStyle = {
  width: 'min(1080px, 100%)',
  maxHeight: 'calc(100vh - 48px)',
  overflow: 'auto',
  borderRadius: 24,
  background: '#fff',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
}

const dialogHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  padding: '28px 28px 20px',
  borderBottom: '1px solid #e5e7eb',
}

const dialogBodyStyle = {
  display: 'grid',
  gridTemplateColumns: '240px 1fr',
  gap: 24,
  padding: 28,
}

const photoPanelStyle = {
  display: 'grid',
  gap: 16,
  alignContent: 'start',
}

const dialogPhotoStyle = {
  width: '100%',
  aspectRatio: '2 / 3',
  objectFit: 'cover',
  borderRadius: 18,
  border: '1px solid #e5e7eb',
  background: '#f8fafc',
}

const photoPlaceholderStyle = {
  width: '100%',
  aspectRatio: '2 / 3',
  borderRadius: 18,
  border: '1px dashed #cbd5e1',
  background: '#f8fafc',
  color: '#94a3b8',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 16,
}

const dialogFormGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 16,
}

const fieldStyle = {
  display: 'grid',
  gap: 6,
}

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: '#475569',
}

const employeeCodeMenuStyle = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  zIndex: 10,
  maxHeight: 260,
  overflow: 'auto',
  borderRadius: 12,
  background: '#fff',
  border: '1px solid #e5e7eb',
  boxShadow: '0 16px 32px rgba(15, 23, 42, 0.12)',
}

const employeeCodeOptionStyle = {
  width: '100%',
  padding: '10px 12px',
  border: 'none',
  background: 'transparent',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 14,
}

const employeeCodeHintStyle = {
  padding: '12px 14px',
  color: 'var(--text-secondary)',
  fontSize: 13,
}

const dialogFooterStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  padding: '20px 28px 28px',
  borderTop: '1px solid var(--border)',
}
