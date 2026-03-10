import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import projectsApi from '../../../api/projects';

export default function ProjectListPage() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        projectsApi.getAll()
            .then(data => {
                if (data.success) setProjects(data.data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load projects:', err);
                setLoading(false);
            });
    }, []);

    return (
        <div className="admin-page">
            <div className="admin-page__header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ fontSize: 24, fontWeight: 600 }}>项目计划管理</h2>
                <Link to="/admin/projects/new" className="btn btn--primary" style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: 6, textDecoration: 'none' }}>新建项目</Link>
            </div>

            {loading ? <p>加载中...</p> : (
                <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <thead style={{ background: '#f9fafb' }}>
                        <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151' }}>项目名称</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151' }}>关联赛事ID</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: 120 }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.length === 0 ? (
                            <tr><td colSpan="3" style={{ padding: '24px 16px', textAlign: 'center', color: '#6b7280' }}>暂无项目计划</td></tr>
                        ) : projects.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '12px 16px', color: '#111827' }}>{p.name}</td>
                                <td style={{ padding: '12px 16px', color: '#6b7280' }}>{p.race_id || '-'}</td>
                                <td style={{ padding: '12px 16px' }}>
                                    <Link to={`/admin/projects/${p.id}`} className="btn btn--ghost btn--sm" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>编辑计划</Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
