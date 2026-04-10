/**
 * 3D 模型管理面板
 * 显示模型库列表和场景中的模型实例
 */

import { useState, useEffect } from 'react';
import {
  useModelStore,
  formatModelSize,
  type PlacedModel,
  type ModelInfo,
} from '../../stores/modelStore';
import { listModels, deleteModel } from '../../services/modelStorageService';
import ModelUploader from './ModelUploader';
import { CommandToolbar, CommandEmptyState } from '../command/CommandPrimitives';

type TabType = 'library' | 'scene';

interface ModelManagerProps {
  disableAutoLoad?: boolean;
}

export default function ModelManager({ disableAutoLoad = false }: ModelManagerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('library');
  const [loading, setLoading] = useState(true);

  const {
    models,
    placedModels,
    selectedPlacedModelId,
    replaceModels,
    placeModel,
    removeModel,
    removePlacedModel,
    togglePlacedModelVisibility,
    togglePlacedModelLock,
    selectPlacedModel,
  } = useModelStore();

  // 加载模型库
  useEffect(() => {
    if (disableAutoLoad) {
      setLoading(false);
      return;
    }
    const loadModels = async () => {
      setLoading(true);
      try {
        const loaded = await listModels();
        replaceModels(loaded || []);
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setLoading(false);
      }
    };

    loadModels();
  }, [disableAutoLoad, replaceModels]);

  // 添加到场景
  const handleAddToScene = (model: ModelInfo) => {
    placeModel(model, {
      longitude: 104.07,
      latitude: 30.57,
      height: 100,
      heading: 0,
      pitch: 0,
      roll: 0,
      scale: 1,
    });
  };

  // 删除模型
  const handleDeleteModel = async (model: ModelInfo) => {
    if (!confirm(`确定要删除模型 "${model.name}" 吗？`)) return;

    const success = await deleteModel(model.id);
    if (success) {
      removeModel(model.id);
    }
  };

  // 删除场景模型
  const handleRemoveFromScene = (placedModel: PlacedModel) => {
    removePlacedModel(placedModel.id);
  };

  // 选择模型
  const handleSelectPlacedModel = (placedModel: PlacedModel) => {
    selectPlacedModel(
      selectedPlacedModelId === placedModel.id ? null : placedModel.id
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px' }}>
      <CommandToolbar>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
             className={`btn ${activeTab === 'library' ? 'btn--primary' : 'btn--ghost'}`}
             onClick={() => setActiveTab('library')}
           >
             模型库 ({models.length})
           </button>
           <button
             className={`btn ${activeTab === 'scene' ? 'btn--primary' : 'btn--ghost'}`}
             onClick={() => setActiveTab('scene')}
           >
             场景模型 ({placedModels.length})
           </button>
        </div>
      </CommandToolbar>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* 模型库 */}
        {activeTab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <ModelUploader />

            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
            ) : models.length === 0 ? (
              <CommandEmptyState icon="inventory_2" title="暂无模型" description="请上传 3D 模型开始使用" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {models.map((model) => (
                  <div key={model.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: 'var(--surface-raised)', borderRadius: 'var(--radius-sm)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                        {model.format === 'glb' || model.format === 'gltf' ? 'view_in_ar' : 'inventory_2'}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <span style={{ background: 'var(--surface-raised)', padding: '2px 6px', borderRadius: '4px' }}>{model.format.toUpperCase()}</span>
                        <span>{formatModelSize(model.size)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn--sm btn--primary"
                        onClick={() => handleAddToScene(model)}
                        title="添加到场景"
                      >
                        ➕ 添加
                      </button>
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={() => handleDeleteModel(model)}
                        title="删除"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 场景模型 */}
        {activeTab === 'scene' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {placedModels.length === 0 ? (
              <CommandEmptyState icon="location_city" title="场景中暂无模型" description="请从模型库添加模型到场景" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {placedModels.map((placedModel) => (
                  <div
                    key={placedModel.id}
                    onClick={() => handleSelectPlacedModel(placedModel)}
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', 
                      background: selectedPlacedModelId === placedModel.id ? 'var(--surface-active)' : 'var(--surface)', 
                      border: `1px solid ${selectedPlacedModelId === placedModel.id ? 'var(--accent)' : 'var(--border)'}`, 
                      borderRadius: 'var(--radius-md)',
                      opacity: placedModel.visible ? 1 : 0.6,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: 'var(--surface-raised)', borderRadius: 'var(--radius-sm)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                        {placedModel.modelInfo.format === 'glb' ||
                        placedModel.modelInfo.format === 'gltf'
                          ? 'view_in_ar'
                          : 'inventory_2'}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {placedModel.modelInfo.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px', fontFamily: 'monospace' }}>
                        <span>
                          <span className="material-symbols-outlined" style={{ fontSize: '12px', verticalAlign: 'middle' }}>place</span> {placedModel.placement.longitude.toFixed(4)},{' '}
                          {placedModel.placement.latitude.toFixed(4)}
                        </span>
                        <span><span className="material-symbols-outlined" style={{ fontSize: '12px', verticalAlign: 'middle' }}>arrow_upward</span> 高度: {placedModel.placement.height}m</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className={`btn btn--sm ${placedModel.visible ? 'btn--ghost' : 'btn--secondary'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlacedModelVisibility(placedModel.id);
                        }}
                        title={placedModel.visible ? '隐藏' : '显示'}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{placedModel.visible ? 'visibility' : 'visibility_off'}</span>
                      </button>
                      <button
                        className={`btn btn--sm ${placedModel.locked ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlacedModelLock(placedModel.id);
                        }}
                        title={placedModel.locked ? '解锁' : '锁定'}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{placedModel.locked ? 'lock' : 'lock_open'}</span>
                      </button>
                      <button
                        className="btn btn--sm btn--ghost"
                        style={{ color: 'var(--danger)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFromScene(placedModel);
                        }}
                        title="从场景移除"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
