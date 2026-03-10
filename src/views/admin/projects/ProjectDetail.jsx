import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import TreeGrid from '../../../components/projects/TreeGrid';
import racesApi from '../../../api/races';
import projectsApi from '../../../api/projects';

export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [saving, setSaving] = useState(false);
    const [availableRaces, setAvailableRaces] = useState([]);

    useEffect(() => {
        if (id !== 'new') {
            projectsApi.getById(id)
                .then(data => {
                    if (data.success) setProject(data.data);
                });
        } else {
            setProject({ name: '', description: '', race_id: '' });
        }

        racesApi.getAll().then(res => {
            if (res.success) {
                setAvailableRaces(res.data || []);
            }
        }).catch(err => console.error('Failed to load races', err));
    }, [id]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = id === 'new'
                ? await projectsApi.create(project)
                : await projectsApi.update(id, project);

            if (data.success) {
                if (id === 'new') {
                    navigate(`/admin/projects/${data.data.id}`);
                }
            } else {
                alert('保存失败: ' + (data.message || data.error || '未知错误'));
            }
        } catch (err) {
            console.error(err);
            alert('保存出错');
        } finally {
            setSaving(false);
        }
    };

    if (!project) return <div>加载中...</div>;

    return (
        <div className="admin-page">
            <div className="admin-page__header" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
                <button onClick={() => navigate('/admin/projects')} className="btn btn--ghost" style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>&larr; 返回</button>
                <h2 style={{ fontSize: 24, margin: 0 }}>{id === 'new' ? '新建项目' : '编辑项目: ' + project.name}</h2>
            </div>

            <div className="neu-card" style={{ padding: 24, marginBottom: 24, background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#374151' }}>项目名称</label>
                    <input
                        className="input"
                        value={project.name}
                        onChange={e => setProject({ ...project, name: e.target.value })}
                        style={{ width: '100%', maxWidth: 400, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                        placeholder="例如：2026春季马拉松筹备"
                    />
                </div>
                <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#374151' }}>关联赛事 (选填)</label>
                    <select
                        className="input"
                        value={project.race_id || ''}
                        onChange={e => setProject({ ...project, race_id: e.target.value })}
                        style={{ width: '100%', maxWidth: 400, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                    >
                        <option value="">-- 请选择关联赛事 --</option>
                        {availableRaces.map(race => (
                            <option key={race.id} value={race.id}>{race.name}</option>
                        ))}
                    </select>
                </div>

                <button
                    className="btn btn--primary"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
                >
                    {saving ? '保存中...' : '保存项目信息'}
                </button>
            </div>

            {id !== 'new' && (
                <div className="neu-card" style={{ padding: 24, background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ fontSize: 18, marginBottom: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 12 }}>任务管理 (OmniOutliner / Gantt)</h3>
                    <TreeGrid projectId={id} />
                </div>
            )}
        </div>
    );
}
