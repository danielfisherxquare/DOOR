/**
 * 模型存储服务
 * 处理模型文件的上传、获取、删除等操作
 */

import type { ModelInfo, ModelFormat } from '../stores/modelStore';
import { generateModelId } from '../stores/modelStore';
import request from '../utils/request';

// API 基础路径 (可通过环境变量配置)
const API_BASE = import.meta.env.VITE_API_BASE || '';
const MODEL_API_PATH = `${API_BASE}/api/models`;

// 上传进度回调
export type UploadProgressCallback = (progress: number) => void;

// 上传结果
export interface UploadResult {
  success: boolean;
  model?: ModelInfo;
  error?: string;
}

/**
 * 检测模型格式
 */
export function detectModelFormat(filename: string): ModelFormat {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case 'gltf':
      return 'gltf';
    case 'glb':
      return 'glb';
    case 'obj':
      return 'obj';
    case 'fbx':
      return 'fbx';
    default:
      return 'glb';
  }
}

/**
 * 验证模型文件
 */
export function validateModelFile(file: File): { valid: boolean; error?: string } {
  // 检查格式
  const validFormats = ['.gltf', '.glb', '.obj', '.fbx'];
  const isValidFormat = validFormats.some((fmt) =>
    file.name.toLowerCase().endsWith(fmt)
  );

  if (!isValidFormat) {
    return {
      valid: false,
      error: `不支持的格式。支持: ${validFormats.join(', ')}`,
    };
  }

  // 检查大小 (最大 50MB)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: '文件大小不能超过 50MB',
    };
  }

  return { valid: true };
}

/**
 * 上传模型文件
 */
export async function uploadModel(
  file: File,
  onProgress?: UploadProgressCallback
): Promise<UploadResult> {
  // 验证文件
  const validation = validateModelFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // 如果没有配置后端 API，使用本地模拟
  if (!API_BASE || import.meta.env.VITE_MOCK_MODEL_API === 'true') {
    return mockUploadModel(file, onProgress);
  }

  try {
    const formData = new FormData();
    formData.append('model', file);
    formData.append('name', file.name);

    const data = await request.post(MODEL_API_PATH, formData, {
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });

    return {
      success: true,
      model: data.model,
    };
  } catch (error) {
    console.error('Model upload failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '上传失败',
    };
  }
}

/**
 * 模拟上传 (用于开发测试)
 */
async function mockUploadModel(
  file: File,
  onProgress?: UploadProgressCallback
): Promise<UploadResult> {
  // 模拟上传进度
  if (onProgress) {
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      onProgress(i);
    }
  }

  // 创建本地 URL
  const url = URL.createObjectURL(file);
  const format = detectModelFormat(file.name);

  const modelInfo: ModelInfo = {
    id: generateModelId(),
    name: file.name,
    url,
    format,
    size: file.size,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    success: true,
    model: modelInfo,
  };
}

/**
 * 获取模型列表
 */
export async function listModels(): Promise<ModelInfo[]> {
  if (!API_BASE || import.meta.env.VITE_MOCK_MODEL_API === 'true') {
    // 从 localStorage 读取
    const stored = localStorage.getItem('uploaded-models');
    return stored ? JSON.parse(stored) : [];
  }

  try {
    return await request.get(MODEL_API_PATH);
  } catch (error) {
    console.error('Failed to list models:', error);
    return [];
  }
}

/**
 * 获取模型详情
 */
export async function getModel(id: string): Promise<ModelInfo | null> {
  if (!API_BASE || import.meta.env.VITE_MOCK_MODEL_API === 'true') {
    const models = await listModels();
    return models.find((m) => m.id === id) || null;
  }

  try {
    return await request.get(`${MODEL_API_PATH}/${id}`);
  } catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return null;
    console.error('Failed to get model:', error);
    return null;
  }
}

/**
 * 删除模型
 */
export async function deleteModel(id: string): Promise<boolean> {
  if (!API_BASE || import.meta.env.VITE_MOCK_MODEL_API === 'true') {
    // 从 localStorage 删除
    const models = await listModels();
    const filtered = models.filter((m) => m.id !== id);
    localStorage.setItem('uploaded-models', JSON.stringify(filtered));
    return true;
  }

  try {
    await request.delete(`${MODEL_API_PATH}/${id}`);
    return true;
  } catch (error) {
    console.error('Failed to delete model:', error);
    return false;
  }
}

/**
 * 保存模型到本地存储 (用于模拟模式)
 */
export function saveModelToLocal(model: ModelInfo): void {
  const models = JSON.parse(localStorage.getItem('uploaded-models') || '[]');
  const existingIndex = models.findIndex((m: ModelInfo) => m.id === model.id);

  if (existingIndex >= 0) {
    models[existingIndex] = model;
  } else {
    models.push(model);
  }

  localStorage.setItem('uploaded-models', JSON.stringify(models));
}

/**
 * 生成模型缩略图
 */
export async function generateThumbnail(
  _file: File
): Promise<string | null> {
  // 对于 glTF/GLB，需要解析文件生成缩略图
  // 这里简化处理，返回 null
  // 实际实现需要使用 Three.js 或类似库渲染模型
  return null;
}

/**
 * 检查模型 URL 是否可访问
 */
export async function checkModelUrl(url: string): Promise<boolean> {
  try {
    // 对于 blob URL，直接返回 true
    if (url.startsWith('blob:')) return true;

    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
