/**
 * 3D 模型上传组件
 * 支持拖拽上传和点击上传
 */

import { useState, useCallback, useRef } from 'react';
import {
  uploadModel,
  validateModelFile,
} from '../../services/modelStorageService';
import { useModelStore } from '../../stores/modelStore';
import type { ModelInfo } from '../../stores/modelStore';

interface ModelUploaderProps {
  onUploadSuccess?: (model: ModelInfo) => void;
  onUploadError?: (error: string) => void;
}

export default function ModelUploader({
  onUploadSuccess,
  onUploadError,
}: ModelUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addModel } = useModelStore();

  // 处理文件上传
  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);

    // 验证文件
    const validation = validateModelFile(file);
    if (!validation.valid) {
      const errorMsg = validation.error || '无效的文件';
      setError(errorMsg);
      onUploadError?.(errorMsg);
      return;
    }

    setIsUploading(true);
    setProgress(0);

    try {
      const result = await uploadModel(file, (p) => setProgress(p));

      if (result.success && result.model) {
        // 添加到模型库
        addModel(result.model);
        onUploadSuccess?.(result.model);
      } else {
        const errorMsg = result.error || '上传失败';
        setError(errorMsg);
        onUploadError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '上传失败';
      setError(errorMsg);
      onUploadError?.(errorMsg);
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  }, [addModel, onUploadSuccess, onUploadError]);

  // 点击上传
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  // 文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // 重置 input 以允许重复选择同一文件
    e.target.value = '';
  };

  // 拖拽事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  return (
    <div className="model-uploader">
      <div
        className={`model-uploader__dropzone ${dragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".gltf,.glb,.obj,.fbx"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {isUploading ? (
          <div className="model-uploader__uploading">
            <div className="model-uploader__icon">📤</div>
            <div className="model-uploader__text">上传中...</div>
            <div className="model-uploader__progress">
              <div
                className="model-uploader__progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="model-uploader__percent">{progress}%</div>
          </div>
        ) : (
          <div className="model-uploader__idle">
            <div className="model-uploader__icon material-symbols-outlined">inventory_2</div>
            <div className="model-uploader__text">
              拖放或点击上传 3D 模型
            </div>
            <div className="model-uploader__hint">
              支持 glTF、GLB、OBJ、FBX 格式，最大 50MB
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="model-uploader__error">
          <span className="model-uploader__error-icon material-symbols-outlined">warning</span>
          <span className="model-uploader__error-text">{error}</span>
        </div>
      )}
    </div>
  );
}
