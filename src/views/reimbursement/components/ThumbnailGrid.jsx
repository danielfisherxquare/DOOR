/**
 * ThumbnailGrid
 * 缩略图网格组件 - 平铺展示，支持拖拽、多选和识别状态显示
 */

import { useEffect, useRef } from 'react';

const STATUS_LABELS = {
    preview: '待识别',
    recognized: '已识别',
    error: '失败',
    recognizing: '识别中',
};

const DOCUMENT_TYPE_LABELS = {
    invoice: '发票',
    payment: '付款凭证',
};

function getBorderClass(file, isRecognizing) {
    if (isRecognizing) return 'thumbnail-card--recognizing';
    if (file.status === 'recognized') return 'thumbnail-card--recognized';
    if (file.status === 'error') return 'thumbnail-card--error';
    if (file.isDuplicate) return 'thumbnail-card--duplicate';
    return 'thumbnail-card--new';
}

function DuplicateBadge({ count }) {
    if (!count || count === 0) return null;
    return (
        <span className="thumbnail-badge thumbnail-badge--duplicate">
            重复 {count}
        </span>
    );
}

function PageCountBadge({ count }) {
    if (!count || count <= 1) return null;
    return (
        <span className="thumbnail-badge thumbnail-badge--pages">
            {count}页
        </span>
    );
}

function ThumbnailCard({ file, isSelected, isRecognizing, isFocused, onSelect, onDragStart, onCheckboxChange, onRegister }) {
    const borderClass = getBorderClass(file, isRecognizing);

    const handleCheckboxClick = (e) => {
        e.stopPropagation();
        onCheckboxChange(file.id);
    };

    return (
        <div
            ref={(node) => onRegister(file.id, node)}
            className={`thumbnail-card ${borderClass} ${isSelected ? 'thumbnail-card--selected' : ''} ${isFocused ? 'thumbnail-card--focused' : ''}`}
            draggable={!isRecognizing}
            onDragStart={(e) => !isRecognizing && onDragStart(e, file)}
            onClick={() => !isRecognizing && onSelect(file)}
        >
            <div className="thumbnail-card__checkbox">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={handleCheckboxClick}
                    disabled={isRecognizing}
                />
            </div>

            <div className="thumbnail-card__image">
                {file.thumbnailBase64 ? (
                    <img src={file.thumbnailBase64} alt={file.fileName} />
                ) : (
                    <div className="thumbnail-card__placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                    </div>
                )}
            </div>

            <div className="thumbnail-card__filename" title={file.fileName}>
                {file.fileName}
            </div>

            <div className="thumbnail-card__type-badge">
                {DOCUMENT_TYPE_LABELS[file.documentType] || '凭证'}
            </div>

            {isRecognizing ? (
                <div className="thumbnail-card__status thumbnail-card__status--recognizing">
                    识别中...
                </div>
            ) : (
                <div className={`thumbnail-card__status thumbnail-card__status--${file.status === 'recognized' ? 'recognized' : file.status === 'error' ? 'error' : file.isDuplicate ? 'duplicate' : 'new'}`}>
                    {STATUS_LABELS[file.status] || file.status}
                </div>
            )}

            <DuplicateBadge count={file.duplicateCount} />
            <PageCountBadge count={file.pageCount} />
        </div>
    );
}

function Legend() {
    return (
        <div className="thumbnail-legend">
            <span className="thumbnail-legend__item">
                <span className="thumbnail-legend__dot thumbnail-legend__dot--new" />
                新文件
            </span>
            <span className="thumbnail-legend__item">
                <span className="thumbnail-legend__dot thumbnail-legend__dot--duplicate" />
                重复
            </span>
            <span className="thumbnail-legend__item">
                <span className="thumbnail-legend__dot thumbnail-legend__dot--recognizing" />
                识别中
            </span>
            <span className="thumbnail-legend__item">
                <span className="thumbnail-legend__dot thumbnail-legend__dot--error" />
                失败
            </span>
        </div>
    );
}

function ThumbnailGrid({
    files,
    selectedIds,
    recognizingIds,
    focusedFileId,
    onSelect,
    onDragStart,
    onCheckboxChange,
    onSelectAll,
}) {
    const cardRefs = useRef({});
    const allSelected = files && files.length > 0 && files.every(f => selectedIds?.has(f.id));
    const someSelected = files && files.some(f => selectedIds?.has(f.id));

    useEffect(() => {
        if (!focusedFileId) return;
        const target = cardRefs.current[focusedFileId];
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [focusedFileId, files]);

    const handleRegister = (fileId, node) => {
        if (node) {
            cardRefs.current[fileId] = node;
            return;
        }
        delete cardRefs.current[fileId];
    };

    if (!files || files.length === 0) {
        return (
            <div className="thumbnail-grid-empty">
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                </svg>
                <p>预览区为空</p>
                <p className="thumbnail-grid-empty__hint">上传文件后会在这里显示</p>
            </div>
        );
    }

    return (
        <div>
            <div className="thumbnail-grid__header">
                <label className="thumbnail-grid__select-all">
                    <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => el && (el.indeterminate = someSelected && !allSelected)}
                        onChange={onSelectAll}
                    />
                    全选
                </label>
                <span className="thumbnail-grid__count">
                    {files.length} 个文件
                    {selectedIds?.size > 0 && ` · 已选 ${selectedIds.size} 个`}
                    {recognizingIds?.size > 0 && ` · 识别中 ${recognizingIds.size} 个`}
                </span>
            </div>
            <Legend />
            <div className="thumbnail-grid">
                {files.map((file) => (
                    <ThumbnailCard
                        key={file.id}
                        file={file}
                        isSelected={selectedIds?.has(file.id)}
                        isRecognizing={recognizingIds?.has(file.id)}
                        isFocused={focusedFileId === file.id}
                        onSelect={onSelect}
                        onDragStart={onDragStart}
                        onCheckboxChange={onCheckboxChange}
                        onRegister={handleRegister}
                    />
                ))}
            </div>
        </div>
    );
}

export default ThumbnailGrid;
