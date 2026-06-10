/**
 * RecognizeDropZone
 * 识别区拖放区域 - 接收拖拽的文件并触发识别
 */

import { useMemo, useState } from 'react';
import {
    formatOcrDuration,
    formatOcrImageSavings,
    formatOcrTokens,
    getOcrReviewStatus,
    summarizeOcrMetrics,
    summarizeOcrReview,
} from '../utils/ocrMetrics';

function RecognizedRecordCard({ record }) {
    const reviewStatus = getOcrReviewStatus(record);

    return (
        <div className="recognized-record-card">
            <div className="recognized-record-card__title">
                {record.description || record.sub_category || '未命名'}
            </div>
            <div className="recognized-record-card__meta">
                {record.payment_date && <span>📅 {record.payment_date}</span>}
                {record.expense && <span className="recognized-record-card__expense">¥{Number(record.expense).toFixed(2)}</span>}
            </div>
            {record.is_duplicate && (
                <span className="recognized-record-card__duplicate-badge">
                    重复上传
                </span>
            )}
            {reviewStatus.needsReview && (
                <span
                    className="recognized-record-card__review-badge"
                    title={reviewStatus.title || '识别字段需要人工复核'}
                >
                    需复核 {reviewStatus.issueCount}
                </span>
            )}
        </div>
    );
}

function RecognizeDropZone({
    isOver,
    onDragOver,
    onDragLeave,
    onDrop,
    recognizedRecords,
    onForceRecognize,
}) {
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingFile, setPendingFile] = useState(null);
    const ocrSummary = useMemo(
        () => summarizeOcrMetrics(recognizedRecords || []),
        [recognizedRecords],
    );
    const ocrReviewSummary = useMemo(
        () => summarizeOcrReview(recognizedRecords || []),
        [recognizedRecords],
    );

    const handleDrop = async (e) => {
        const file = e.dataTransfer.getData('application/json');
        onDragLeave();
        if (file) {
            const parsedFile = JSON.parse(file);
            if (parsedFile.isDuplicate) {
                setPendingFile(parsedFile);
                setShowConfirmModal(true);
            } else {
                const result = await onDrop(parsedFile);
                if (result?.status === 'needConfirm') {
                    setPendingFile({
                        ...parsedFile,
                        duplicateCount: result.result?.duplicateCount ?? parsedFile.duplicateCount,
                    });
                    setShowConfirmModal(true);
                }
            }
        }
    };

    const confirmForceRecognize = () => {
        if (pendingFile) {
            onForceRecognize(pendingFile, true);
        }
        setShowConfirmModal(false);
        setPendingFile(null);
    };

    const cancelForceRecognize = () => {
        setShowConfirmModal(false);
        setPendingFile(null);
    };

    return (
        <div className="recognize-drop-zone">
            <div
                className={`recognize-drop-zone__area ${isOver ? 'recognize-drop-zone__area--active' : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={handleDrop}
            >
                {isOver ? (
                    <>
                        <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span className="recognize-drop-zone__text recognize-drop-zone__text--active">
                            松开开始识别
                        </span>
                    </>
                ) : (
                    <>
                        <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                        >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        <span className="recognize-drop-zone__text">
                            拖拽文件到这里识别
                        </span>
                        <span className="recognize-drop-zone__hint">
                            支持发票和付款凭证
                        </span>
                    </>
                )}
            </div>

            <div className="recognized-records">
                <div className="recognized-records__header">
                    <span>已识别记录</span>
                    <div className="recognized-records__summary">
                        <span>{recognizedRecords?.length || 0} 条</span>
                        {ocrSummary.coveredRecordCount > 0 && (
                            <>
                                <span>Token {formatOcrTokens(ocrSummary.totalTokens)}</span>
                                <span>平均耗时 {formatOcrDuration(ocrSummary.averageDurationMs)}</span>
                                {ocrSummary.imageOptimization.savedBytes > 0 && (
                                    <span>图片压缩 {formatOcrImageSavings(ocrSummary.imageOptimization)}</span>
                                )}
                            </>
                        )}
                        {ocrReviewSummary.needsReviewCount > 0 && (
                            <span>需复核 {ocrReviewSummary.needsReviewCount}</span>
                        )}
                    </div>
                </div>
                {recognizedRecords && recognizedRecords.length > 0 ? (
                    <div className="recognized-records__list">
                        {recognizedRecords.map((record) => (
                            <RecognizedRecordCard key={record.id} record={record} />
                        ))}
                    </div>
                ) : (
                    <div className="recognized-records__empty">
                        暂无已识别记录
                    </div>
                )}
            </div>

            {showConfirmModal && (
                <div className="invoice-modal-overlay" onClick={cancelForceRecognize}>
                    <div className="invoice-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="invoice-modal-header">
                            <h2>重复文件提醒</h2>
                        </div>
                        <div className="invoice-modal-body">
                            <p className="upload-hint">
                                该文件已上传过 {pendingFile?.duplicateCount || 1} 次。
                                <br />
                                是否强制识别并添加到记录中？
                            </p>
                            <div className="recognize-drop-zone__modal-actions">
                                <button
                                    className="btn btn--ghost"
                                    onClick={cancelForceRecognize}
                                >
                                    取消
                                </button>
                                <button
                                    className="btn btn--primary btn--warning"
                                    onClick={confirmForceRecognize}
                                >
                                    强制识别
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RecognizeDropZone;
