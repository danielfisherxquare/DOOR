import React, { useState, useEffect, useCallback, useMemo } from 'react';
import projectsApi from '../../../api/projects';
import TaskEditModal from './TaskEditModal';

export default function GanttView({ projectId }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [zoomScale, setZoomScale] = useState('Day');
    const [editingTask, setEditingTask] = useState(null);

    const fetchTasks = useCallback(async () => {
        try {
            const data = await projectsApi.getTasks(projectId);
            if (data.success) {
                // sort by sort_order
                const sorted = data.data.sort((a, b) => a.sort_order - b.sort_order);
                setTasks(sorted);
            }
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Timeline calculation
    const timelineData = useMemo(() => {
        if (!tasks.length) return { start: new Date(), end: new Date(), columns: [] };

        let start = null;
        let end = null;

        tasks.forEach(t => {
            if (t.start_date) {
                const s = new Date(t.start_date).getTime();
                if (!start || s < start) start = s;
            }
            if (t.end_date) {
                const e = new Date(t.end_date).getTime();
                if (!end || e > end) end = e;
            }
        });

        // Add padding
        start = start ? new Date(start - 86400000 * 3) : new Date(); // 3 days before
        end = end ? new Date(end + 86400000 * 7) : new Date(start.getTime() + 86400000 * 30); // 7 days after or 1 month default

        const columns = [];
        let curr = new Date(start);
        curr.setHours(0, 0, 0, 0);

        while (curr <= end) {
            columns.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        return { start, end, columns };
    }, [tasks]);

    // Helper: calculate start/span for CSS Grid
    const calculateTaskSpan = (task) => {
        if (!task.start_date) return null;

        const taskStart = new Date(task.start_date);
        taskStart.setHours(0, 0, 0, 0);

        const taskEnd = task.end_date ? new Date(task.end_date) : new Date(taskStart);
        taskEnd.setHours(0, 0, 0, 0);

        let startIdx = 1;
        let endIdx = 1;

        if (zoomScale === 'Day') {
            startIdx = timelineData.columns.findIndex(c => c.getTime() === taskStart.getTime());
            endIdx = timelineData.columns.findIndex(c => c.getTime() === taskEnd.getTime());
            if (startIdx === -1) startIdx = 0;
            if (endIdx === -1) endIdx = timelineData.columns.length - 1;

            return {
                gridColumnStart: startIdx + 1,
                gridColumnEnd: endIdx + 2 // +2 because grid lines are 1-indexed and include the end
            };
        } else if (zoomScale === 'Week') {
            // week chunking math
            // To be precise with CSS Grid, week scale means 1 column = 1 week block. 
            // We need week headers and convert day columns to week ranges.
            // Simplified for now: just fallback to day-rendering visually grouped, 
            // but the plan says native css grid for Day/Week/Month. Let's do a simplified approach.
            return null; // fallback below
        }

        return null; // month fallback
    };

    // Derived timeline columns based on scale
    const displayColumns = useMemo(() => {
        if (zoomScale === 'Day') {
            return timelineData.columns.map(d => ({
                id: d.getTime(), label: d.getDate(), subLabel: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
            }));
        } else if (zoomScale === 'Week') {
            // Group by Weeks (roughly starting on Monday)
            const weeks = [];
            let currWeekStart = null;
            timelineData.columns.forEach(d => {
                const day = d.getDay();
                if (day === 1 || !currWeekStart) {
                    currWeekStart = [new Date(d)];
                    weeks.push({
                        id: d.getTime(),
                        label: `周${weeks.length + 1}`,
                        subLabel: `${d.getMonth() + 1}/${d.getDate()}`,
                        dates: currWeekStart
                    });
                } else {
                    currWeekStart.push(new Date(d));
                }
            });
            return weeks;
        } else {
            // Month
            const months = [];
            let currMonthNum = null;
            timelineData.columns.forEach(d => {
                if (d.getMonth() !== currMonthNum) {
                    currMonthNum = d.getMonth();
                    months.push({
                        id: d.getTime(),
                        label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
                        dates: [new Date(d)]
                    });
                } else {
                    months[months.length - 1].dates.push(new Date(d));
                }
            });
            return months;
        }
    }, [timelineData.columns, zoomScale]);

    // calculate spans for Week/Month scale
    const getScaleSpan = (task) => {
        if (!task.start_date) return null;
        const sTime = new Date(task.start_date).getTime();
        const eTime = task.end_date ? new Date(task.end_date).getTime() : sTime;

        let startIdx = 0;
        let endIdx = 0;

        for (let i = 0; i < displayColumns.length; i++) {
            const colDates = displayColumns[i].dates || [new Date(displayColumns[i].id)];
            const colStart = colDates[0].getTime();
            const colEnd = colDates[colDates.length - 1].getTime() + 86399999;

            if (sTime >= colStart && sTime <= colEnd) startIdx = i;
            if (sTime < colStart && startIdx === 0 && i === 0) startIdx = i; // clamp left

            if (eTime >= colStart && eTime <= colEnd) endIdx = i;
            if (eTime > colEnd) endIdx = i; // expand right as we iterate
        }

        return {
            gridColumnStart: startIdx + 1,
            gridColumnEnd: endIdx + 2
        };
    };

    if (loading) return <div style={{ padding: 20 }}>加载甘特图中...</div>;

    return (
        <div style={{ padding: 20, background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, margin: 0, color: '#374151' }}>项目时间轴</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    {['Day', 'Week', 'Month'].map(scale => (
                        <button
                            key={scale}
                            onClick={() => setZoomScale(scale)}
                            style={{
                                padding: '4px 12px',
                                borderRadius: 4,
                                border: '1px solid #d1d5db',
                                background: zoomScale === scale ? '#e5e7eb' : '#fff',
                                color: '#374151',
                                cursor: 'pointer',
                                fontSize: 12
                            }}
                        >
                            {scale === 'Day' ? '日' : scale === 'Week' ? '周' : '月'}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `minmax(200px, max-content) minmax(100px, max-content) repeat(${displayColumns.length}, minmax(${zoomScale === 'Day' ? '40px' : zoomScale === 'Week' ? '80px' : '120px'}, 1fr))`,
                    minWidth: '100%'
                }}>
                    {/* Header Row */}
                    <div style={{ padding: '12px 16px', fontWeight: 'bold', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', position: 'sticky', left: 0, zIndex: 10 }}>任务名称</div>
                    <div style={{ padding: '12px 16px', fontWeight: 'bold', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', position: 'sticky', left: 200, zIndex: 10 }}>责任组</div>

                    {displayColumns.map((col, idx) => (
                        <div key={idx} style={{ padding: '8px 4px', textAlign: 'center', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
                            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#111827' }}>{col.label}</div>
                            {col.subLabel && <div style={{ fontSize: 11, color: '#6b7280' }}>{col.subLabel}</div>}
                        </div>
                    ))}

                    {/* Task Rows */}
                    {tasks.map((task) => {
                        const spanState = zoomScale === 'Day' ? calculateTaskSpan(task) : getScaleSpan(task);
                        return (
                            <React.Fragment key={task.id}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', borderRight: '1px solid #e5e7eb', position: 'sticky', left: 0, background: '#fff', zIndex: 5, fontSize: 14, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={task.title}>
                                    {task.title}
                                </div>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', borderRight: '1px solid #e5e7eb', position: 'sticky', left: 200, background: '#fff', zIndex: 5, fontSize: 13, color: '#6b7280' }} title={task.responsible_group || '-'}>
                                    {task.responsible_group || '-'}
                                </div>

                                {/* Grid body track */}
                                <div style={{ gridColumn: `3 / -1`, background: '#fff', borderBottom: '1px solid #f3f4f6', position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${displayColumns.length}, 1fr)` }}>
                                    {displayColumns.map((_, i) => (
                                        <div key={i} style={{ borderRight: '1px dashed #f3f4f6', height: '100%' }}></div>
                                    ))}

                                    {spanState && (
                                        <div
                                            onClick={() => setEditingTask(task)}
                                            style={{
                                                position: 'absolute',
                                                top: 6, bottom: 6,
                                                left: `calc(${(spanState.gridColumnStart - 1) / displayColumns.length * 100}%)`,
                                                width: `calc(${(spanState.gridColumnEnd - spanState.gridColumnStart) / displayColumns.length * 100}%)`,
                                                background: task.status === 'DONE' ? '#10b981' : task.status === 'IN_PROGRESS' ? '#3b82f6' : '#6b7280',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                                transition: 'opacity 0.2s',
                                                display: 'flex', alignItems: 'center', padding: '0 8px', color: '#fff', fontSize: 11,
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = 0.8}
                                            onMouseLeave={e => e.currentTarget.style.opacity = 1}
                                        >
                                            {task.title}
                                        </div>
                                    )}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {editingTask && (
                <TaskEditModal
                    task={editingTask}
                    projectId={projectId}
                    onClose={() => setEditingTask(null)}
                    onSaveSuccess={() => {
                        setEditingTask(null);
                        fetchTasks();
                    }}
                />
            )}
        </div>
    );
}
