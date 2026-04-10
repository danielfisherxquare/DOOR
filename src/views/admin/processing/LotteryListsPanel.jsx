import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import lotteryApi from '../../../api/lottery'
import racesApi from '../../../api/races'
import recordsApi, { fetchAllRecords } from '../../../api/records'
import { unwrapData } from '../../../utils/apiResponse'
import { isWildcard, buildResolvedEntries, applyStatusesForEntries } from '../../../utils/listMatching'
import { parseListExcel } from '../../../utils/excelProcessor'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandNotice,
  CommandPanel,
  CommandStatusTag,
} from '../../../components/command/CommandPrimitives'
import ListEntryEditModal from './ListEntryEditModal'

const LIST_TABS = [
  { key: 'whitelist', label: '白名单', empty: '当前还没有白名单条目。' },
  { key: 'blacklist', label: '黑名单', empty: '当前还没有黑名单条目。' },
]

export default function LotteryListsPanel({ raceId, raceDetail, onDataChanged }) {
  const fileInputRef = useRef(null)
  const [activeListType, setActiveListType] = useState('whitelist')
  const [listEntries, setListEntries] = useState([])
  const [fullRecords, setFullRecords] = useState([])
  const [conflictRule, setConflictRule] = useState('strict')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [matching, setMatching] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')
  const [manualForm, setManualForm] = useState({ name: '', idNumber: '', phone: '' })
  const [editingEntry, setEditingEntry] = useState(null)

  const loadData = useCallback(async () => {
    if (!raceId) return

    setLoading(true)
    try {
      const [listsResponse, records, raceResponse] = await Promise.all([
        lotteryApi.getLotteryLists(Number(raceId)),
        fetchAllRecords(Number(raceId)),
        raceDetail ? Promise.resolve({ data: raceDetail }) : racesApi.getById(Number(raceId)).catch(() => null),
      ])

      setListEntries(unwrapData(listsResponse) || [])
      setFullRecords(records)
      setConflictRule(unwrapData(raceResponse)?.conflictRule || raceDetail?.conflictRule || 'strict')
    } catch (err) {
      setMessage(`加载黑白名单失败：${err.message}`)
      setMessageTone('danger')
      setListEntries([])
      setFullRecords([])
    } finally {
      setLoading(false)
    }
  }, [raceDetail, raceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const refreshMatching = useCallback(async ({ announce = true, ruleOverride } = {}) => {
    if (!raceId) return

    setMatching(true)
    try {
      const effectiveRule = ruleOverride || conflictRule
      const records = await fetchAllRecords(Number(raceId))
      const currentEntries = unwrapData(await lotteryApi.getLotteryLists(Number(raceId))) || []
      const resolvedEntries = buildResolvedEntries(currentEntries, records)

      if (resolvedEntries.length > 0) {
        await lotteryApi.bulkPutLotteryLists(resolvedEntries.map((entry) => ({
          id: entry.id,
          raceId: Number(raceId),
          listType: entry.listType,
          name: entry.name,
          idNumber: entry.idNumber,
          phone: entry.phone,
          matchedRecordId: entry.matchedRecordId || undefined,
          matchType: entry.matchType || undefined,
        })))
      }

      const statusResult = await applyStatusesForEntries(resolvedEntries, records, effectiveRule)
      setListEntries(resolvedEntries)
      setFullRecords(records)
      onDataChanged?.()

      if (announce) {
        setMessage(`已重新应用匹配与状态，处理 ${resolvedEntries.length} 条名单，写回 ${statusResult.updated} 条记录。`)
        setMessageTone('success')
      }
    } catch (err) {
      setMessage(`重新应用失败：${err.message}`)
      setMessageTone('danger')
    } finally {
      await loadData()
      setMatching(false)
    }
  }, [conflictRule, loadData, onDataChanged, raceId])

  const handleConflictRuleChange = useCallback(async (nextRule) => {
    try {
      await racesApi.update(Number(raceId), { conflictRule: nextRule })
      setConflictRule(nextRule)
      setMessage(`已切换到${nextRule === 'strict' ? '严格' : '宽松'}模式，正在重新应用名单规则。`)
      setMessageTone('success')
      await refreshMatching({ announce: false, ruleOverride: nextRule })
    } catch (err) {
      setMessage(`切换冲突规则失败：${err.message}`)
      setMessageTone('danger')
    }
  }, [raceId, refreshMatching])

  const handleCheckConflicts = useCallback(async () => {
    try {
      const conflicts = unwrapData(await lotteryApi.getLotteryListConflicts(Number(raceId))) || []
      if (!conflicts.length) {
        setMessage('未发现黑白名单冲突。')
        setMessageTone('success')
        return
      }

      const preview = conflicts.slice(0, 8).map((item) => `${item.name}(${item.idNumber})`).join('，')
      setMessage(`发现 ${conflicts.length} 个冲突条目：${preview}${conflicts.length > 8 ? ' ...' : ''}`)
      setMessageTone('warning')
    } catch (err) {
      setMessage(`检查冲突失败：${err.message}`)
      setMessageTone('danger')
    }
  }, [raceId])

  const handleManualAdd = useCallback(async () => {
    if (!manualForm.name.trim() || !manualForm.idNumber.trim()) {
      setMessage('请先填写姓名和证件号。')
      setMessageTone('warning')
      return
    }

    try {
      await lotteryApi.saveLotteryLists([{
        raceId: Number(raceId),
        listType: activeListType,
        name: manualForm.name.trim(),
        idNumber: manualForm.idNumber.trim(),
        phone: manualForm.phone.trim(),
      }])
      setManualForm({ name: '', idNumber: '', phone: '' })
      await refreshMatching({ announce: false })
      setMessage(`已新增 1 条${activeListType === 'whitelist' ? '白' : '黑'}名单。`)
      setMessageTone('success')
    } catch (err) {
      setMessage(`新增条目失败：${err.message}`)
      setMessageTone('danger')
    }
  }, [activeListType, manualForm, raceId, refreshMatching])

  const handleEditEntry = useCallback((entry) => {
    setEditingEntry(entry)
  }, [])

  const handleEditSave = useCallback(async (formData) => {
    if (!editingEntry?.id) return

    try {
      await lotteryApi.updateLotteryList(editingEntry.id, {
        name: formData.name,
        idNumber: formData.idNumber,
        phone: formData.phone,
      })
      setEditingEntry(null)
      await refreshMatching({ announce: false })
      setMessage('条目已更新。')
      setMessageTone('success')
    } catch (err) {
      throw err
    }
  }, [editingEntry, refreshMatching])

  const handleDeleteEntry = useCallback(async (entryId) => {
    if (!window.confirm('确认删除该名单条目？')) return

    try {
      await lotteryApi.deleteLotteryList(entryId)
      await refreshMatching({ announce: false })
      setMessage('条目已删除。')
      setMessageTone('success')
    } catch (err) {
      setMessage(`删除失败：${err.message}`)
      setMessageTone('danger')
    }
  }, [refreshMatching])

  const handleClearCurrentList = useCallback(async () => {
    const label = activeListType === 'whitelist' ? '白名单' : '黑名单'
    if (!window.confirm(`确认清空当前${label}？`)) return

    try {
      await lotteryApi.clearLotteryLists(Number(raceId), activeListType)
      await refreshMatching({ announce: false })
      setMessage(`当前${label}已清空。`)
      setMessageTone('success')
    } catch (err) {
      setMessage(`清空失败：${err.message}`)
      setMessageTone('danger')
    }
  }, [activeListType, raceId, refreshMatching])

  const handleImport = useCallback(async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    try {
      setLoading(true)
      const rows = await parseListExcel(file)
      const existingIds = new Set(
        listEntries
          .filter((entry) => entry.listType === activeListType)
          .map((entry) => String(entry.idNumber || '').trim()),
      )

      const entries = rows
        .filter((row) => row.idNumber)
        .filter((row) => !existingIds.has(row.idNumber))
        .map((row) => ({
          raceId: Number(raceId),
          listType: activeListType,
          name: row.name || '(未命名)',
          idNumber: row.idNumber,
          phone: row.phone,
        }))

      if (!entries.length) {
        setMessage('导入文件中没有新的可用条目。')
        setMessageTone('warning')
        return
      }

      await lotteryApi.bulkPutLotteryLists(entries)
      await refreshMatching({ announce: false })
      setMessage(`已导入 ${entries.length} 条${activeListType === 'whitelist' ? '白' : '黑'}名单。`)
      setMessageTone('success')
    } catch (err) {
      setMessage(`导入失败：${err.message}`)
      setMessageTone('danger')
    } finally {
      setLoading(false)
    }
  }, [activeListType, listEntries, raceId, refreshMatching])

  const currentEntries = useMemo(() => {
    const current = listEntries.filter((entry) => entry.listType === activeListType)
    if (!searchTerm.trim()) return current

    const keyword = searchTerm.trim().toLowerCase()
    return current.filter((entry) => (
      String(entry.name || '').toLowerCase().includes(keyword)
      || String(entry.idNumber || '').toLowerCase().includes(keyword)
      || String(entry.phone || '').toLowerCase().includes(keyword)
    ))
  }, [activeListType, listEntries, searchTerm])

  const stats = useMemo(() => {
    const whitelist = listEntries.filter((entry) => entry.listType === 'whitelist')
    const blacklist = listEntries.filter((entry) => entry.listType === 'blacklist')
    return {
      whitelistTotal: whitelist.length,
      whitelistMatched: whitelist.filter((entry) => entry.matchedRecordId).length,
      blacklistTotal: blacklist.length,
      blacklistMatched: blacklist.filter((entry) => entry.matchedRecordId).length,
      recordTotal: fullRecords.length,
    }
  }, [fullRecords.length, listEntries])

  const currentTabMeta = LIST_TABS.find((item) => item.key === activeListType) || LIST_TABS[0]

  return (
    <div className="processing-stack">
      {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}

      <CommandPanel
        title="黑 / 白名单概览"
        subtitle="导入后不会自动长期保持同步，修改名单后请手动重新应用匹配。"
        actions={(
          <div className="processing-inline-actions">
            <button className="btn btn--secondary" onClick={handleCheckConflicts}>
              检查冲突
            </button>
            <button className="btn btn--primary" onClick={() => refreshMatching()} disabled={matching}>
              {matching ? '重新应用中...' : '重新应用匹配'}
            </button>
          </div>
        )}
      >
        <div className="pipeline-event-grid">
          <article className="pipeline-event-card">
            <div className="pipeline-event-title-row">
              <strong>白名单</strong>
              <CommandStatusTag tone="success">{stats.whitelistTotal} 条</CommandStatusTag>
            </div>
            <div className="pipeline-event-stats">
              <span>已匹配 {stats.whitelistMatched}</span>
            </div>
          </article>
          <article className="pipeline-event-card">
            <div className="pipeline-event-title-row">
              <strong>黑名单</strong>
              <CommandStatusTag tone="danger">{stats.blacklistTotal} 条</CommandStatusTag>
            </div>
            <div className="pipeline-event-stats">
              <span>已匹配 {stats.blacklistMatched}</span>
            </div>
          </article>
          <article className="pipeline-event-card">
            <div className="pipeline-event-title-row">
              <strong>选手记录</strong>
              <CommandStatusTag tone="neutral">{stats.recordTotal} 人</CommandStatusTag>
            </div>
            <div className="pipeline-event-stats">
              <span>当前赛事可用于匹配的完整记录集合</span>
            </div>
          </article>
        </div>
      </CommandPanel>

      <CommandPanel
        title="冲突规则"
        subtitle={conflictRule === 'strict' ? '严格模式：黑名单命中优先，冲突将强制剔除。' : '宽松模式：白名单优先，冲突将强制保签。'}
      >
        <div className="processing-inline-actions">
          <button
            className={`btn ${conflictRule === 'strict' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => handleConflictRuleChange('strict')}
          >
            严格模式
          </button>
          <button
            className={`btn ${conflictRule === 'permissive' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => handleConflictRuleChange('permissive')}
          >
            宽松模式
          </button>
        </div>
      </CommandPanel>

      <CommandPanel title="单条维护" subtitle="支持手工补录当前列表中的单条名单。">
        <div className="processing-list-toolbar">
          <input
            className="input"
            placeholder="姓名"
            value={manualForm.name}
            onChange={(event) => setManualForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className="input"
            placeholder="证件号，可用 * / ? 做模糊匹配"
            value={manualForm.idNumber}
            onChange={(event) => setManualForm((prev) => ({ ...prev, idNumber: event.target.value }))}
          />
          <input
            className="input"
            placeholder="手机号"
            value={manualForm.phone}
            onChange={(event) => setManualForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <button className="btn btn--primary" onClick={handleManualAdd}>
            新增到当前列表
          </button>
        </div>
      </CommandPanel>

      <CommandPanel
        title={`${currentTabMeta.label}处理`}
        subtitle="支持 Excel 导入、搜索、单条编辑删除与整表清空。"
        actions={(
          <div className="processing-inline-actions">
            <input ref={fileInputRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleImport} />
            <button className="btn btn--secondary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              导入 Excel
            </button>
            <button className="btn btn--ghost" onClick={handleClearCurrentList}>
              清空当前列表
            </button>
          </div>
        )}
      >
        <div className="processing-list-tabs">
          {LIST_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`processing-list-tab ${activeListType === item.key ? 'active' : ''}`}
              onClick={() => setActiveListType(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="processing-list-toolbar">
          <input
            className="input"
            placeholder="搜索姓名、证件号或手机号"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        {loading ? (
          <CommandNotice tone="info">正在加载名单数据...</CommandNotice>
        ) : currentEntries.length === 0 ? (
          <CommandEmptyState
            icon={activeListType === 'whitelist' ? 'WL' : 'BL'}
            title={`暂无${currentTabMeta.label}数据`}
            description={currentTabMeta.empty}
          />
        ) : (
          <CommandDataTable>
            <thead>
              <tr>
                <th>#</th>
                <th>姓名</th>
                <th>证件号</th>
                <th>手机号</th>
                <th>匹配</th>
                <th>模式</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {currentEntries.map((entry, index) => (
                <tr key={entry.id || `${entry.listType}-${entry.idNumber}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{entry.name}</td>
                  <td>{entry.idNumber}</td>
                  <td>{entry.phone || '-'}</td>
                  <td>
                    <CommandStatusTag tone={entry.matchedRecordId ? 'success' : 'warning'}>
                      {entry.matchedRecordId ? `已匹配 #${entry.matchedRecordId}` : '未匹配'}
                    </CommandStatusTag>
                  </td>
                  <td>
                    <CommandStatusTag tone={entry.matchType === 'fuzzy' ? 'warning' : 'neutral'}>
                      {entry.matchType || (isWildcard(entry.idNumber) ? '待匹配' : '精确')}
                    </CommandStatusTag>
                  </td>
                  <td>
                    <div className="processing-inline-actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => handleEditEntry(entry)}>
                        编辑
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={() => handleDeleteEntry(entry.id)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </CommandDataTable>
        )}

        <div className="processing-help">
          Excel 表头至少包含“姓名”和“证件号”列。证件号支持 `*` 与 `?` 通配符，用于模糊匹配黑名单。
        </div>
      </CommandPanel>

      {editingEntry ? (
        <ListEntryEditModal
          entry={editingEntry}
          onSave={handleEditSave}
          onCancel={() => setEditingEntry(null)}
        />
      ) : null}
    </div>
  )
}
