import { useCallback, useEffect, useMemo, useState } from 'react'
import recordsApi from '../../../api/records'
import { unwrapRecordsQueryResult } from '../../../utils/apiResponse'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandNotice,
  CommandPanel,
  CommandToolbar,
  CommandFilterBar,
} from '../../../components/command/CommandPrimitives'

const PAGE_SIZE = 50

const FILTER_OPERATORS = [
  { value: 'equals', label: '等于' },
  { value: 'contains', label: '包含' },
  { value: 'startsWith', label: '开头为' },
  { value: 'endsWith', label: '结尾为' },
  { value: 'notEquals', label: '不等于' },
]

export default function RecordsOverviewPanel({
  raceId,
  currentRace,
  extraActions = null,
}) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState([])
  const [sort, setSort] = useState({ field: 'id', direction: 'asc' })
  const [selectedRecords, setSelectedRecords] = useState(new Set())

  const [showFilters, setShowFilters] = useState(false)
  const [availableFields, setAvailableFields] = useState([])
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')

  const loadRecords = useCallback(async () => {
    if (!raceId) return

    setLoading(true)
    setError(null)
    setMessage('')
    try {
      const response = await recordsApi.query({
        raceId: Number(raceId),
        keyword: keyword || undefined,
        filters: filters.length > 0 ? filters : undefined,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        sort,
      })
      const result = unwrapRecordsQueryResult(response)
      setRecords(result.records || [])
      setTotal(result.total || 0)
    } catch (err) {
      setError(err.message)
      setRecords([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [raceId, keyword, filters, page, sort])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  useEffect(() => {
    setSelectedRecords(new Set())
  }, [records])

  useEffect(() => {
    if (records.length > 0) {
      setAvailableFields(Object.keys(records[0]).filter((key) => !key.startsWith('_')))
      return
    }
    setAvailableFields([])
  }, [records])

  const handleSearch = () => {
    setPage(1)
    loadRecords()
  }

  const handleSort = (field) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const addFilter = () => {
    setFilters((prev) => [...prev, { field: '', operator: 'equals', value: '' }])
  }

  const updateFilter = (index, key, value) => {
    setFilters((prev) => prev.map((item, currentIndex) => (
      currentIndex === index ? { ...item, [key]: value } : item
    )))
  }

  const removeFilter = (index) => {
    setFilters((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
  }

  const toggleSelectAll = () => {
    if (selectedRecords.size === records.length) {
      setSelectedRecords(new Set())
      return
    }
    setSelectedRecords(new Set(records.map((record) => record.id)))
  }

  const toggleSelect = (id) => {
    setSelectedRecords((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleExport = async () => {
    if (!raceId) return

    try {
      const allRecords = []
      let offset = 0
      const limit = 1000

      while (true) {
        const response = await recordsApi.query({
          raceId: Number(raceId),
          offset,
          limit,
          sort,
        })
        const result = unwrapRecordsQueryResult(response)
        allRecords.push(...(result.records || []))
        if ((result.records || []).length < limit) break
        offset += limit
      }

      const { exportToExcel } = await import('../../../utils/excelProcessor')

      // 固定列顺序（运营团队依赖此顺序）——增减请同步告知运营
      const ORDERED_EXPORT_COLUMNS = [
        { key: 'name', label: '姓名' },
        { key: 'idNumber', label: '证件号码' },
        { key: 'phone', label: '手机号' },
        { key: 'gender', label: '性别' },
        { key: 'event', label: '项目' },
        { key: 'source', label: '来源' },
        { key: 'lotteryStatus', label: '签位状态' },
        { key: 'bibNumber', label: '号码布' },
      ]

      // 动态追加当前数据中存在但未在固定列表中的字段
      const fixedKeys = new Set(ORDERED_EXPORT_COLUMNS.map((col) => col.key))
      const dynamicColumns = columns.length > 0
        ? columns.filter((col) => !fixedKeys.has(col) && !col.startsWith('_') && col !== 'id')
        : []

      const allExportColumns = [
        ...ORDERED_EXPORT_COLUMNS.map((col) => col.key),
        ...dynamicColumns,
      ]
      const allExportLabels = Object.fromEntries([
        ...ORDERED_EXPORT_COLUMNS.map((col) => [col.key, col.label]),
        ...dynamicColumns.map((col) => [col, col]),
      ])

      exportToExcel(allRecords, [], `选手名单_${raceId}.xlsx`, allExportColumns, allExportLabels)
      setMessage(`已导出 ${allRecords.length} 条选手记录。`)
      setMessageTone('success')
    } catch (err) {
      setMessage(`导出失败：${err.message}`)
      setMessageTone('danger')
    }
  }

  const columns = useMemo(() => {
    if (records.length === 0) return []
    return Object.keys(records[0]).filter((key) => !key.startsWith('_')).slice(0, 10)
  }, [records])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      {message ? <CommandNotice tone={messageTone}>{message}</CommandNotice> : null}
      {error ? <CommandNotice tone="danger">{`加载失败：${error}`}</CommandNotice> : null}

      <CommandPanel
        title="筛选与导出"
        subtitle="先缩小结果范围，再执行导出或后续批量操作。"
      >
        <CommandToolbar>
          <CommandFilterBar>
            <div className="records-search">
              <input
                type="text"
                className="input"
                placeholder="搜索姓名、证件号、手机号..."
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
              />
              <button className="btn btn--primary" onClick={handleSearch}>
                搜索
              </button>
            </div>

            <div className="records-actions">
              {extraActions}
              <button className="btn btn--secondary" onClick={() => setShowFilters((prev) => !prev)}>
                {showFilters ? '隐藏筛选' : '高级筛选'}
              </button>
              <button className="btn btn--secondary" onClick={handleExport}>
                导出 Excel
              </button>
            </div>
          </CommandFilterBar>
        </CommandToolbar>

        {showFilters ? (
          <div className="records-filters command-table-wrap">
            {filters.map((filter, index) => (
              <div key={`${filter.field}-${index}`} className="records-filter-row">
                <select
                  className="input"
                  value={filter.field}
                  onChange={(event) => updateFilter(index, 'field', event.target.value)}
                >
                  <option value="">选择字段</option>
                  {availableFields.map((field) => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
                <select
                  className="input"
                  value={filter.operator}
                  onChange={(event) => updateFilter(index, 'operator', event.target.value)}
                >
                  {FILTER_OPERATORS.map((operator) => (
                    <option key={operator.value} value={operator.value}>{operator.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  className="input"
                  value={filter.value}
                  onChange={(event) => updateFilter(index, 'value', event.target.value)}
                  placeholder="值"
                />
                <button className="btn btn--ghost" onClick={() => removeFilter(index)}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn btn--secondary" onClick={addFilter}>
              + 添加筛选条件
            </button>
          </div>
        ) : null}
      </CommandPanel>

      <CommandPanel
        title="选手记录"
        subtitle={currentRace ? `当前赛事：${currentRace.name}` : `赛事 ID：${raceId}`}
        footer={<div className="records-stats">{`共 ${total} 条记录`}</div>}
      >
        <div className="records-table-wrapper">
          {loading ? (
            <CommandNotice tone="info">正在加载选手记录...</CommandNotice>
          ) : records.length === 0 ? (
            <CommandEmptyState
              icon="EMP"
              title="暂无数据"
              description="当前赛事还没有导入选手名单，请先进行名单导入。"
            />
          ) : (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selectedRecords.size === records.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {columns.map((column) => (
                    <th key={column} onClick={() => handleSort(column)} className="records-sortable">
                      {column}
                      {sort.field === column ? (
                        <span className="records-sort-indicator">
                          {sort.direction === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRecords.has(record.id)}
                        onChange={() => toggleSelect(record.id)}
                      />
                    </td>
                    {columns.map((column) => (
                      <td key={column}>{record[column] || ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          )}
        </div>

        {total > PAGE_SIZE ? (
          <div className="records-pagination-wrap">
            <CommandPager
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage((current) => current - 1)}
              onNext={() => setPage((current) => current + 1)}
            />
          </div>
        ) : null}
      </CommandPanel>
    </>
  )
}

function CommandPager({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null

  return (
    <div className="records-pager">
      <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={onPrev}>上一页</button>
      <span className="records-pager__status">{page} / {totalPages}</span>
      <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={onNext}>下一页</button>
    </div>
  )
}
