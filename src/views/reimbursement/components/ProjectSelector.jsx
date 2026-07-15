/**
 * Project Selector
 * 项目选择器组件
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useReimbursementStore from '../../../stores/reimbursementStore';

function ProjectSelector({ showCreate = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    projects,
    activeProjectId,
    createProject,
    switchProject,
    isLoading,
  } = useReimbursementStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShortName, setNewShortName] = useState('');
  const canSwitchProjects = projects.length > 0;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject(newName.trim(), newShortName.trim() || null);
    setNewName('');
    setNewShortName('');
    setIsCreating(false);
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  if (showCreate && projects.length === 0 && !isCreating) {
    return (
      <div className="project-selector--empty">
        <p>您还没有创建任何项目</p>
        <button
          className="btn btn--primary"
          onClick={() => setIsCreating(true)}
        >
          创建第一个项目
        </button>
      </div>
    );
  }

  if (isCreating) {
    return (
      <div className="project-selector--create">
        <div className="project-selector--create__header">
          <strong>创建报销项目</strong>
          <span>创建后会自动切换到新项目，随后就能继续导入与识别。</span>
        </div>

        <label className="project-selector--create__field">
          <span className="project-selector--create__label">项目名称</span>
          <input
            type="text"
            className="input"
            placeholder="例如：2026 上海差旅报销"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </label>

        <label className="project-selector--create__field">
          <span className="project-selector--create__label-row">
            <span className="project-selector--create__label">项目简称</span>
            <span className="project-selector--create__hint">{newShortName.length}/20</span>
          </span>
          <input
            type="text"
            className="input"
            placeholder="用于导出文件命名，可留空"
            value={newShortName}
            onChange={(e) => setNewShortName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            maxLength={20}
          />
        </label>

        <div className="project-selector--create__footer">
          <p className="project-selector--create__tip">
            项目简称会用于导出文件和附件命名，建议填写 2-8 个易识别字词。
          </p>
        </div>

        <div className="project-selector--create__actions">
          <button
            className="btn btn--primary"
            onClick={handleCreate}
            disabled={!newName.trim() || isLoading}
          >
            {isLoading ? '创建中...' : '创建项目'}
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              setIsCreating(false);
              setNewName('');
              setNewShortName('');
            }}
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="project-selector">
      <select
        className="project-selector__select"
        value={activeProjectId || ''}
        onChange={(e) => {
          const nextProjectId = e.target.value;
          if (!nextProjectId || nextProjectId === activeProjectId) return;
          switchProject(nextProjectId);
        }}
        disabled={!canSwitchProjects}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
            {project.short_name && ` (${project.short_name})`}
            {project.status === 'archived' && ' (已归档)'}
          </option>
        ))}
      </select>

      <button
        className="btn btn--ghost btn--sm"
        onClick={() => setIsCreating(true)}
        title="创建新项目"
      >
        +
      </button>

      <button
        className="btn btn--ghost btn--sm"
        onClick={() => navigate({ pathname: '/app/reimbursements/projects', search: location.search })}
        title="项目管理"
      >
        管理
      </button>

      {activeProject && (
        <div className="project-selector__stats">
          <span className="badge">{Number(activeProject.record_count || 0)} 条记录</span>
          {Number(activeProject.total_expense || 0) > 0 && (
            <span className="badge badge--expense">
              支出 ¥{Number(activeProject.total_expense).toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ProjectSelector;
