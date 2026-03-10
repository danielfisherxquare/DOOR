import React, { useState, useEffect, useCallback } from 'react';

const emptyTask = (projectId, parentId = null) => ({
    title: '',
    status: 'TODO',
    start_date: '',
    end_date: '',
    is_milestone: false,
    notes: '',
    project_id: projectId,
    parent_id: parentId,
    sort_order: 0
});

export default function TreeGrid({ projectId }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchTasks = useCallback(async () => {
        try {
            const res = await fetch(`/api/projects/${projectId}/tasks`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setTasks(buildTree(data.data));
            }
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const buildTree = (flatList) => {
        const map = {};
        const roots = [];
        flatList.forEach(t => { map[t.id] = { ...t, children: [], isExpanded: true }; });
        flatList.forEach(t => {
            if (t.parent_id && map[t.parent_id]) {
                map[t.parent_id].children.push(map[t.id]);
            } else {
                roots.push(map[t.id]);
            }
        });
        return roots;
    };

    const handleCreateTask = async (parentId = null) => {
        try {
            const res = await fetch(`/api/projects/${projectId}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...emptyTask(projectId, parentId), title: '新任务' }),
                credentials: 'include'
            });
            if (res.ok) {
                fetchTasks();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpdateTask = async (taskId, updates) => {
        try {
            await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
                credentials: 'include'
            });
            // Optmistic update
            const updateNode = (list) => {
                return list.map(t => {
                    if (t.id === taskId) return { ...t, ...updates };
                    if (t.children) return { ...t, children: updateNode(t.children) };
                    return t;
                });
            };
            setTasks(updateNode(tasks));
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm('确定要删除此任务及其子任务吗？')) return;
        try {
            const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (res.ok) fetchTasks();
        } catch (err) {
            console.error(err);
        }
    };

    const toggleExpand = (taskId) => {
        const toggleNode = (list) => {
            return list.map(t => {
                if (t.id === taskId) return { ...t, isExpanded: !t.isExpanded };
                if (t.children) return { ...t, children: toggleNode(t.children) };
                return t;
            });
        };
        setTasks(toggleNode(tasks));
    };

    // Render row mapping
    const flattenNodes = (nodes, depth = 0) => {
        let result = [];
        nodes.forEach(node => {
            result.push({ ...node, depth });
            if (node.isExpanded && node.children && node.children.length > 0) {
                result = result.concat(flattenNodes(node.children, depth + 1));
            }
        });
        return result;
    };

    const visibleRows = flattenNodes(tasks);

    // Calculate project start and end dates for Gantt
    let projectStart = null;
    let projectEnd = null;

    visibleRows.forEach(r => {
        if (r.start_date) {
            const start = new Date(r.start_date).getTime();
            if (!projectStart || start < projectStart) projectStart = start;
        }
        if (r.end_date) {
            const end = new Date(r.end_date).getTime();
            if (!projectEnd || end > projectEnd) projectEnd = end;
        }
    });

    // Expand duration slightly to show edges
    projectStart = projectStart ? projectStart - 86400000 : null;
    projectEnd = projectEnd ? projectEnd + 86400000 : null;
    const totalDuration = projectStart && projectEnd ? Math.max(86400000 * 2, projectEnd - projectStart) : 0;

    if (loading) return <div style={{ padding: 20 }}>加载任务中...</div>;

    return (
        <div style={{ padding: 20, background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, margin: 0, color: '#374151' }}>任务列表</h3>
                <button onClick={() => handleCreateTask()} className="btn btn--primary" style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', borderRadius: 4, border: 'none', cursor: 'pointer' }}>+ 根任务</button>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: '1000px', width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                    <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '12px', width: '30%' }}>任务名称</th>
                            <th style={{ padding: '12px', width: '10%' }}>状态</th>
                            <th style={{ padding: '12px', width: '12%' }}>开始日期</th>
                            <th style={{ padding: '12px', width: '12%' }}>结束日期</th>
                            <th style={{ padding: '12px', width: '5%', textAlign: 'center' }}>里程碑</th>
                            <th style={{ padding: '12px', width: '20%' }}>时间轴 (Gantt)</th>
                            <th style={{ padding: '12px', width: '11%', textAlign: 'right' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.length === 0 ? (
                            <tr><td colSpan="6" style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>暂无任务</td></tr>
                        ) : visibleRows.map((row) => (
                            <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
                                    <div style={{ width: row.depth * 20, flexShrink: 0 }}></div>
                                    <button
                                        onClick={() => toggleExpand(row.id)}
                                        style={{ width: 20, height: 20, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                    >
                                        {row.children?.length > 0 ? (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: row.isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>
                                                <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                        ) : <span style={{ width: 12 }}></span>}
                                    </button>
                                    <input
                                        value={row.title}
                                        onChange={(e) => handleUpdateTask(row.id, { title: e.target.value })}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontWeight: row.depth === 0 ? 600 : 400 }}
                                        placeholder="输入任务名称"
                                    />
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                    <select
                                        value={row.status}
                                        onChange={(e) => handleUpdateTask(row.id, { status: e.target.value })}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', color: row.status === 'DONE' ? '#10b981' : row.status === 'IN_PROGRESS' ? '#3b82f6' : '#6b7280' }}
                                    >
                                        <option value="TODO">待办</option>
                                        <option value="IN_PROGRESS">进行中</option>
                                        <option value="DONE">已完成</option>
                                        <option value="CANCELLED">已取消</option>
                                    </select>
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                    <input
                                        type="date"
                                        value={row.start_date ? row.start_date.substring(0, 10) : ''}
                                        onChange={(e) => handleUpdateTask(row.id, { start_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                        style={{ border: '1px solid #e5e7eb', padding: '4px', borderRadius: 4, fontSize: 13 }}
                                    />
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                    <input
                                        type="date"
                                        value={row.end_date ? row.end_date.substring(0, 10) : ''}
                                        onChange={(e) => handleUpdateTask(row.id, { end_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                        style={{ border: '1px solid #e5e7eb', padding: '4px', borderRadius: 4, fontSize: 13 }}
                                    />
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={row.is_milestone}
                                        onChange={(e) => handleUpdateTask(row.id, { is_milestone: e.target.checked })}
                                    />
                                </td>
                                <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                                    {totalDuration > 0 && row.start_date && row.end_date && (() => {
                                        const start = new Date(row.start_date).getTime();
                                        const end = Math.max(start, new Date(row.end_date).getTime());
                                        const leftPercent = ((start - projectStart) / totalDuration) * 100;
                                        let widthPercent = ((end - start) / totalDuration) * 100;
                                        if (widthPercent < 2) widthPercent = 2;
                                        return (
                                            <div style={{ position: 'relative', width: '100%', height: 16, background: '#f3f4f6', borderRadius: 8, overflow: 'hidden' }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    left: `${leftPercent}%`,
                                                    width: `${widthPercent}%`,
                                                    height: '100%',
                                                    background: row.status === 'DONE' ? '#10b981' : row.status === 'IN_PROGRESS' ? '#3b82f6' : '#9ca3af',
                                                    borderRadius: 8
                                                }} title={`${row.start_date.substring(0, 10)} 至 ${row.end_date.substring(0, 10)}`} />
                                            </div>
                                        );
                                    })()}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                    <button onClick={() => handleCreateTask(row.id)} title="添加子任务" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#10b981', marginRight: 8, fontSize: 16 }}>+</button>
                                    <button onClick={() => handleDeleteTask(row.id)} title="删除" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>&times;</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
