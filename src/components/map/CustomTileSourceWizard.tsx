/**
 * CustomTileSourceWizard.tsx
 * 自定义图源添加向导
 * 4步流程：类型选择 → 基本信息 → 高级参数 → 预览保存
 */

import React, { useState, useCallback } from 'react';
import { createCustomSource, hasCustomSource } from '../../utils/db/customSourceStore';
import { CommandPanel, CommandStepRail } from '../command/CommandPrimitives';
import './CustomTileSourceWizard.css';

type TileSourceType = 'xyz' | 'wmts' | 'wms' | 'tms';
type ProjectionType = 'wgs84' | 'gcj02';

interface WizardState {
  step: number;
  type: TileSourceType;
  id: string;
  name: string;
  urlTemplate: string;
  subdomains: string;
  projection: ProjectionType;
  minZoom: number;
  maxZoom: number;
  attribution: string;
  icon: string;
  // WMS/WMTS specific
  layerName: string;
  styleName: string;
  tileMatrixSet: string;
  format: string;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  type: 'xyz',
  id: '',
  name: '',
  urlTemplate: '',
  subdomains: '',
  projection: 'wgs84',
  minZoom: 1,
  maxZoom: 19,
  attribution: '',
  icon: '🗺️',
  layerName: '',
  styleName: '',
  tileMatrixSet: '',
  format: 'image/png',
};

const TYPE_OPTIONS: { value: TileSourceType; label: string; description: string; icon: string }[] = [
  {
    value: 'xyz',
    label: 'XYZ Tiles',
    description: '标准 XYZ 瓦片服务，如 OSM、CartoDB',
    icon: '🧩',
  },
  {
    value: 'tms',
    label: 'TMS',
    description: 'Tile Map Service，Y轴翻转的 XYZ',
    icon: '🔄',
  },
  {
    value: 'wmts',
    label: 'WMTS',
    description: 'Web Map Tile Service，OGC 标准',
    icon: '🌐',
  },
  {
    value: 'wms',
    label: 'WMS',
    description: 'Web Map Service，动态地图服务',
    icon: '📊',
  },
];

const PROJECTION_OPTIONS: { value: ProjectionType; label: string }[] = [
  { value: 'wgs84', label: 'WGS84 (GPS坐标)' },
  { value: 'gcj02', label: 'GCJ02 (国测局坐标)' },
];

const FORMAT_OPTIONS = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/png8',
];

interface CustomTileSourceWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

export default function CustomTileSourceWizard({ onClose, onComplete }: CustomTileSourceWizardProps) {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);

  const updateState = useCallback((updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
    setErrors({});
  }, []);

  const validateStep = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (state.step === 1) {
      if (!state.type) {
        newErrors.type = '请选择图源类型';
      }
    }

    if (state.step === 2) {
      if (!state.id.trim()) {
        newErrors.id = '请输入图源 ID';
      } else if (!/^[a-zA-Z0-9_-]+$/.test(state.id)) {
        newErrors.id = 'ID 只能包含字母、数字、下划线和连字符';
      }
      if (!state.name.trim()) {
        newErrors.name = '请输入图源名称';
      }
      if (!state.urlTemplate.trim()) {
        newErrors.urlTemplate = '请输入 URL 模板';
      } else {
        // 验证 URL 模板格式
        const hasX = state.urlTemplate.includes('{x}') || state.urlTemplate.includes('{$x}');
        const hasY = state.urlTemplate.includes('{y}') || state.urlTemplate.includes('{$y}');
        const hasZ = state.urlTemplate.includes('{z}') || state.urlTemplate.includes('{$z}');
        if (!hasX || !hasY || !hasZ) {
          newErrors.urlTemplate = 'URL 模板必须包含 {x}、{y}、{z} 占位符';
        }
      }
      if (state.minZoom > state.maxZoom) {
        newErrors.minZoom = '最小缩放不能大于最大缩放';
      }
    }

    if (state.step === 3) {
      if ((state.type === 'wmts' || state.type === 'wms') && !state.layerName.trim()) {
        newErrors.layerName = '请输入图层名称';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [state]);

  const handleNext = useCallback(() => {
    if (validateStep()) {
      setState((prev) => ({ ...prev, step: prev.step + 1 }));
    }
  }, [validateStep]);

  const handlePrev = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.max(1, prev.step - 1) }));
  }, []);

  const generatePreviewUrl = useCallback(() => {
    let url = state.urlTemplate;
    url = url.replace(/\{x\}/gi, '100');
    url = url.replace(/\{y\}/gi, '50');
    url = url.replace(/\{z\}/gi, '8');
    url = url.replace(/\{s\}/gi, state.subdomains ? state.subdomains[0] : 'a');
    url = url.replace(/\{quadkey\}/gi, '13020111');
    url = url.replace(/\{\$Galileo\}/gi, 'Galileo');
    return url;
  }, [state.urlTemplate, state.subdomains]);

  const handleTest = useCallback(async () => {
    const url = generatePreviewUrl();
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(url, { method: 'HEAD' });
      setTestResult(response.ok ? 'success' : 'failed');
    } catch {
      setTestResult('failed');
    } finally {
      setTesting(false);
    }
  }, [generatePreviewUrl]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // 检查 ID 是否已存在
      const exists = await hasCustomSource(state.id);
      if (exists) {
        setErrors({ id: '该 ID 已存在，请更换' });
        setSaving(false);
        return;
      }

      await createCustomSource({
        id: state.id,
        name: state.name,
        type: state.type,
        urlTemplate: state.urlTemplate,
        subdomains: state.subdomains || undefined,
        projection: state.projection,
        minZoom: state.minZoom,
        maxZoom: state.maxZoom,
        attribution: state.attribution || undefined,
        icon: state.icon || undefined,
      });

      onComplete();
    } catch (err) {
      console.error('[CustomTileSourceWizard] Failed to save:', err);
      setErrors({ save: '保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  }, [state, onComplete]);

  const renderStep1 = () => (
    <div className="wizard-step">
      <h3 className="wizard-step-title">选择图源类型</h3>
      <p className="wizard-step-desc">选择您要添加的瓦片服务类型</p>

      <div className="type-options">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`type-option ${state.type === opt.value ? 'selected' : ''}`}
            onClick={() => updateState({ type: opt.value })}
          >
            <span className="type-icon">{opt.icon}</span>
            <span className="type-label">{opt.label}</span>
            <span className="type-desc">{opt.description}</span>
          </button>
        ))}
      </div>

      {errors.type && <div className="wizard-error">{errors.type}</div>}
    </div>
  );

  const renderStep2 = () => (
    <div className="wizard-step">
      <h3 className="wizard-step-title">基本信息</h3>
      <p className="wizard-step-desc">填写图源的基本配置</p>

      <div className="form-fields">
        <div className="form-field">
          <label>图源 ID *</label>
          <input
            type="text"
            value={state.id}
            onChange={(e) => updateState({ id: e.target.value })}
            placeholder="例如: my-tiles"
          />
          {errors.id && <span className="field-error">{errors.id}</span>}
        </div>

        <div className="form-field">
          <label>名称 *</label>
          <input
            type="text"
            value={state.name}
            onChange={(e) => updateState({ name: e.target.value })}
            placeholder="例如: 我的自定义地图"
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="form-field">
          <label>URL 模板 *</label>
          <input
            type="text"
            value={state.urlTemplate}
            onChange={(e) => updateState({ urlTemplate: e.target.value })}
            placeholder="https://example.com/{z}/{x}/{y}.png"
          />
          <span className="field-hint">
            使用 {'{x}'} {'{y}'} {'{z}'} 作为占位符
          </span>
          {errors.urlTemplate && <span className="field-error">{errors.urlTemplate}</span>}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>子域名</label>
            <input
              type="text"
              value={state.subdomains}
              onChange={(e) => updateState({ subdomains: e.target.value })}
              placeholder="abc"
            />
            <span className="field-hint">用 {'{s}'} 引用</span>
          </div>

          <div className="form-field">
            <label>坐标系</label>
            <select
              value={state.projection}
              onChange={(e) => updateState({ projection: e.target.value as ProjectionType })}
            >
              {PROJECTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>最小缩放</label>
            <input
              type="number"
              min="0"
              max="22"
              value={state.minZoom}
              onChange={(e) => updateState({ minZoom: Number(e.target.value) })}
            />
            {errors.minZoom && <span className="field-error">{errors.minZoom}</span>}
          </div>

          <div className="form-field">
            <label>最大缩放</label>
            <input
              type="number"
              min="0"
              max="22"
              value={state.maxZoom}
              onChange={(e) => updateState({ maxZoom: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="form-field">
          <label>版权声明</label>
          <input
            type="text"
            value={state.attribution}
            onChange={(e) => updateState({ attribution: e.target.value })}
            placeholder="© 地图提供商"
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="wizard-step">
      <h3 className="wizard-step-title">高级参数</h3>
      <p className="wizard-step-desc">
        {state.type === 'wmts' || state.type === 'wms'
          ? '配置服务特定参数'
          : '当前类型无需额外配置'}
      </p>

      <div className="form-fields">
        {(state.type === 'wmts' || state.type === 'wms') && (
          <>
            <div className="form-field">
              <label>图层名称 *</label>
              <input
                type="text"
                value={state.layerName}
                onChange={(e) => updateState({ layerName: e.target.value })}
                placeholder="例如: base_layer"
              />
              {errors.layerName && <span className="field-error">{errors.layerName}</span>}
            </div>

            <div className="form-field">
              <label>样式名称</label>
              <input
                type="text"
                value={state.styleName}
                onChange={(e) => updateState({ styleName: e.target.value })}
                placeholder="例如: default"
              />
            </div>

            {state.type === 'wmts' && (
              <div className="form-field">
                <label>TileMatrixSet</label>
                <input
                  type="text"
                  value={state.tileMatrixSet}
                  onChange={(e) => updateState({ tileMatrixSet: e.target.value })}
                  placeholder="例如: GoogleMapsCompatible"
                />
              </div>
            )}

            <div className="form-field">
              <label>图片格式</label>
              <select
                value={state.format}
                onChange={(e) => updateState({ format: e.target.value })}
              >
                {FORMAT_OPTIONS.map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {fmt}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {state.type !== 'wmts' && state.type !== 'wms' && (
          <div className="wizard-hint">
            <span className="hint-icon">ℹ️</span>
            <span>XYZ 和 TMS 类型无需额外参数，可直接进入下一步预览</span>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="wizard-step">
      <h3 className="wizard-step-title">预览与保存</h3>
      <p className="wizard-step-desc">测试瓦片加载并保存配置</p>

      <div className="preview-section">
        <div className="preview-info">
          <div className="info-row">
            <span className="info-label">类型:</span>
            <span className="info-value">{TYPE_OPTIONS.find((t) => t.value === state.type)?.label}</span>
          </div>
          <div className="info-row">
            <span className="info-label">名称:</span>
            <span className="info-value">{state.name}</span>
          </div>
          <div className="info-row">
            <span className="info-label">坐标:</span>
            <span className="info-value">{state.projection.toUpperCase()}</span>
          </div>
          <div className="info-row">
            <span className="info-label">缩放:</span>
            <span className="info-value">
              {state.minZoom} - {state.maxZoom}
            </span>
          </div>
        </div>

        <div className="preview-url-section">
          <h4>测试瓦片 URL</h4>
          <div className="preview-url">{generatePreviewUrl()}</div>
          <button className="test-btn" onClick={handleTest} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult && (
            <div className={`test-result ${testResult}`}>
              {testResult === 'success' ? '✓ 连接成功' : '✗ 连接失败'}
            </div>
          )}
        </div>
      </div>

      {errors.save && <div className="wizard-error">{errors.save}</div>}
    </div>
  );

  const WIZARD_STEPS = [
    { key: 1, label: '类型', icon: '1', completed: state.step > 1 },
    { key: 2, label: '信息', icon: '2', completed: state.step > 2 },
    { key: 3, label: '参数', icon: '3', completed: state.step > 3 },
    { key: 4, label: '保存', icon: '4', completed: state.step > 4 },
  ];

  let stepContent = null;
  switch (state.step) {
    case 1:
      stepContent = renderStep1();
      break;
    case 2:
      stepContent = renderStep2();
      break;
    case 3:
      stepContent = renderStep3();
      break;
    case 4:
      stepContent = renderStep4();
      break;
    default:
      break;
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-modal">
        <CommandPanel
          title="添加自定义图源"
          className="wizard-panel"
          actions={<button className="btn btn--icon btn--ghost" onClick={onClose}>×</button>}
          footer={
            <div className="wizard-footer">
              <button className="btn btn--ghost" onClick={onClose}>
                取消
              </button>

              {state.step > 1 && (
                <button className="btn btn--outline" onClick={handlePrev}>
                  上一步
                </button>
              )}

              {state.step < 4 ? (
                <button className="btn btn--primary" onClick={handleNext}>
                  下一步
                </button>
              ) : (
                <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
                  {saving ? '保存中...' : '保存'}
                </button>
              )}
            </div>
          }
        >
          <div className="wizard-progress-container" style={{ padding: '0 20px 20px' }}>
             <CommandStepRail 
               steps={WIZARD_STEPS} 
               activeKey={state.step} 
             />
          </div>

          <div className="wizard-content">{stepContent}</div>
        </CommandPanel>
      </div>
    </div>
  );
}
