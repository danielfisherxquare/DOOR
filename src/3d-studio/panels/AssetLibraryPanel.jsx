/**
 * Asset Library Panel
 * 资产库面板组件
 */

import { useState, useEffect, useCallback } from 'react';
import useEditor from '../store/useEditor';
import request from '../../utils/request';
import { generateThumbnail } from '../utils/thumbnailGenerator';

const CATEGORIES = [
    { id: 'all', label: '全部' },
    { id: 'furniture', label: '家具' },
    { id: 'equipment', label: '设备' },
    { id: 'structure', label: '结构' },
    { id: 'decoration', label: '装饰' },
];

export default function AssetLibraryPanel({ orgId }) {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [category, setCategory] = useState('all');
    const [search, setSearch] = useState('');
    const [uploading, setUploading] = useState(false);

    const { activeAssetId, setActiveAsset, assetLibraryOpen } = useEditor();

    // 加载资产列表
    const loadAssets = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (orgId) params.set('orgId', orgId);
            if (category !== 'all') params.set('category', category);
            if (search) params.set('search', search);

            const response = await request.get(`/app/3d-studio/assets?${params}`);
            setAssets(response.data.data || []);
        } catch (error) {
            console.error('Failed to load assets:', error);
        } finally {
            setLoading(false);
        }
    }, [orgId, category, search]);

    useEffect(() => {
        if (assetLibraryOpen) {
            loadAssets();
        }
    }, [assetLibraryOpen, loadAssets]);

    // 处理文件上传
    const handleUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            // 第一步：上传模型文件创建资产
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', file.name.replace(/\.[^.]+$/, ''));
            formData.append('category', category === 'all' ? 'furniture' : category);
            formData.append('visibility', 'org');

            const response = await request.post('/app/3d-studio/assets', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                params: orgId ? { orgId } : undefined,
            });

            const asset = response.data.data;

            // 第二步：生成并上传缩略图（如果不是重复资产）
            if (asset && !asset.isDuplicate) {
                try {
                    const thumbnail = await generateThumbnail(file, { width: 128, height: 128 });
                    await request.post(`/app/3d-studio/assets/${asset.id}/thumbnail`, {
                        thumbnail,
                    }, {
                        params: orgId ? { orgId } : undefined,
                    });
                } catch (thumbError) {
                    console.warn('缩略图生成/上传失败:', thumbError);
                }
            }

            loadAssets();
        } catch (error) {
            console.error('Upload failed:', error);
            alert('上传失败: ' + (error.response?.data?.message || error.message));
        } finally {
            setUploading(false);
        }
    };

    // 拖拽开始
    const handleDragStart = (asset) => {
        setActiveAsset(asset.id);
    };

    // 选择资产
    const handleSelect = (asset) => {
        setActiveAsset(asset.id);
    };

    if (!assetLibraryOpen) return null;

    return (
        <div className="asset-library-panel">
            <div className="asset-library-panel__header">
                <h3>资产库</h3>
                <label className="upload-btn">
                    {uploading ? '上传中...' : '上传模型'}
                    <input
                        type="file"
                        accept=".glb,.gltf,.obj,.fbx"
                        onChange={handleUpload}
                        disabled={uploading}
                        style={{ display: 'none' }}
                    />
                </label>
            </div>

            <div className="asset-library-panel__filters">
                <input
                    type="text"
                    placeholder="搜索资产..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <div className="category-tabs">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            className={category === cat.id ? 'active' : ''}
                            onClick={() => setCategory(cat.id)}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="asset-library-panel__grid">
                {loading ? (
                    <div className="loading">加载中...</div>
                ) : assets.length === 0 ? (
                    <div className="empty">暂无资产，点击上方按钮上传</div>
                ) : (
                    assets.map((asset) => (
                        <div
                            key={asset.id}
                            className={`asset-card ${activeAssetId === asset.id ? 'active' : ''}`}
                            draggable
                            onDragStart={() => handleDragStart(asset)}
                            onClick={() => handleSelect(asset)}
                        >
                            <div className="asset-card__thumbnail">
                                {asset.thumbnailDataUrl ? (
                                    <img src={asset.thumbnailDataUrl} alt={asset.name} />
                                ) : (
                                    <div className="placeholder">
                                        {asset.fileType?.toUpperCase() || '3D'}
                                    </div>
                                )}
                            </div>
                            <div className="asset-card__info">
                                <div className="asset-card__name" title={asset.name}>
                                    {asset.name}
                                </div>
                                <div className="asset-card__meta">
                                    <span className="category">{asset.category}</span>
                                    {asset.visibility === 'public' && (
                                        <span className="public-badge">公开</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <style>{`
                .asset-library-panel {
                    width: 280px;
                    background: #1e1e2e;
                    border-left: 1px solid #313244;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    color: #cdd6f4;
                }

                .asset-library-panel__header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    border-bottom: 1px solid #313244;
                }

                .asset-library-panel__header h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                }

                .upload-btn {
                    padding: 6px 12px;
                    background: #89b4fa;
                    color: #1e1e2e;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    font-weight: 500;
                }

                .upload-btn:hover {
                    background: #b4befe;
                }

                .asset-library-panel__filters {
                    padding: 12px;
                    border-bottom: 1px solid #313244;
                }

                .asset-library-panel__filters input {
                    width: 100%;
                    padding: 8px;
                    background: #313244;
                    border: 1px solid #45475a;
                    border-radius: 4px;
                    color: #cdd6f4;
                    margin-bottom: 8px;
                }

                .category-tabs {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }

                .category-tabs button {
                    padding: 4px 8px;
                    background: #313244;
                    border: none;
                    border-radius: 4px;
                    color: #a6adc8;
                    font-size: 11px;
                    cursor: pointer;
                }

                .category-tabs button.active {
                    background: #89b4fa;
                    color: #1e1e2e;
                }

                .asset-library-panel__grid {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                    align-content: start;
                }

                .loading, .empty {
                    grid-column: 1 / -1;
                    text-align: center;
                    padding: 24px;
                    color: #6c7086;
                }

                .asset-card {
                    background: #313244;
                    border-radius: 6px;
                    overflow: hidden;
                    cursor: pointer;
                    border: 2px solid transparent;
                    transition: border-color 0.2s;
                }

                .asset-card:hover {
                    border-color: #45475a;
                }

                .asset-card.active {
                    border-color: #89b4fa;
                }

                .asset-card__thumbnail {
                    aspect-ratio: 1;
                    background: #1e1e2e;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .asset-card__thumbnail img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .asset-card__thumbnail .placeholder {
                    font-size: 18px;
                    font-weight: 700;
                    color: #45475a;
                }

                .asset-card__info {
                    padding: 8px;
                }

                .asset-card__name {
                    font-size: 11px;
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .asset-card__meta {
                    display: flex;
                    gap: 4px;
                    margin-top: 4px;
                }

                .asset-card__meta .category {
                    font-size: 10px;
                    color: #6c7086;
                }

                .public-badge {
                    font-size: 9px;
                    background: #a6e3a1;
                    color: #1e1e2e;
                    padding: 1px 4px;
                    border-radius: 2px;
                }
            `}</style>
        </div>
    );
}