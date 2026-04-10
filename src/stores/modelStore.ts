/**
 * 3D 模型状态管理
 * 管理已加载的模型、选中状态和模型配置
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 模型格式
export type ModelFormat = 'gltf' | 'glb' | 'obj' | 'fbx';

// 模型位置信息
export interface ModelPlacement {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;   // 航向角 (度)
  pitch: number;     // 俯仰角 (度)
  roll: number;      // 翻滚角 (度)
  scale: number;     // 缩放比例
  clampToGround: boolean;   // 是否贴合地形表面
  groundOffset: number;     // 贴地偏移 (米)
}

// 模型信息
export interface ModelInfo {
  id: string;
  name: string;
  url: string;
  thumbnail?: string;
  format: ModelFormat;
  size: number;
  createdAt: number;
  updatedAt: number;
}

// 场景中的模型实例
export interface PlacedModel {
  id: string;
  modelId: string;
  modelInfo: ModelInfo;
  placement: ModelPlacement;
  visible: boolean;
  locked: boolean;
  addedAt: number;
}

// 模型存储状态
interface ModelState {
  // 模型库
  models: ModelInfo[];

  // 场景中的模型实例
  placedModels: PlacedModel[];

  // 当前选中的模型实例 ID
  selectedPlacedModelId: string | null;

  // 编辑状态
  isEditing: boolean;

  // Actions - 模型库
  addModel: (model: ModelInfo) => void;
  updateModel: (id: string, updates: Partial<ModelInfo>) => void;
  removeModel: (id: string) => void;
  replaceModels: (models: ModelInfo[]) => void;

  // Actions - 场景模型
  placeModel: (modelInfo: ModelInfo, placement: ModelPlacement) => string;
  updatePlacement: (placedModelId: string, updates: Partial<ModelPlacement>) => void;
  removePlacedModel: (placedModelId: string) => void;
  togglePlacedModelVisibility: (placedModelId: string) => void;
  togglePlacedModelLock: (placedModelId: string) => void;

  // Actions - 选择
  selectPlacedModel: (id: string | null) => void;

  // Actions - 编辑
  setEditing: (editing: boolean) => void;
  hydrateWorkspace: (payload?: Partial<Pick<ModelState, 'models' | 'placedModels' | 'selectedPlacedModelId'>>) => void;
  resetWorkspace: () => void;

  // 辅助方法
  getPlacedModelById: (id: string) => PlacedModel | undefined;
  getModelById: (id: string) => ModelInfo | undefined;
}

// 默认放置位置
const DEFAULT_PLACEMENT: ModelPlacement = {
  longitude: 104.07,
  latitude: 30.57,
  height: 0,
  heading: 0,
  pitch: 0,
  roll: 0,
  scale: 1,
  clampToGround: true,
  groundOffset: 0,
};

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      // 初始状态
      models: [],
      placedModels: [],
      selectedPlacedModelId: null,
      isEditing: false,

      // 模型库操作
      addModel: (model) => {
        set((state) => ({
          models: [...state.models, model],
        }));
      },

      replaceModels: (models) => {
        set({ models: Array.isArray(models) ? models : [] });
      },

      updateModel: (id, updates) => {
        set((state) => ({
          models: state.models.map((m) =>
            m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
          ),
          placedModels: state.placedModels.map((pm) =>
            pm.modelId === id
              ? { ...pm, modelInfo: { ...pm.modelInfo, ...updates, updatedAt: Date.now() } }
              : pm
          ),
        }));
      },

      removeModel: (id) => {
        set((state) => ({
          models: state.models.filter((m) => m.id !== id),
          placedModels: state.placedModels.filter((pm) => pm.modelId !== id),
        }));
      },

      // 场景模型操作
      placeModel: (modelInfo, placement) => {
        const placedModelId = `placed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const placedModel: PlacedModel = {
          id: placedModelId,
          modelId: modelInfo.id,
          modelInfo,
          placement: { ...DEFAULT_PLACEMENT, ...placement },
          visible: true,
          locked: false,
          addedAt: Date.now(),
        };

        set((state) => ({
          placedModels: [...state.placedModels, placedModel],
        }));

        return placedModelId;
      },

      updatePlacement: (placedModelId, updates) => {
        set((state) => ({
          placedModels: state.placedModels.map((pm) =>
            pm.id === placedModelId
              ? { ...pm, placement: { ...pm.placement, ...updates } }
              : pm
          ),
        }));
      },

      removePlacedModel: (placedModelId) => {
        set((state) => ({
          placedModels: state.placedModels.filter((pm) => pm.id !== placedModelId),
          selectedPlacedModelId:
            state.selectedPlacedModelId === placedModelId
              ? null
              : state.selectedPlacedModelId,
        }));
      },

      togglePlacedModelVisibility: (placedModelId) => {
        set((state) => ({
          placedModels: state.placedModels.map((pm) =>
            pm.id === placedModelId ? { ...pm, visible: !pm.visible } : pm
          ),
        }));
      },

      togglePlacedModelLock: (placedModelId) => {
        set((state) => ({
          placedModels: state.placedModels.map((pm) =>
            pm.id === placedModelId ? { ...pm, locked: !pm.locked } : pm
          ),
        }));
      },

      // 选择操作
      selectPlacedModel: (id) => {
        set({ selectedPlacedModelId: id });
      },

      // 编辑操作
      setEditing: (editing) => {
        set({ isEditing: editing });
      },

      hydrateWorkspace: (payload = {}) => {
        set({
          models: Array.isArray(payload.models) ? payload.models : [],
          placedModels: Array.isArray(payload.placedModels) ? payload.placedModels : [],
          selectedPlacedModelId: payload.selectedPlacedModelId || null,
          isEditing: false,
        });
      },

      resetWorkspace: () => {
        set({
          models: [],
          placedModels: [],
          selectedPlacedModelId: null,
          isEditing: false,
        });
      },

      // 辅助方法
      getPlacedModelById: (id) => {
        return get().placedModels.find((pm) => pm.id === id);
      },

      getModelById: (id) => {
        return get().models.find((m) => m.id === id);
      },
    }),
    {
      name: 'map-models-storage',
      partialize: (state) => ({
        models: state.models,
        placedModels: state.placedModels,
      }),
    }
  )
);

// 生成唯一模型 ID
export function generateModelId(): string {
  return `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 格式化模型大小
export function formatModelSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
