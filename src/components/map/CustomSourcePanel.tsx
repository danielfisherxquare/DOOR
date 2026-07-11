/**
 * 自定义图源配置面板
 * 支持添加、编辑、删除、导入、导出自定义瓦片图源
 */

import { useState, useEffect } from 'react';
import {
  listCustomSources,
  updateCustomSource,
  deleteCustomSource,
  toggleCustomSource,
  exportCustomSources,
  importCustomSources,
} from '../../utils/db/customSourceStore';
import type { CustomSource } from '../../utils/db/database';
import CustomTileSourceWizard from './CustomTileSourceWizard';

type Mode = 'list' | 'edit' | 'import';

const SOURCE_TYPES = [
  { value: 'xyz', label: 'XYZ' },
  { value: 'tms', label: 'TMS' },
  { value: 'wmts', label: 'WMTS' },
  { value: 'wms', label: 'WMS' },
];

interface SourceFormData {
  id: string;
  name: string;
  type: 'xyz' | 'wmts' | 'wms' | 'tms';
  urlTemplate: string;
  subdomains: string;
  projection: 'wgs84' | 'gcj02';
  minZoom: number;
  maxZoom: number;
  attribution: string;
}

const DEFAULT_FORM_DATA: SourceFormData = {
  id: '',
  name: '',
  type: 'xyz',
  urlTemplate: '',
  subdomains: '',
  projection: 'wgs84',
  minZoom: 1,
  maxZoom: 19,
  attribution: '',
};

export default function CustomSourcePanel() {
  const [mode, setMode] = useState<Mode>('list');
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [formData, setFormData] = useState<SourceFormData>(DEFAULT_FORM_DATA);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  // 加载图源列表
  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const list = await listCustomSources();
      setSources(list);
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      setLoading(false);
    }
  };

  // 重置表单
  const resetForm = () => {
    setFormData(DEFAULT_FORM_DATA);
    setEditingId(null);
    setError(null);
  };

  // 打开添加向导
  const handleAdd = () => {
    setShowWizard(true);
  };

  // 向导完成回调
  const handleWizardComplete = () => {
    setShowWizard(false);
    loadSources();
  };

  // 打开编辑模式
  const handleEdit = (source: CustomSource) => {
    setFormData({
      id: source.id,
      name: source.name,
      type: source.type,
      urlTemplate: source.urlTemplate,
      subdomains: source.subdomains || '',
      projection: source.projection,
      minZoom: source.minZoom,
      maxZoom: source.maxZoom,
      attribution: source.attribution || '',
    });
    setEditingId(source.id);
    setMode('edit');
  };

  // 保存图源（仅编辑模式）
  const handleSave = async () => {
    setError(null);

    if (!formData.name.trim()) {
      setError('请输入图源名称');
      return;
    }
    if (!formData.urlTemplate.trim()) {
      setError('请输入 URL 模板');
      return;
    }

    try {
      await updateCustomSource(editingId!, {
        name: formData.name,
        urlTemplate: formData.urlTemplate,
        subdomains: formData.subdomains || undefined,
        projection: formData.projection,
        minZoom: formData.minZoom,
        maxZoom: formData.maxZoom,
        attribution: formData.attribution || undefined,
      });

      await loadSources();
      setMode('list');
      resetForm();
    } catch (err) {
      console.error('Failed to save source:', err);
      setError('保存失败，请重试');
    }
  };

  // 删除图源
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此图源吗？')) return;

    try {
      await deleteCustomSource(id);
      await loadSources();
    } catch (err) {
      console.error('Failed to delete source:', err);
      alert('删除失败，请重试');
    }
  };

  // 切换启用状态
  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleCustomSource(id, enabled);
      await loadSources();
    } catch (err) {
      console.error('Failed to toggle source:', err);
    }
  };

  // 导出配置
  const handleExport = async () => {
    try {
      const json = await exportCustomSources();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `map-sources-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export sources:', err);
      alert('导出失败，请重试');
    }
  };

  // 打开导入模式
  const handleOpenImport = () => {
    setImportText('');
    setError(null);
    setMode('import');
  };

  // 导入配置
  const handleImport = async () => {
    setError(null);

    if (!importText.trim()) {
      setError('请粘贴配置内容');
      return;
    }

    try {
      const count = await importCustomSources(importText);
      await loadSources();
      setMode('list');
      alert(`成功导入 ${count} 个图源`);
    } catch (err) {
      console.error('Failed to import sources:', err);
      setError('导入失败，请检查配置格式');
    }
  };

  // 从文件导入
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportText(content);
    };
    reader.readAsText(file);
  };

  // 预览 URL
  const getPreviewUrl = (): string => {
    if (!formData.urlTemplate) return '';
    return formData.urlTemplate
      .replace('{x}', '0')
      .replace('{y}', '0')
      .replace('{z}', '1')
      .replace('{s}', formData.subdomains?.[0] || 'a');
  };

  if (loading) {
    return (
      <div className="custom-source-panel loading">
        <span>加载中...</span>
      </div>
    );
  }

  // 列表模式
  if (mode === 'list') {
    return (
      <>
        <div className="custom-source-panel">
          <div className="panel-header">
            <h3>自定义图源</h3>
            <div className="header-actions">
              <button className="secondary-btn" onClick={handleOpenImport}>
                导入
              </button>
              {sources.length > 0 && (
                <button className="secondary-btn" onClick={handleExport}>
                  导出
                </button>
              )}
              <button className="primary-btn" onClick={handleAdd}>
                添加图源
              </button>
            </div>
          </div>

          {sources.length === 0 ? (
            <div className="empty-state">
              <p>暂无自定义图源</p>
              <p className="hint">添加自定义瓦片图源以扩展地图底图选项</p>
            </div>
          ) : (
            <div className="source-list">
              {sources.map((source) => (
                <div key={source.id} className={`source-card ${source.enabled ? '' : 'disabled'}`}>
                  <div className="source-header">
                    <div className="source-title">
                      <span className="source-name">{source.name}</span>
                      <span className="source-id">{source.id}</span>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        onChange={(e) => handleToggle(source.id, e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                  <div className="source-details">
                    <span className="detail-item">
                      类型: {SOURCE_TYPES.find((t) => t.value === source.type)?.label}
                    </span>
                    <span className="detail-item">
                      层级: {source.minZoom} - {source.maxZoom}
                    </span>
                    <span className="detail-item">
                      坐标系: {source.projection.toUpperCase()}
                    </span>
                  </div>
                  <div className="source-url">{source.urlTemplate}</div>
                  <div className="source-actions">
                    <button className="edit-btn" onClick={() => handleEdit(source)}>
                      编辑
                    </button>
                    <button className="delete-btn" onClick={() => handleDelete(source.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 添加图源向导 */}
        {showWizard && (
          <CustomTileSourceWizard
            onClose={() => setShowWizard(false)}
            onComplete={handleWizardComplete}
          />
        )}
      </>
    );
  }

  // 编辑模式
  if (mode === 'edit') {
    return (
      <div className="custom-source-panel">
        <div className="panel-header">
          <h3>编辑图源</h3>
          <button className="back-btn" onClick={() => setMode('list')}>
            返回
          </button>
        </div>

        <div className="source-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label>图源 ID</label>
              <input
                type="text"
                value={formData.id}
                disabled
                className="disabled-input"
              />
            </div>
            <div className="form-group">
              <label>名称 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="显示名称"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>类型</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as SourceFormData['type'] })}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>坐标系</label>
              <select
                value={formData.projection}
                onChange={(e) => setFormData({ ...formData, projection: e.target.value as SourceFormData['projection'] })}
              >
                <option value="wgs84">WGS84 (GPS)</option>
                <option value="gcj02">GCJ02 (国测局)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>URL 模板 *</label>
            <input
              type="text"
              value={formData.urlTemplate}
              onChange={(e) => setFormData({ ...formData, urlTemplate: e.target.value })}
              placeholder="https://example.com/{z}/{x}/{y}.png"
            />
            <div className="hint">支持变量: {'{x}'} {'{y}'} {'{z}'} {'{s}'} {'{quadkey}'}</div>
          </div>

          <div className="form-group">
            <label>子域名</label>
            <input
              type="text"
              value={formData.subdomains}
              onChange={(e) => setFormData({ ...formData, subdomains: e.target.value })}
              placeholder="abc (对应 {s} 变量)"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>最小层级</label>
              <input
                type="number"
                value={formData.minZoom}
                onChange={(e) => setFormData({ ...formData, minZoom: parseInt(e.target.value) || 1 })}
                min={0}
                max={22}
              />
            </div>
            <div className="form-group">
              <label>最大层级</label>
              <input
                type="number"
                value={formData.maxZoom}
                onChange={(e) => setFormData({ ...formData, maxZoom: parseInt(e.target.value) || 19 })}
                min={formData.minZoom}
                max={22}
              />
            </div>
          </div>

          <div className="form-group">
            <label>版权声明</label>
            <input
              type="text"
              value={formData.attribution}
              onChange={(e) => setFormData({ ...formData, attribution: e.target.value })}
              placeholder="© Example"
            />
          </div>

          {formData.urlTemplate && (
            <div className="preview-section">
              <label>预览 URL</label>
              <div className="preview-url">{getPreviewUrl()}</div>
            </div>
          )}

          <div className="form-actions">
            <button className="cancel-btn" onClick={() => setMode('list')}>
              取消
            </button>
            <button className="save-btn" onClick={handleSave}>
              保存
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 导入模式
  return (
    <div className="custom-source-panel">
      <div className="panel-header">
        <h3>导入图源配置</h3>
        <button className="back-btn" onClick={() => setMode('list')}>
          返回
        </button>
      </div>

      <div className="import-form">
        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label>选择文件</label>
          <input type="file" accept=".json" onChange={handleFileImport} />
        </div>

        <div className="form-group">
          <label>或粘贴配置内容</label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"version": 1, "customSources": [...]}'
            rows={10}
          />
        </div>

        <div className="form-actions">
          <button className="cancel-btn" onClick={() => setMode('list')}>
            取消
          </button>
          <button className="import-btn" onClick={handleImport} disabled={!importText.trim()}>
            导入
          </button>
        </div>
      </div>
    </div>
  );
}
