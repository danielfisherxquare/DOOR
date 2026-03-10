import React, { useState, useEffect } from 'react';
import projectsApi from '../../../api/projects';

export default function TaskEditModal({ task, projectId, onClose, onSaveSuccess }) {
    const [payload, setPayload] = useState({
        title: '',
        status: 'TODO',
        start_date: '',
        end_date: '',
        responsible_group: '',
        is_milestone: false,
        notes: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (task) {
            setPayload({
                title: task.title || '',
                status: task.status || 'TODO',
                start_date: task.start_date ? task.start_date.substring(0, 10) : '',
                end_date: task.end_date ? task.end_date.substring(0, 10) : '',
                responsible_group: task.responsible_group || '',
                is_milestone: task.is_milestone || false,
                notes: task.notes || ''
            });
        }
    }, [task]);

    const handleSave = async () => {
        if (!payload.title) return alert('标题不可为空');
        if (payload.start_date && payload.end_date) {
            if (new Date(payload.start_date) > new Date(payload.end_date)) {
                return alert('开始日期不能晚于结束日期');
            }
        }

        setSaving(true);
        try {
            const dataToSubmit = { ...payload };
            if (!dataToSubmit.start_date) dataToSubmit.start_date = null;
            if (!dataToSubmit.end_date) dataToSubmit.end_date = null;

            const res = await projectsApi.updateTask(projectId, task.id, dataToSubmit);
            if (res.success) {
                onSaveSuccess();
            } else {
                alert('保存失败: ' + (res.message || '未知错误'));
            }
        } catch (err) {
            console.error(err);
            alert('网络错误');
        } finally {
            setSaving(false);
        }
    };

    if (!task) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="neu-card" style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400, maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>编辑任务细节</h3>

                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>任务名称 *</label>
                    <input className="input" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} value={payload.title} onChange={e => setPayload({ ...payload, title: e.target.value })} />
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>状态</label>
                        <select className="input" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} value={payload.status} onChange={e => setPayload({ ...payload, status: e.target.value })}>
                            <option value="TODO">待办</option>
                            <option value="IN_PROGRESS">进行中</option>
                            <option value="DONE">已完成</option>
                            <option value="CANCELLED">已取消</option>
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>责任组</label>
                        <input className="input" placeholder="例如：设计组" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} value={payload.responsible_group} onChange={e => setPayload({ ...payload, responsible_group: e.target.value })} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>开始日期</label>
                        <input className="input" type="date" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} value={payload.start_date} onChange={e => setPayload({ ...payload, start_date: e.target.value })} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>结束日期</label>
                        <input className="input" type="date" style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }} value={payload.end_date} onChange={e => setPayload({ ...payload, end_date: e.target.value })} />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button className="btn" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>取消</button>
                    <button className="btn btn--primary" onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{saving ? '保存中...' : '保存修改'}</button>
                </div>
            </div>
        </div>
    );
}
