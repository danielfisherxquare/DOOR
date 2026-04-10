/**
 * Processing Status Rail
 * 处理进度轨组件 - 可视化展示发票处理各阶段状态
 */

import { useState } from 'react';

const ProcessingSteps = {
    pending: { order: 0, label: '待处理' },
    upload_complete: { order: 1, label: '已上传' },
    pdf_rendering: { order: 2, label: 'PDF 渲染' },
    ocr_processing: { order: 3, label: 'OCR 识别' },
    saving_result: { order: 4, label: '保存结果' },
    completed: { order: 5, label: '已完成' },
    error: { order: -1, label: '处理失败' },
};

const CheckIconSmall = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const StepIndicator = ({ step, currentStatus, isLast }) => {
    const stepInfo = ProcessingSteps[step] || { label: step, order: 99 };
    const currentStepInfo = ProcessingSteps[currentStatus] || { order: -1 };

    const isCompleted = stepInfo.order < currentStepInfo.order;
    const isActive = step === currentStatus;
    const isPending = stepInfo.order > currentStepInfo.order;

    return (
        <div className="step-indicator">
            <div className={`step-dot ${isCompleted ? 'completed' : isActive ? 'active' : 'pending'}`}>
                {isCompleted ? <CheckIconSmall /> : stepInfo.order}
            </div>
            <div className="step-label">
                <span className="step-label-text">{stepInfo.label}</span>
            </div>
        </div>
    );
};

const ProcessingLog = ({ logs }) => {
    if (!logs || logs.length === 0) return null;

    const formatTime = (timestamp) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } catch {
            return '';
        }
    };

    return (
        <div className="processing-log">
            <div className="processing-log-header">处理日志</div>
            <div className="processing-log-content">
                {logs.map((log, index) => (
                    <div key={index} className="log-entry">
                        <span className="log-time">{formatTime(log.timestamp)}</span>
                        <span className="log-message">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

function ProcessingStatusRail({ invoice, onUpdate }) {
    const [showLogs, setShowLogs] = useState(false);

    if (!invoice) return null;

    const status = invoice.status || 'pending';
    const logs = invoice.processingLog || [];

    const stepOrder = ['pending', 'upload_complete', 'pdf_rendering', 'ocr_processing', 'saving_result', 'completed'];

    if (status === 'error') {
        return (
            <div className="processing-status-rail error-state">
                <div className="status-rail-header">
                    <span className="status-title">处理失败</span>
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={onUpdate}
                    >
                        重试
                    </button>
                </div>
                <div className="error-message">
                    {invoice.errorMessage || '未知错误'}
                </div>
            </div>
        );
    }

    const currentStepIndex = stepOrder.indexOf(status);

    return (
        <div className="processing-status-rail">
            <div className="status-rail-header">
                <span className="status-title">处理进度</span>
                {status === 'processing' && (
                    <span className="status-processing-indicator">
                        <span className="spinner-mini" />
                        处理中...
                    </span>
                )}
                {logs.length > 0 && (
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setShowLogs(!showLogs)}
                    >
                        {showLogs ? '隐藏日志' : `查看日志 (${logs.length})`}
                    </button>
                )}
            </div>

            <div className="status-rail-content">
                {stepOrder.map((step, index) => (
                    <StepIndicator
                        key={step}
                        step={step}
                        currentStatus={status}
                        isLast={index === stepOrder.length - 1}
                    />
                ))}
            </div>

            {showLogs && logs.length > 0 && (
                <ProcessingLog logs={logs} />
            )}
        </div>
    );
}

export default ProcessingStatusRail;