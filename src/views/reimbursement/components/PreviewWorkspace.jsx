/**
 * PreviewWorkspace
 * 预览工作区 - 文件预览、拖拽识别、批量识别
 */

import { useEffect, useRef, useState } from 'react';
import ThumbnailGrid from './ThumbnailGrid';
import RecognizeDropZone from './RecognizeDropZone';
import useReimbursementStore from '../../../stores/reimbursementStore';

const UploadIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

const RefreshIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

const BatchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
    </svg>
);

function PreviewWorkspace({ projectId, onOpenRecord }) {
    const {
        previewFiles,
        fetchPreviewFiles,
        importToPreview,
        recognizeFromFile,
        discardFile,
        records,
        fetchRecords,
        fetchPendingMatches,
        fetchProjects,
        recognizingFileIds,
        addRecognizingFile,
        removeRecognizingFile,
    } = useReimbursementStore();

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDragOver, setIsDragOver] = useState(false);
    const [importing, setImporting] = useState(false);
    const [stats, setStats] = useState({ total: 0, preview: 0, duplicates: 0 });
    const [uploadType, setUploadType] = useState('invoice');
    const [importNotice, setImportNotice] = useState({ type: '', summary: '', duplicates: [] });
    const [batchProgress, setBatchProgress] = useState(null);
    const [highlightedPendingId, setHighlightedPendingId] = useState(null);
    const fileInputRef = useRef(null);
    const uploadTypeRef = useRef('invoice');

    useEffect(() => {
        if (projectId) {
            fetchPreviewFiles(projectId);
            fetchRecords(projectId);
        }
        setImportNotice({ type: '', summary: '', duplicates: [] });
        setHighlightedPendingId(null);
    }, [projectId, fetchPreviewFiles, fetchRecords]);

    useEffect(() => {
        if (!highlightedPendingId) return undefined;

        const timeoutId = window.setTimeout(() => {
            setHighlightedPendingId((current) => (current === highlightedPendingId ? null : current));
        }, 2200);

        return () => window.clearTimeout(timeoutId);
    }, [highlightedPendingId]);

    useEffect(() => {
        if (previewFiles) {
            // 只统计待识别的文件
            const pending = previewFiles.filter(f => f.status === 'preview');
            const newStats = {
                total: pending.length,
                preview: pending.filter(f => !f.isDuplicate).length,
                duplicates: pending.filter(f => f.isDuplicate).length,
            };
            setStats(newStats);
        }
    }, [previewFiles]);

    const handleFileUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setImporting(true);
        try {
            const documentType = uploadTypeRef.current;
            const result = await importToPreview(projectId, Array.from(files), documentType);
            const importedCount = result?.imported?.length || 0;
            const duplicateCount = result?.duplicates?.length || 0;
            const importedIds = (result?.imported || []).map(item => item.id).filter(Boolean);
            const duplicateNames = (result?.duplicates || [])
                .slice(0, 2)
                .map(item => item.fileName)
                .join('、');

            if (importedIds.length > 0) {
                setSelectedIds(prev => new Set([...prev, ...importedIds]));
            }

            if (duplicateCount > 0) {
                const duplicateSummary = duplicateNames
                    ? `重复文件已跳过：${duplicateNames}${duplicateCount > 2 ? ' 等' : ''}。`
                    : '重复文件已跳过。';

                setImportNotice({
                    type: importedCount > 0 ? 'warning' : 'info',
                    summary: `已导入 ${importedCount} 个新文件，跳过 ${duplicateCount} 个重复文件。${duplicateSummary} 只有从库里删除对应记录后，才能再次导入同一文件。`,
                    duplicates: result?.duplicates || [],
                });
            } else {
                setImportNotice({
                    type: 'success',
                    summary: `已导入 ${importedCount} 个新文件，已自动选中，可以直接逐张批量识别。`,
                    duplicates: [],
                });
            }
        } catch (err) {
            console.error('导入失败:', err);
            setImportNotice({
                type: 'error',
                summary: `导入失败：${err.message}`,
                duplicates: [],
            });
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    const openFilePicker = (type) => {
        uploadTypeRef.current = type;
        setUploadType(type);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        fileInputRef.current?.click();
    };

    const handleDragStart = (e, file) => {
        e.dataTransfer.setData('application/json', JSON.stringify(file));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    // 单个文件识别（异步，不阻塞 UI）
    const recognizeFile = async (fileId, forceRecognize = false, options = {}) => {
        addRecognizingFile(fileId);
        try {
            const result = await recognizeFromFile(projectId, fileId, forceRecognize, options);
            if (result?.needConfirm) {
                return { status: 'needConfirm', fileId, result };
            }
            // 识别成功后从选中列表移除
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(fileId);
                return newSet;
            });
            return { status: 'success', fileId, result };
        } catch (err) {
            console.error('识别失败:', err);
            return { status: 'failed', fileId, error: err };
        } finally {
            removeRecognizingFile(fileId);
        }
    };

    // 拖拽识别
    const handleDrop = async (file) => {
        if (!file || file.status === 'recognized') return;
        await recognizeFile(file.id, false);
    };

    // 强制识别重复文件
    const handleForceRecognize = async (file) => {
        await recognizeFile(file.id, true);
    };

    // 批量识别：逐张排队，避免多个 OCR 请求同时打到模型服务。
    const handleBatchRecognize = async () => {
        const toRecognize = Array.from(selectedIds).filter(id => !recognizingFileIds.has(id));
        if (toRecognize.length === 0) return;

        const failures = [];
        const needConfirm = [];
        let successCount = 0;

        for (let index = 0; index < toRecognize.length; index += 1) {
            const fileId = toRecognize[index];
            setBatchProgress({ current: index + 1, total: toRecognize.length });

            const result = await recognizeFile(fileId, false, { refresh: false });
            if (result?.status === 'success') {
                successCount += 1;
            } else if (result?.status === 'needConfirm') {
                needConfirm.push(fileId);
            } else if (result?.status === 'failed') {
                failures.push({
                    fileId,
                    message: result.error?.message || '识别失败',
                });
            }
        }

        setBatchProgress(null);
        await Promise.all([
            fetchPreviewFiles(projectId),
            fetchRecords(projectId),
            fetchPendingMatches(),
            fetchProjects(),
        ]);

        if (failures.length > 0 || needConfirm.length > 0) {
            const parts = [`已识别 ${successCount} 个`];
            if (failures.length > 0) {
                parts.push(`失败 ${failures.length} 个：${failures[0].message}`);
            }
            if (needConfirm.length > 0) {
                parts.push(`${needConfirm.length} 个重复文件需要单独确认`);
            }
            setImportNotice({ type: 'warning', summary: parts.join('，'), duplicates: [] });
            return;
        }

        setImportNotice({ type: 'success', summary: `已逐张识别完成 ${successCount} 个文件。`, duplicates: [] });
    };

    // 全选/取消全选
    const handleSelectAll = () => {
        const pendingFiles = previewFiles?.filter(f => f.status === 'preview') || [];
        if (selectedIds.size === pendingFiles.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(pendingFiles.map(f => f.id)));
        }
    };

    // 切换单个选择
    const handleCheckboxChange = (fileId) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fileId)) {
                newSet.delete(fileId);
            } else {
                newSet.add(fileId);
            }
            return newSet;
        });
    };

    // 批量移除
    const handleBatchDiscard = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`确定要移除选中的 ${selectedIds.size} 个文件吗？`)) return;

        try {
            for (const fileId of selectedIds) {
                await discardFile(projectId, fileId);
            }
            setSelectedIds(new Set());
            fetchPreviewFiles(projectId);
        } catch (err) {
            console.error('移除失败:', err);
            alert('移除失败: ' + err.message);
        }
    };

    const handleRefresh = () => {
        fetchPreviewFiles(projectId);
        fetchRecords(projectId);
    };

    const handleDuplicateJump = (duplicate) => {
        if (!duplicate) return;

        if (duplicate.source === 'preview' && duplicate.previewFileId) {
            setHighlightedPendingId(duplicate.previewFileId);
            return;
        }

        if (duplicate.recordId) {
            onOpenRecord?.(duplicate.recordId);
        }
    };

    // 只显示待识别的文件（已识别的自动隐藏）
    const pendingFiles = previewFiles?.filter(f => f.status === 'preview') || [];
    const recognizedRecords = records?.filter(r => r.preview_file_id) || [];

    return (
        <div className="preview-workspace">
            <div className="preview-workspace__toolbar">
                <button
                    className="btn--upload-invoice"
                    onClick={() => openFilePicker('invoice')}
                    disabled={importing}
                >
                    <UploadIcon />
                    导入发票
                </button>

                <button
                    className="btn--upload-payment"
                    onClick={() => openFilePicker('payment')}
                    disabled={importing}
                >
                    <UploadIcon />
                    导入付款凭证
                </button>

                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,image/*"
                    onChange={handleFileUpload}
                    disabled={importing}
                    style={{ display: 'none' }}
                />

                <button
                    className="btn--toolbar-ghost"
                    onClick={handleRefresh}
                    disabled={importing}
                >
                    <RefreshIcon />
                    刷新
                </button>

                {selectedIds.size > 0 && (
                    <>
                        <button
                            className="btn--primary"
                            onClick={handleBatchRecognize}
                            disabled={recognizingFileIds.size > 0}
                        >
                            <BatchIcon />
                            逐张识别 ({selectedIds.size})
                        </button>
                        <button className="btn--discard" onClick={handleBatchDiscard}>
                            <TrashIcon />
                            移除选中
                        </button>
                    </>
                )}

                <div className="preview-workspace__stats">
                    <span>待处理: <strong className="preview-workspace__stat-value">{stats.total}</strong></span>
                    <span>新文件: <strong className="preview-workspace__stat-value preview-workspace__stat-value--success">{stats.preview}</strong></span>
                    <span>重复: <strong className="preview-workspace__stat-value preview-workspace__stat-value--warning">{stats.duplicates}</strong></span>
                    {recognizingFileIds.size > 0 && (
                        <span className="preview-workspace__stat-value--info">
                            识别中: {recognizingFileIds.size}
                        </span>
                    )}
                    {batchProgress && (
                        <span className="preview-workspace__stat-value--info">
                            进度: {batchProgress.current}/{batchProgress.total}
                        </span>
                    )}
                </div>
            </div>

            {importNotice.summary && (
                <div className={`preview-workspace__notice preview-workspace__notice--${importNotice.type}`}>
                    <div className="preview-workspace__notice-body">
                        <span>{importNotice.summary}</span>
                        {importNotice.duplicates?.length > 0 && (
                            <div className="preview-workspace__notice-duplicates">
                                {(importNotice.duplicates || []).map((item, index) => {
                                    const label = item.recordIndex
                                        ? `记录 #${item.recordIndex} · ${item.fileName}`
                                        : item.source === 'preview'
                                            ? `预览区文件 · ${item.fileName}`
                                            : item.fileName;

                                    return (
                                        <button
                                            key={`${item.recordId || item.previewFileId || item.originalId || item.fileName}-${index}`}
                                            type="button"
                                            className="preview-workspace__notice-link"
                                            onClick={() => handleDuplicateJump(item)}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="preview-workspace__notice-close"
                        onClick={() => setImportNotice({ type: '', summary: '', duplicates: [] })}
                        aria-label="关闭导入提示"
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="preview-workspace__main">
                <div className="preview-workspace__panel preview-workspace__panel--scrollable">
                    <h3 className="preview-workspace__panel-title">导入凭证</h3>
                    {importing ? (
                        <div className="preview-workspace__loading">导入中...</div>
                    ) : (
                        <ThumbnailGrid
                            files={pendingFiles}
                            selectedIds={selectedIds}
                            recognizingIds={recognizingFileIds}
                            focusedFileId={highlightedPendingId}
                            onSelect={(file) => handleCheckboxChange(file.id)}
                            onDragStart={handleDragStart}
                            onCheckboxChange={handleCheckboxChange}
                            onSelectAll={handleSelectAll}
                        />
                    )}
                </div>

                <div className="preview-workspace__panel">
                    <h3 className="preview-workspace__panel-title">识别与入表</h3>
                    <RecognizeDropZone
                        isOver={isDragOver}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        recognizedRecords={recognizedRecords}
                        onForceRecognize={handleForceRecognize}
                    />
                </div>
            </div>
        </div>
    );
}

export default PreviewWorkspace;
