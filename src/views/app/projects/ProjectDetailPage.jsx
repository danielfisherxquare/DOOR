import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import GanttView from '../../../components/projects/GanttView';
import TreeGrid from '../../../components/projects/TreeGrid';
import { AppH5Notice, AppH5Panel, AppH5Surface, AppH5Tabs } from '../../../components/app/AppH5Surface';
import racesApi from '../../../api/races';
import projectsApi from '../../../api/projects';
import useAuthStore from '../../../stores/authStore';
import './project-detail-page.css';

export default function ProjectDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const user = useAuthStore((state) => state.user);
    const [project, setProject] = useState(null);
    const [saving, setSaving] = useState(false);
    const [availableRaces, setAvailableRaces] = useState([]);
    const [viewMode, setViewMode] = useState('list');
    const requestedOrgId = searchParams.get('orgId');
    const userOrgId = user?.orgId || user?.org?.id || '';

    useEffect(() => {
        if (id !== 'new') {
            projectsApi.getById(id)
                .then((data) => {
                    if (data.success) setProject(data.data);
                });
        } else {
            setProject({
                name: '',
                description: '',
                race_id: '',
                org_id: requestedOrgId || userOrgId,
            });
        }

        racesApi.getAll().then((res) => {
            if (res.success) {
                setAvailableRaces(res.data || []);
            }
        }).catch((err) => console.error('Failed to load races', err));
    }, [id, requestedOrgId, userOrgId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                ...project,
                org_id: project.org_id || requestedOrgId || userOrgId || null,
            };
            const data = id === 'new'
                ? await projectsApi.create(payload)
                : await projectsApi.update(id, payload);

            if (data.success) {
                if (id === 'new') {
                    navigate(`/app/projects/${data.data.id}`);
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

    if (!project) {
        return (
            <AppH5Surface
                className="project-detail-page"
                eyebrow="项目计划"
                title="项目计划"
                summary="正在加载项目基本信息、赛事上下文和任务排期。"
            >
                <AppH5Notice tone="info">加载中...</AppH5Notice>
            </AppH5Surface>
        );
    }

    const pageTitle = id === 'new' ? '新建项目' : `编辑项目：${project.name}`;
    const viewTabs = [
        {
            key: 'list',
            label: '列表视图',
            icon: 'view_list',
            active: viewMode === 'list',
            onClick: () => setViewMode('list'),
        },
        {
            key: 'gantt',
            label: '甘特图',
            icon: 'timeline',
            active: viewMode === 'gantt',
            onClick: () => setViewMode('gantt'),
        },
    ];

    return (
        <AppH5Surface
            className="project-detail-page"
            eyebrow="项目计划"
            title={pageTitle}
            summary="维护项目基本信息、赛事上下文和任务排期。"
            actions={(
                <button type="button" onClick={() => navigate('/app/projects')} className="btn btn--ghost">
                    返回
                </button>
            )}
        >
            <AppH5Panel
                title="项目信息"
                summary="项目名称和赛事归属会影响后续任务、阶段和现场执行入口。"
                footer={(
                    <button
                        type="button"
                        className="btn btn--primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? '保存中...' : '保存项目信息'}
                    </button>
                )}
            >
                <div className="project-detail-form">
                    <label className="project-detail-field">
                        <span className="project-detail-field__label">项目名称</span>
                        <input
                            className="input project-detail-field__control"
                            value={project.name}
                            onChange={(event) => setProject({ ...project, name: event.target.value })}
                            placeholder="例如：2026春季马拉松筹备"
                        />
                    </label>

                    <label className="project-detail-field">
                        <span className="project-detail-field__label">关联赛事（选填）</span>
                        <select
                            className="input project-detail-field__control"
                            value={project.race_id || ''}
                            onChange={(event) => setProject({ ...project, race_id: event.target.value })}
                        >
                            <option value="">请选择关联赛事</option>
                            {availableRaces.map((race) => (
                                <option key={race.id} value={race.id}>{race.name}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </AppH5Panel>

            {id !== 'new' ? (
                <AppH5Panel
                    title="任务管理"
                    summary="在列表和甘特视图之间切换，继续维护项目阶段与排期。"
                    actions={<AppH5Tabs items={viewTabs} ariaLabel="任务视图" />}
                >
                    <div className="project-detail-task-frame">
                        {viewMode === 'list' ? <TreeGrid projectId={id} /> : <GanttView projectId={id} />}
                    </div>
                </AppH5Panel>
            ) : null}
        </AppH5Surface>
    );
}
