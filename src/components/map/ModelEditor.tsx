/**
 * 3D 模型编辑器
 * 编辑模型位置、旋转、缩放等属性
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useModelStore,
  type PlacedModel,
  type ModelPlacement,
} from '../../stores/modelStore';
import {
  calculateRealSizeFromScale,
  calculateScaleForTargetSize,
  formatSize,
} from '../../utils/map/scaleUtils';

interface ModelEditorProps {
  placedModel?: PlacedModel;
  onClose?: () => void;
}

// 默认模型尺寸（假设模型原始单位为 1 米）
const DEFAULT_MODEL_SIZE = { x: 1, y: 1, z: 1 };

export default function ModelEditor({ placedModel, onClose }: ModelEditorProps) {
  const { updatePlacement, removePlacedModel } = useModelStore();

  // 本地状态
  const [placement, setPlacement] = useState<ModelPlacement>({
    longitude: 0,
    latitude: 0,
    height: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    scale: 1,
    clampToGround: true,
    groundOffset: 0,
  });

  // 目标尺寸输入
  const [targetSize, setTargetSize] = useState<{ width: string; height: string }>({
    width: '',
    height: '',
  });

  // 同步 props 到本地状态
  useEffect(() => {
    if (placedModel) {
      setPlacement({
        longitude: placedModel.placement.longitude,
        latitude: placedModel.placement.latitude,
        height: placedModel.placement.height,
        heading: placedModel.placement.heading,
        pitch: placedModel.placement.pitch,
        roll: placedModel.placement.roll,
        scale: placedModel.placement.scale,
        clampToGround: placedModel.placement.clampToGround ?? true,
        groundOffset: placedModel.placement.groundOffset ?? 0,
      });
    }
  }, [placedModel]);

  // 更新单个字段
  const updateField = useCallback(
    (field: keyof ModelPlacement, value: number | boolean) => {
      setPlacement((prev) => ({ ...prev, [field]: value }));

      if (placedModel) {
        updatePlacement(placedModel.id, { [field]: value });
      }
    },
    [placedModel, updatePlacement]
  );

  // 删除模型
  const handleDelete = () => {
    if (!placedModel) return;

    if (confirm(`确定要从场景移除 "${placedModel.modelInfo.name}" 吗？`)) {
      removePlacedModel(placedModel.id);
      onClose?.();
    }
  };

  // 重置到默认值
  const handleReset = () => {
    const defaultPlacement: ModelPlacement = {
      longitude: 104.07,
      latitude: 30.57,
      height: 100,
      heading: 0,
      pitch: 0,
      roll: 0,
      scale: 1,
      clampToGround: true,
      groundOffset: 0,
    };

    setPlacement(defaultPlacement);

    if (placedModel) {
      updatePlacement(placedModel.id, defaultPlacement);
    }
  };

  // 计算当前实际尺寸
  const currentRealSize = useMemo(() => {
    return calculateRealSizeFromScale(
      placement.scale,
      DEFAULT_MODEL_SIZE,
      placement.latitude
    );
  }, [placement.scale, placement.latitude]);

  // 应用目标尺寸
  const applyTargetSize = (dimension: 'width' | 'height', value: string) => {
    const targetMeters = parseFloat(value);
    if (isNaN(targetMeters) || targetMeters <= 0) return;

    const modelSize = dimension === 'width' ? DEFAULT_MODEL_SIZE.x : DEFAULT_MODEL_SIZE.z;
    const newScale = calculateScaleForTargetSize(targetMeters, modelSize);

    updateField('scale', Math.round(newScale * 100) / 100);
  };

  if (!placedModel) {
    return (
      <div className="model-editor model-editor--empty">
        <div className="model-editor__empty-icon material-symbols-outlined">inventory_2</div>
        <p>选择场景中的模型进行编辑</p>
      </div>
    );
  }

  return (
    <div className="model-editor">
      {/* 标题 */}
      <div className="model-editor__header">
        <h3 className="model-editor__title">{placedModel.modelInfo.name}</h3>
        <button className="model-editor__close" onClick={onClose}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
        </button>
      </div>

      {/* 贴地设置 */}
      <div className="model-editor__section">
        <h4 className="model-editor__section-title"><span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>terrain</span> 高度</h4>

        <div className="model-editor__field">
          <label className="model-editor__checkbox">
            <input
              type="checkbox"
              checked={placement.clampToGround}
              onChange={(e) => updateField('clampToGround', e.target.checked)}
            />
            <span>贴合地形表面</span>
          </label>
        </div>

        {!placement.clampToGround && (
          <div className="model-editor__field">
            <label>离地高度 (米)</label>
            <input
              type="number"
              step="1"
              value={placement.height}
              onChange={(e) => updateField('height', parseFloat(e.target.value) || 0)}
            />
          </div>
        )}

        {placement.clampToGround && (
          <div className="model-editor__field">
            <label>地形偏移 (米)</label>
            <input
              type="number"
              step="0.5"
              value={placement.groundOffset}
              onChange={(e) => updateField('groundOffset', parseFloat(e.target.value) || 0)}
            />
          </div>
        )}
      </div>

      {/* 位置 */}
      <div className="model-editor__section">
        <h4 className="model-editor__section-title"><span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>place</span> 位置</h4>

        <div className="model-editor__field">
          <label>经度</label>
          <input
            type="number"
            step="0.0001"
            value={placement.longitude}
            onChange={(e) => updateField('longitude', parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="model-editor__field">
          <label>纬度</label>
          <input
            type="number"
            step="0.0001"
            value={placement.latitude}
            onChange={(e) => updateField('latitude', parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* 旋转 */}
      <div className="model-editor__section">
        <h4 className="model-editor__section-title"><span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>rotate_right</span> 旋转</h4>

        <div className="model-editor__field">
          <label>航向角</label>
          <div className="model-editor__field-row">
            <input
              type="range"
              min="0"
              max="360"
              value={placement.heading}
              onChange={(e) => updateField('heading', parseInt(e.target.value))}
            />
            <span className="model-editor__value">{placement.heading}°</span>
          </div>
        </div>

        <div className="model-editor__field">
          <label>俯仰角</label>
          <div className="model-editor__field-row">
            <input
              type="range"
              min="-90"
              max="90"
              value={placement.pitch}
              onChange={(e) => updateField('pitch', parseInt(e.target.value))}
            />
            <span className="model-editor__value">{placement.pitch}°</span>
          </div>
        </div>

        <div className="model-editor__field">
          <label>翻滚角</label>
          <div className="model-editor__field-row">
            <input
              type="range"
              min="-180"
              max="180"
              value={placement.roll}
              onChange={(e) => updateField('roll', parseInt(e.target.value))}
            />
            <span className="model-editor__value">{placement.roll}°</span>
          </div>
        </div>
      </div>

      {/* 缩放 */}
      <div className="model-editor__section">
        <h4 className="model-editor__section-title"><span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>straighten</span> 缩放</h4>

        <div className="model-editor__field">
          <label>比例</label>
          <div className="model-editor__field-row">
            <input
              type="range"
              min="0.1"
              max="100"
              step="0.1"
              value={placement.scale}
              onChange={(e) => updateField('scale', parseFloat(e.target.value))}
            />
            <span className="model-editor__value">{placement.scale.toFixed(1)}x</span>
          </div>
        </div>
      </div>

      {/* 尺寸校准 */}
      <div className="model-editor__section">
        <h4 className="model-editor__section-title"><span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>square_foot</span> 尺寸校准</h4>

        <div className="model-editor__current-size">
          <span>当前实际尺寸：</span>
          <strong>{formatSize(currentRealSize.widthMeters)} × {formatSize(currentRealSize.depthMeters)} × {formatSize(currentRealSize.heightMeters)}</strong>
        </div>

        <div className="model-editor__field">
          <label>目标宽度 (米)</label>
          <div className="model-editor__field-row">
            <input
              type="number"
              step="1"
              value={targetSize.width}
              onChange={(e) => setTargetSize(prev => ({ ...prev, width: e.target.value }))}
              placeholder="例如 100"
            />
            <button
              type="button"
              className="model-editor__btn-apply"
              onClick={() => applyTargetSize('width', targetSize.width)}
              disabled={!targetSize.width}
            >
              应用
            </button>
          </div>
        </div>

        <div className="model-editor__field">
          <label>目标高度 (米)</label>
          <div className="model-editor__field-row">
            <input
              type="number"
              step="1"
              value={targetSize.height}
              onChange={(e) => setTargetSize(prev => ({ ...prev, height: e.target.value }))}
              placeholder="例如 50"
            />
            <button
              type="button"
              className="model-editor__btn-apply"
              onClick={() => applyTargetSize('height', targetSize.height)}
              disabled={!targetSize.height}
            >
              应用
            </button>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="model-editor__actions">
        <button
          className="model-editor__btn model-editor__btn--secondary"
          onClick={handleReset}
        >
          重置
        </button>
        <button
          className="model-editor__btn model-editor__btn--danger"
          onClick={handleDelete}
        >
          移除
        </button>
      </div>

      {/* 提示 */}
      <div className="model-editor__hint">
        💡 左键拖拽模型可直接调整位置
      </div>
    </div>
  );
}