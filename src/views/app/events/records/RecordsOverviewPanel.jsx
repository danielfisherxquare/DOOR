import { useCallback, useEffect, useMemo, useState } from 'react'
import recordsApi from '../../../../api/records'
import {
  FILTERABLE_RECORD_FIELDS,
  changeRecordFilterField,
  getRecordFilterOperators,
} from './recordFilters'
import {
  AppH5DataCard,
  AppH5DataTable,
  AppH5EmptyState,
  AppH5Notice,
  AppH5Panel,
  AppH5Toolbar,
  AppH5FilterBar,
  AppH5StatusTag,
} from '../../../../components/app/AppH5Surface'

const PAGE_SIZE = 50

const RECORD_FIELD_LABELS = {
  name: '姓名',
  event: '项目',
  phone: '手机号',
  idNumber: '证件号',
  lotteryStatus: '签位状态',
  bibNumber: '号码布',
  source: '来源',
}

const RECORD_MOBILE_FIELDS = ['event', 'phone', 'idNumber', 'lotteryStatus', 'bibNumber', 'source']

function getRecordValue(record, key) {
  return record?.[key] === undefined || record?.[key] === null || record?.[key] === '' ? '-' : record[key]
}

function getRecordStatusTone(status) {
  const value = String(status || '')
  if (/(中签|保签|通过|已确认|locked)/i.test(value)) return 'success'
  if (/(剔除|黑名单|拒绝|removed|rejected)/i.test(value)) return 'danger'
  if (/(待|pending|未处理)/i.test(value)) return 'warning'
  return 'neutral'
}

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
      const result = response.data || { records: [], total: 0 }
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
      setAvailableFields(Object.keys(records[0]).filter((key) => FILTERABLE_RECORD_FIELDS.has(key)))
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
    setFilters((prev) => prev.map((item, currentIndex) => {
      if (currentIndex !== index) return item
      return key === 'field' ? changeRecordFilterField(item, value) : { ...item, [key]: value }
    }))
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
        const result = response.data || { records: [], total: 0 }
        allRecords.push(...(result.records || []))
        if ((result.records || []).length < limit) break
        offset += limit
      }

      const { exportToExcel } = await import('../../../../utils/excelProcessor')

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
      {message ? <AppH5Notice tone={messageTone}>{message}</AppH5Notice> : null}
      {error ? <AppH5Notice tone="danger">{`加载失败：${error}`}</AppH5Notice> : null}

      <AppH5Panel
        title="筛选与导出"
        subtitle="先缩小结果范围，再执行导出或后续批量操作。"
      >
        <AppH5Toolbar>
          <AppH5FilterBar>
            <div className="records-search">
              <input
                type="text"
                className="input"
                placeholder="搜索姓名..."
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
          </AppH5FilterBar>
        </AppH5Toolbar>

        {showFilters ? (
          <div className="records-filters app-h5-table-wrap">
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
                  {getRecordFilterOperators(filter.field).map((operator) => (
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
      </AppH5Panel>

      <AppH5Panel
        title="选手记录"
        subtitle={currentRace ? `当前赛事：${currentRace.name}` : `赛事 ID：${raceId}`}
        footer={<div className="records-stats">{`共 ${total} 条记录`}</div>}
      >
        <div className="records-table-wrapper">
          {loading ? (
            <AppH5Notice tone="info">正在加载选手记录...</AppH5Notice>
          ) : records.length === 0 ? (
            <AppH5EmptyState
              icon="EMP"
              title="暂无数据"
              description="当前赛事还没有导入选手名单，请先进行名单导入。"
            />
          ) : (
            <AppH5DataTable
              mobileCards={records.map((record) => (
                <AppH5DataCard
                  key={record.id}
                  eyebrow={record.idNumber ? `证件号 ${record.idNumber}` : `记录 ${record.id}`}
                  title={record.name || record.realName || record.idNumber || `记录 ${record.id}`}
                  meta={(
                    <AppH5StatusTag tone={getRecordStatusTone(record.lotteryStatus)}>
                      {getRecordValue(record, 'lotteryStatus')}
                    </AppH5StatusTag>
                  )}
                  fields={RECORD_MOBILE_FIELDS.map((key) => ({
                    key,
                    label: RECORD_FIELD_LABELS[key],
                    value: getRecordValue(record, key),
                  }))}
                  actions={(
                    <label className="records-mobile-select">
                      <input
                        type="checkbox"
                        checked={selectedRecords.has(record.id)}
                        onChange={() => toggleSelect(record.id)}
                      />
                      <span>选择</span>
                    </label>
                  )}
                />
              ))}
            >
              <table>
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
              </table>
            </AppH5DataTable>
          )}
        </div>

        {total > PAGE_SIZE ? (
          <div className="records-pagination-wrap">
            <RecordsPager
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage((current) => current - 1)}
              onNext={() => setPage((current) => current + 1)}
            />
          </div>
        ) : null}
      </AppH5Panel>
    </>
  )
}

function RecordsPager({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null

  return (
    <div className="records-pager">
      <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={onPrev}>上一页</button>
      <span className="records-pager__status">{page} / {totalPages}</span>
      <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={onNext}>下一页</button>
    </div>
  )
}
