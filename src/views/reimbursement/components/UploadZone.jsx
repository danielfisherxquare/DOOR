/**
 * Upload Zone
 * 文件上传区域组件
 * 支持发票和付款凭证上传，集成处理追踪
 */

import { useState, useCallback } from 'react';
import useReimbursementStore from '../../../stores/reimbursementStore';

const FileIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const ImageIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

function UploadZone() {
  const {
    activeProjectId,
    llmConfig,
    hasServerLlmConfig,
    processInvoiceOcr,
    processPaymentOcr,
    addRecord,
    fetchProcessingStats,
    fetchRecords,
  } = useReimbursementStore();

  const [isDraggingInvoice, setIsDraggingInvoice] = useState(false);
  const [isDraggingPayment, setIsDraggingPayment] = useState(false);
  const [processing, setProcessing] = useState({ invoice: false, payment: false });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [stats, setStats] = useState({ success: 0, skipped: 0, failed: 0, pending: 0 });

  const hasLlmConfig = Boolean(hasServerLlmConfig || (llmConfig.apiKey && llmConfig.baseUrl));

  // 处理发票上传
  const handleInvoiceUpload = useCallback(async (files) => {
    if (!activeProjectId) {
      setMessage({ type: 'error', text: '请先选择项目' });
      return;
    }
    if (!hasLlmConfig) {
      setMessage({ type: 'error', text: '请先配置模型 API，或确认服务端已配置默认 OCR 模型' });
      return;
    }

    setProcessing((p) => ({ ...p, invoice: true }));
    setMessage({ type: 'info', text: '正在识别发票...' });
    setStats({ success: 0, skipped: 0, failed: 0, pending: 0 });

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      for (const file of files) {
        try {
          const result = await processInvoiceOcr(file);
          if (result.skipped) {
            skippedCount++;
          } else if (result.success && result.data) {
            await addRecord({
              payment_date: result.data.date,
              category: result.data.category,
              sub_category: result.data.subCategory,
              description: result.data.details,
              expense: result.data.amount,
              company: result.data.buyer,
              has_invoice: true,
              unit_price: result.data.unitPrice,
              unit: result.data.unit,
              quantity: result.data.quantity,
            });
            successCount++;
          } else {
            failedCount++;
          }
        } catch (err) {
          failedCount++;
          console.error(`处理发票 ${file.name} 失败:`, err);
        }
      }

      // 刷新统计数据
      await fetchProcessingStats();
      await fetchRecords(activeProjectId);

      // 构建结果消息
      const messages = [];
      if (successCount > 0) messages.push(`成功 ${successCount}`);
      if (skippedCount > 0) messages.push(`跳过重复 ${skippedCount}`);
      if (failedCount > 0) messages.push(`失败 ${failedCount}`);

      setMessage({
        type: failedCount > 0 ? 'warning' : 'success',
        text: `处理完成: ${messages.join(', ')}`,
      });
      setStats({ success: successCount, skipped: skippedCount, failed: failedCount, pending: 0 });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }

    setProcessing((p) => ({ ...p, invoice: false }));
  }, [activeProjectId, hasLlmConfig, processInvoiceOcr, addRecord, fetchProcessingStats, fetchRecords]);

  // 处理付款凭证上传
  const handlePaymentUpload = useCallback(async (files) => {
    if (!activeProjectId) {
      setMessage({ type: 'error', text: '请先选择项目' });
      return;
    }
    if (!hasLlmConfig) {
      setMessage({ type: 'error', text: '请先配置模型 API，或确认服务端已配置默认 OCR 模型' });
      return;
    }

    setProcessing((p) => ({ ...p, payment: true }));
    setMessage({ type: 'info', text: '正在识别付款凭证...' });
    setStats({ success: 0, skipped: 0, failed: 0, pending: 0 });

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    try {
      for (const file of files) {
        try {
          const result = await processPaymentOcr(file);
          if (result.skipped) {
            skippedCount++;
          } else if (result.success && result.data) {
            // 检查匹配结果
            if (result.matchResult?.autoMatched) {
              // 已自动匹配
              successCount++;
            } else if (result.matchResult?.pendingMatch) {
              // 需要手动匹配
              pendingCount++;
            } else if (result.matchResult?.createdRecord || result.recordId) {
              successCount++;
            } else {
              failedCount++;
            }
          } else {
            failedCount++;
          }
        } catch (err) {
          failedCount++;
          console.error(`处理付款凭证 ${file.name} 失败:`, err);
        }
      }

      // 刷新统计数据
      await fetchProcessingStats();
      await fetchRecords(activeProjectId);

      // 构建结果消息
      const messages = [];
      if (successCount > 0) messages.push(`成功 ${successCount}`);
      if (skippedCount > 0) messages.push(`跳过重复 ${skippedCount}`);
      if (pendingCount > 0) messages.push(`待匹配 ${pendingCount}`);
      if (failedCount > 0) messages.push(`失败 ${failedCount}`);

      setMessage({
        type: pendingCount > 0 || failedCount > 0 ? 'warning' : 'success',
        text: `处理完成: ${messages.join(', ')}`,
      });
      setStats({ success: successCount, skipped: skippedCount, failed: failedCount, pending: pendingCount });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }

    setProcessing((p) => ({ ...p, payment: false }));
  }, [activeProjectId, hasLlmConfig, processPaymentOcr, fetchProcessingStats, fetchRecords]);

  // 拖拽处理
  const handleDragOver = (e, type) => {
    e.preventDefault();
    if (type === 'invoice') setIsDraggingInvoice(true);
    else setIsDraggingPayment(true);
  };

  const handleDragLeave = (type) => {
    if (type === 'invoice') setIsDraggingInvoice(false);
    else setIsDraggingPayment(false);
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (type === 'invoice') {
      setIsDraggingInvoice(false);
      handleInvoiceUpload(files);
    } else {
      setIsDraggingPayment(false);
      handlePaymentUpload(files);
    }
  };

  return (
    <div className="upload-zone">
      {/* 消息提示 */}
      {message.text && (
        <div className={`upload-zone__message upload-zone__message--${message.type}`}>
          {message.text}
          <button onClick={() => setMessage({ type: '', text: '' })}>✕</button>
        </div>
      )}

      {/* 处理统计 */}
      {(stats.success > 0 || stats.skipped > 0 || stats.pending > 0) && (
        <div className="upload-zone__stats">
          {stats.success > 0 && (
            <span className="upload-zone__stat upload-zone__stat--success">
              ✓ 成功 {stats.success}
            </span>
          )}
          {stats.skipped > 0 && (
            <span className="upload-zone__stat upload-zone__stat--skipped">
              ⊘ 跳过 {stats.skipped}
            </span>
          )}
          {stats.pending > 0 && (
            <span className="upload-zone__stat upload-zone__stat--pending">
              ⏳ 待匹配 {stats.pending}
            </span>
          )}
        </div>
      )}

      <div className="upload-zone__grid">
        {/* 发票上传区 */}
        <div
          className={`upload-zone__area ${isDraggingInvoice ? 'dragging' : ''}`}
          onDragOver={(e) => handleDragOver(e, 'invoice')}
          onDragLeave={() => handleDragLeave('invoice')}
          onDrop={(e) => handleDrop(e, 'invoice')}
        >
          <input
            type="file"
            id="invoice-upload"
            multiple
            accept=".pdf,image/*"
            aria-labelledby="invoice-upload-title"
            aria-describedby="invoice-upload-desc"
            style={{ display: 'none' }}
            onChange={(e) => handleInvoiceUpload(Array.from(e.target.files))}
            disabled={!activeProjectId || processing.invoice}
          />
          <label htmlFor="invoice-upload" className="upload-zone__label">
            <FileIcon />
            <h3 id="invoice-upload-title">上传发票</h3>
            <p id="invoice-upload-desc">支持 PDF、图片格式</p>
            <p className="upload-zone__hint">识别：金额、日期、开票方、类别</p>
            {processing.invoice && <span className="upload-zone__processing">处理中...</span>}
          </label>
        </div>

        {/* 付款凭证上传区 */}
        <div
          className={`upload-zone__area ${isDraggingPayment ? 'dragging' : ''}`}
          onDragOver={(e) => handleDragOver(e, 'payment')}
          onDragLeave={() => handleDragLeave('payment')}
          onDrop={(e) => handleDrop(e, 'payment')}
        >
          <input
            type="file"
            id="payment-upload"
            multiple
            accept=".pdf,image/*"
            aria-labelledby="payment-upload-title"
            aria-describedby="payment-upload-desc"
            style={{ display: 'none' }}
            onChange={(e) => handlePaymentUpload(Array.from(e.target.files))}
            disabled={!activeProjectId || processing.payment}
          />
          <label htmlFor="payment-upload" className="upload-zone__label">
            <ImageIcon />
            <h3 id="payment-upload-title">上传付款凭证</h3>
            <p id="payment-upload-desc">支持截图、图片格式</p>
            <p className="upload-zone__hint">识别：金额、日期、收款方</p>
            {processing.payment && <span className="upload-zone__processing">处理中...</span>}
          </label>
        </div>
      </div>

      <p className="upload-zone__tip">
        💡 提示：先上传发票，再上传付款截图，可提高自动匹配准确率
      </p>
    </div>
  );
}

export default UploadZone;
