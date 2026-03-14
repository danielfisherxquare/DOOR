import { useCallback, useEffect, useState } from 'react'
import projectsApi from '../../api/projects'
import TaskEditModal from './TaskEditModal'

const emptyTask = (projectId, parentId = null) => ({
  title: '',
  status: 'TODO',
  responsible_group: null,
  start_date: '',
  end_date: '',
  is_milestone: false,
  notes: '',
  project_id: projectId,
  parent_id: parentId,
  sort_order: 0,
})

export default function TreeGrid({ projectId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingTask, setEditingTask] = useState(null)

  const fetchTasks = useCallback(async () => {
    try {
      const data = await projectsApi.getTasks(projectId)
      if (data.success) setTasks(buildTree(data.data))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchTasks()
  }, [fetchTasks])

  const buildTree = (flatList) => {
    const map = {}
    const roots = []
    flatList.forEach((task) => {
      map[task.id] = { ...task, children: [], isExpanded: true }
    })
    flatList.forEach((task) => {
      if (task.parent_id && map[task.parent_id]) map[task.parent_id].children.push(map[task.id])
      else roots.push(map[task.id])
    })
    return roots
  }

  const handleCreateTask = async (parentId = null) => {
    try {
      const payload = { ...emptyTask(projectId, parentId), title: '新任务' }
      if (!payload.start_date) delete payload.start_date
      if (!payload.end_date) delete payload.end_date
      const data = await projectsApi.createTask(projectId, payload)
      if (data.success) await fetchTasks()
      else alert(`添加任务失败: ${data.message || data.error || '未知错误'}`)
    } catch (error) {
      alert(error.message || '添加任务失败')
    }
  }

  const handleUpdateTask = async (taskId, updates) => {
    try {
      const payload = { ...updates }
      if (payload.start_date === '') payload.start_date = null
      if (payload.end_date === '') payload.end_date = null
      const data = await projectsApi.updateTask(projectId, taskId, payload)
      if (!data.success) {
        alert(`更新任务失败: ${data.message || data.error || '未知错误'}`)
        return
      }
      setTasks((prev) => updateNode(prev, taskId, payload))
    } catch (error) {
      alert(error.message || '更新任务失败')
    }
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('确定要删除此任务及其子任务吗？')) return
    try {
      const data = await projectsApi.removeTask(projectId, taskId)
      if (data.success) await fetchTasks()
      else alert(`删除失败: ${data.message || data.error || '未知错误'}`)
    } catch (error) {
      alert(error.message || '删除失败')
    }
  }

  const toggleExpand = (taskId) => {
    setTasks((prev) => prev.map((task) => toggleNode(task, taskId)))
  }

  const visibleRows = flattenNodes(tasks)

  if (loading) return <div style={{ padding: 20 }}>加载任务中...</div>

  return (
    <div style={{ padding: 20, background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, margin: 0, color: '#374151' }}>任务列表</h3>
        <button onClick={() => void handleCreateTask()} className="btn btn--primary" style={primaryButtonStyle}>+ 根任务</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 980, width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px', width: '28%' }}>任务名称</th>
              <th style={{ padding: '12px', width: '10%' }}>状态</th>
              <th style={{ padding: '12px', width: '18%' }}>负责人</th>
              <th style={{ padding: '12px', width: '12%' }}>开始日期</th>
              <th style={{ padding: '12px', width: '12%' }}>结束日期</th>
              <th style={{ padding: '12px', width: '8%', textAlign: 'center' }}>里程碑</th>
              <th style={{ padding: '12px', width: '12%', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>暂无任务</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: row.depth * 20, flexShrink: 0 }} />
                  <button onClick={() => toggleExpand(row.id)} style={treeToggleStyle}>
                    {row.children?.length > 0 ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: row.isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    ) : <span style={{ width: 12 }} />}
                  </button>
                  <input value={row.title} onChange={(event) => void handleUpdateTask(row.id, { title: event.target.value })} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontWeight: row.depth === 0 ? 600 : 400 }} placeholder="输入任务名称" />
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <select value={row.status} onChange={(event) => void handleUpdateTask(row.id, { status: event.target.value })} style={{ border: 'none', background: 'transparent', outline: 'none' }}>
                    <option value="TODO">待办</option>
                    <option value="IN_PROGRESS">进行中</option>
                    <option value="DONE">已完成</option>
                    <option value="CANCELLED">已取消</option>
                  </select>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditingTask(row)} style={{ minWidth: 'auto' }}>
                    {row.assignee_summary || row.responsible_group || '设置负责人'}
                  </button>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <input type="date" value={row.start_date ? row.start_date.substring(0, 10) : ''} onChange={(event) => void handleUpdateTask(row.id, { start_date: event.target.value ? new Date(event.target.value).toISOString() : null })} style={dateInputStyle} />
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <input type="date" value={row.end_date ? row.end_date.substring(0, 10) : ''} onChange={(event) => void handleUpdateTask(row.id, { end_date: event.target.value ? new Date(event.target.value).toISOString() : null })} style={dateInputStyle} />
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                  <input type="checkbox" checked={row.is_milestone} onChange={(event) => void handleUpdateTask(row.id, { is_milestone: event.target.checked })} />
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <button onClick={() => void handleCreateTask(row.id)} title="添加子任务" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#10b981', marginRight: 8, fontSize: 16 }}>+</button>
                  <button onClick={() => setEditingTask(row)} title="编辑" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563eb', marginRight: 8, fontSize: 14 }}>编辑</button>
                  <button onClick={() => void handleDeleteTask(row.id)} title="删除" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>&times;</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          projectId={projectId}
          onClose={() => setEditingTask(null)}
          onSaveSuccess={() => {
            setEditingTask(null)
            void fetchTasks()
          }}
        />
      )}
    </div>
  )
}

function flattenNodes(nodes, depth = 0) {
  let result = []
  nodes.forEach((node) => {
    result.push({ ...node, depth })
    if (node.isExpanded && node.children?.length > 0) {
      result = result.concat(flattenNodes(node.children, depth + 1))
    }
  })
  return result
}

function updateNode(nodes, taskId, updates) {
  return nodes.map((task) => {
    if (task.id === taskId) return { ...task, ...updates }
    if (task.children?.length) return { ...task, children: updateNode(task.children, taskId, updates) }
    return task
  })
}

function toggleNode(task, taskId) {
  if (task.id === taskId) return { ...task, isExpanded: !task.isExpanded }
  if (!task.children?.length) return task
  return { ...task, children: task.children.map((child) => toggleNode(child, taskId)) }
}

const primaryButtonStyle = {
  padding: '6px 12px',
  background: '#2563eb',
  color: '#fff',
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
}

const treeToggleStyle = {
  width: 20,
  height: 20,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
}

const dateInputStyle = {
  border: '1px solid #e5e7eb',
  padding: '4px',
  borderRadius: 4,
  fontSize: 13,
}
