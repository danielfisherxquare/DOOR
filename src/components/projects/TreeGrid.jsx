import { useCallback, useEffect, useState } from 'react'
import projectsApi from '../../api/projects'
import TaskEditModal from './TaskEditModal'
import './projects-components.css'

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

  if (loading) return <div className="tree-grid-loading">加载任务中...</div>

  return (
    <div className="tree-grid-container">
      <div className="tree-grid-header">
        <h3 className="tree-grid-title">任务列表</h3>
        <button onClick={() => void handleCreateTask()} className="tree-grid-add-btn">+ 根任务</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tree-grid-table">
          <thead>
            <tr className="tree-grid-header-row">
              <th className="tree-grid-header-cell" style={{ width: '28%' }}>任务名称</th>
              <th className="tree-grid-header-cell" style={{ width: '10%' }}>状态</th>
              <th className="tree-grid-header-cell" style={{ width: '18%' }}>负责人</th>
              <th className="tree-grid-header-cell" style={{ width: '12%' }}>开始日期</th>
              <th className="tree-grid-header-cell" style={{ width: '12%' }}>结束日期</th>
              <th className="tree-grid-header-cell" style={{ width: '8%', textAlign: 'center' }}>里程碑</th>
              <th className="tree-grid-header-cell" style={{ width: '12%', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={7} className="tree-grid-cell tree-empty-cell">暂无任务</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.id} className="tree-grid-row">
                <td className="tree-grid-cell tree-grid-cell--name">
                  <div className="tree-grid-indent" style={{ width: row.depth * 20 }} />
                  <button onClick={() => toggleExpand(row.id)} className="tree-toggle-btn">
                    {row.children?.length > 0 ? (
                      <svg className="tree-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: row.isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    ) : <span style={{ width: 12 }} />}
                  </button>
                  <input className={`tree-input ${row.depth === 0 ? 'tree-input--root' : 'tree-input--nested'}`} value={row.title} onChange={(event) => void handleUpdateTask(row.id, { title: event.target.value })} placeholder="输入任务名称" />
                </td>
                <td className="tree-grid-cell">
                  <select className="tree-select" value={row.status} onChange={(event) => void handleUpdateTask(row.id, { status: event.target.value })}>
                    <option value="TODO">待办</option>
                    <option value="IN_PROGRESS">进行中</option>
                    <option value="DONE">已完成</option>
                    <option value="CANCELLED">已取消</option>
                  </select>
                </td>
                <td className="tree-grid-cell">
                  <button className="tree-btn--ghost" onClick={() => setEditingTask(row)}>
                    {row.assignee_summary || row.responsible_group || '设置负责人'}
                  </button>
                </td>
                <td className="tree-grid-cell">
                  <input type="date" className="tree-date-input" value={row.start_date ? row.start_date.substring(0, 10) : ''} onChange={(event) => void handleUpdateTask(row.id, { start_date: event.target.value ? new Date(event.target.value).toISOString() : null })} />
                </td>
                <td className="tree-grid-cell">
                  <input type="date" className="tree-date-input" value={row.end_date ? row.end_date.substring(0, 10) : ''} onChange={(event) => void handleUpdateTask(row.id, { end_date: event.target.value ? new Date(event.target.value).toISOString() : null })} />
                </td>
                <td className="tree-grid-cell" style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={row.is_milestone} onChange={(event) => void handleUpdateTask(row.id, { is_milestone: event.target.checked })} />
                </td>
                <td className="tree-grid-cell" style={{ textAlign: 'right' }}>
                  <button className="tree-action-btn--add" onClick={() => void handleCreateTask(row.id)} title="添加子任务">+</button>
                  <button className="tree-action-btn--edit" onClick={() => setEditingTask(row)} title="编辑">编辑</button>
                  <button className="tree-action-btn--delete" onClick={() => void handleDeleteTask(row.id)} title="删除">&times;</button>
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

// 样式已迁移到 projects-components.css
