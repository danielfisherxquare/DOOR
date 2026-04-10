import { useEffect, useMemo, useState } from 'react'
import request from '../../../utils/request'
import useAuthStore from '../../../stores/authStore'

const DIRECT_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

import {
  CommandDataTable,
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandStatusTag,
} from '../../../components/command/CommandPrimitives'

function currency(value) {
  return `¥${Number(value || 0).toLocaleString()}`
}

function AdminView({ canViewAll, orgId }) {
  const [activeTab, setActiveTab] = useState(canViewAll ? 'all' : 'org')
  const [data, setData] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setError('')
      try {
        let url = ''
        if (activeTab === 'all') {
          url = '/admin/reimbursements/all'
        } else if (orgId) {
          url = `/admin/reimbursements/org/${orgId}`
        }

        if (url) {
          const json = await request.get(url)
          setData(json.data || [])
        } else {
          setData([])
        }
      } catch (err) {
        console.error('Failed to fetch admin data:', err)
        setError(err.message || '加载报销管理数据失败')
      }
      setIsLoading(false)
    }

    fetchData()
  }, [activeTab, orgId])

  const handleViewDetails = async (projectId) => {
    setRecordsLoading(true)
    setError('')
    try {
      const json = await request.get(`/admin/reimbursements/projects/${projectId}/records`)
      setSelectedProject(json.project)
      setRecords(json.records || [])
    } catch (err) {
      console.error('Failed to fetch project records:', err)
      setError(err.message || '获取项目明细失败')
    }
    setRecordsLoading(false)
  }

  const handleExport = async (projectId, projectName) => {
    try {
      const response = await fetch(`${DIRECT_API_BASE}/admin/reimbursements/projects/${projectId}/export`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      })

      if (response.status === 401) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return
      }

      if (!response.ok) {
        throw new Error('导出失败')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName || '报销单'}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      setError(err.message || '导出失败')
    }
  }

  const metrics = useMemo(() => {
    if (!selectedProject) return []

    const totalIncome = records.reduce((sum, item) => sum + Number(item.income || 0), 0)
    const totalExpense = records.reduce((sum, item) => sum + Number(item.expense || 0), 0)
    return [
      { key: 'income', label: '总收入', value: currency(totalIncome), meta: '项目累计入账金额', pill: 'IN' },
      { key: 'expense', label: '总支出', value: currency(totalExpense), meta: '项目累计报销金额', pill: 'OUT' },
      { key: 'balance', label: '结余', value: currency(totalIncome - totalExpense), meta: '按当前明细自动核算', pill: 'NET' },
    ]
  }, [records, selectedProject])

  if (selectedProject) {
    return (
      <div className="command-page surface-admin">
        <CommandPanel
          title={selectedProject.name}
          subtitle={`项目明细 · ${records.length} 条记录`}
          actions={(
            <div className="command-actions-row">
              <button className="btn btn--ghost" onClick={() => { setSelectedProject(null); setRecords([]) }}>返回列表</button>
              <button className="btn btn--primary" onClick={() => handleExport(selectedProject.id, selectedProject.name)}>导出 Excel</button>
            </div>
          )}
        >
          <CommandMetricGrid items={metrics} />
        </CommandPanel>

        {error ? <CommandNotice tone="danger">{error}</CommandNotice> : null}

        <CommandPanel title="报销明细" subtitle="当前项目的收入、支出与凭证概览。">
          {recordsLoading ? <CommandNotice tone="info">正在加载项目明细...</CommandNotice> : null}
          {!recordsLoading && !records.length ? (
            <CommandEmptyState title="当前项目暂无明细" description="项目已经创建，但还没有产生可导出的报销记录。" icon="RB" />
          ) : null}
          {!recordsLoading && records.length ? (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>序号</th>
                  <th>日期</th>
                  <th>大类</th>
                  <th>摘要</th>
                  <th>收入</th>
                  <th>支出</th>
                  <th>报销人</th>
                  <th>发票</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.index}</td>
                    <td>{record.payment_date || '-'}</td>
                    <td>{record.category || '-'}</td>
                    <td>{record.description || '-'}</td>
                    <td>{record.income ? currency(record.income) : '-'}</td>
                    <td>{record.expense ? currency(record.expense) : '-'}</td>
                    <td>{record.reporter || '-'}</td>
                    <td>{record.has_invoice ? '是' : '否'}</td>
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          ) : null}
        </CommandPanel>
      </div>
    )
  }

  return (
    <div className="command-page surface-admin">
      <CommandPanel title="报销管理" subtitle="查看机构内或平台范围内的报销数据，并进入项目明细导出。">
        {canViewAll ? (
          <div className="command-actions-row">
            <button className={`btn ${activeTab === 'org' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setActiveTab('org')}>
              本机构
            </button>
            <button className={`btn ${activeTab === 'all' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setActiveTab('all')}>
              全部数据
            </button>
          </div>
        ) : null}
      </CommandPanel>

      {error ? <CommandNotice tone="danger">{error}</CommandNotice> : null}
      {isLoading ? <CommandNotice tone="info">正在加载报销汇总...</CommandNotice> : null}

      <CommandPanel title="项目汇总" subtitle="点击查看明细进入项目记录，并按需导出 Excel。">
        {!isLoading && !data.length ? (
          <CommandEmptyState title="暂无报销数据" description="当前机构下还没有可查看的报销项目。" icon="RB" />
        ) : null}
        {!isLoading && data.length ? (
          <CommandDataTable>
            <thead>
              <tr>
                <th>用户</th>
                <th>项目</th>
                <th>记录数</th>
                <th>总支出</th>
                <th>总收入</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>{item.user_name || '-'}</td>
                  <td>{item.project_name || item.name}</td>
                  <td>{item.record_count}</td>
                  <td>{currency(item.total_expense)}</td>
                  <td>{currency(item.total_income)}</td>
                  <td>
                    <CommandStatusTag tone={item.status === 'active' ? 'success' : 'neutral'}>
                      {item.status === 'active' ? '进行中' : '已归档'}
                    </CommandStatusTag>
                  </td>
                  <td>
                    <div className="command-actions-row">
                      <button className="btn btn--ghost" onClick={() => handleViewDetails(item.id)}>
                        查看明细
                      </button>
                      <button className="btn btn--ghost" onClick={() => handleExport(item.id, item.project_name || item.name)}>
                        导出
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </CommandDataTable>
        ) : null}
      </CommandPanel>
    </div>
  )
}

export default AdminView
