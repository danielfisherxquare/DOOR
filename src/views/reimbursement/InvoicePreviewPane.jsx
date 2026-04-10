/**
 * Invoice Preview Pane
 * 发票预览组件 - 展示发票大图和 OCR 结果编辑
 */

import { useState, useEffect } from 'react';
import { CommandPanel } from '../../components/command/CommandPrimitives';
import request from '../../utils/request';

const EditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);

const SaveIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const ImportIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="14 16 10 12 14 8" />
        <line x1="20" y1="12" x2="10" y2="12" />
        <path d="M4 20a8 8 0 0 1 8-8" />
    </svg>
);

const SUB_CATEGORIES = [
    '备用金收入', '打车费', '高速费', '高铁费', '机票费', '停车费',
    '加油费', '租车费', '托运费', '餐费', '住宿费', '保险费',
    '物资采购费', '快递费', '劳务费', '印刷费', '租赁费',
    '运输费', '备用金支出', '其他费用',
];

function OCRResultForm({ invoice, onSave, saving, onImportToRecords, importing }) {
    const [editing, setEditing] = useState(false);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (invoice?.ocrResult) {
            setFormData({ ...invoice.ocrResult });
        }
    }, [invoice?.ocrResult]);

    const handleSave = async () => {
        await onSave(invoice.id, formData);
        setEditing(false);
    };

    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    if (!invoice.ocrResult) {
        return (
            <div className="ocr-empty-state">
                <p>OCR 识别结果将在这里显示</p>
                {invoice.status === 'processing' && (
                    <p className="hint">正在处理中，请稍候...</p>
                )}
                {invoice.status === 'error' && (
                    <p className="error">识别失败：{invoice.errorMessage}</p>
                )}
            </div>
        );
    }

    return (
        <div className="ocr-result-form">
            <div className="ocr-form-header">
                <h4>识别结果</h4>
                <div className="ocr-form-actions">
                    {editing ? (
                        <>
                            <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => {
                                    setFormData({ ...invoice.ocrResult });
                                    setEditing(false);
                                }}
                            >
                                取消
                            </button>
                            <button
                                className="btn btn--primary btn--sm"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                <SaveIcon />
                                {saving ? '保存中...' : '保存'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => setEditing(true)}
                            >
                                <EditIcon />
                                编辑
                            </button>
{invoice.status === 'completed' && invoice.fileType === 'invoice' && !invoice.imported && (
                                  <button
                                      className="btn btn--primary btn--sm"
                                      onClick={() => onImportToRecords?.(invoice)}
                                      disabled={importing}
                                 >
                                     <ImportIcon />
                                     {importing ? '导入中...' : '导入报销明细'}
                                 </button>
                             )}
                             {invoice.imported && (
                                 <span className="invoice-imported-badge">
                                     <CheckIcon />
                                     已导入
                                 </span>
                             )}
                        </>
                    )}
                </div>
            </div>

            <div className="ocr-form-grid">
                <div className="ocr-form-field">
                    <label>金额</label>
                    {editing ? (
                        <input
                            type="number"
                            step="0.01"
                            value={formData.amount || ''}
                            onChange={(e) => handleChange('amount', parseFloat(e.target.value) || 0)}
                        />
                    ) : (
                        <div className="ocr-form-value">¥{Number(formData.amount || 0).toFixed(2)}</div>
                    )}
                </div>

                <div className="ocr-form-field">
                    <label>日期</label>
                    {editing ? (
                        <input
                            type="date"
                            value={formData.date ? formData.date.substring(0, 10) : ''}
                            onChange={(e) => handleChange('date', e.target.value)}
                        />
                    ) : (
                        <div className="ocr-form-value">{formData.date || '-'}</div>
                    )}
                </div>

                <div className="ocr-form-field ocr-form-field--wide">
                    <label>购买方</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.buyer || ''}
                            onChange={(e) => handleChange('buyer', e.target.value)}
                        />
                    ) : (
                        <div className="ocr-form-value">{formData.buyer || '-'}</div>
                    )}
                </div>

                <div className="ocr-form-field ocr-form-field--wide">
                    <label>明细</label>
                    {editing ? (
                        <input
                            type="text"
                            value={formData.details || ''}
                            onChange={(e) => handleChange('details', e.target.value)}
                        />
                    ) : (
                        <div className="ocr-form-value">{formData.details || '-'}</div>
                    )}
                </div>

                <div className="ocr-form-field">
                    <label>费用类别</label>
                    {editing ? (
                        <select
                            value={formData.subCategory || ''}
                            onChange={(e) => handleChange('subCategory', e.target.value)}
                        >
                            <option value="">请选择</option>
                            {SUB_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div className="ocr-form-value">{formData.subCategory || '-'}</div>
                    )}
                </div>

                <div className="ocr-form-field">
                    <label>单价</label>
                    {editing ? (
                        <input
                            type="number"
                            step="0.01"
                            value={formData.unitPrice || ''}
                            onChange={(e) => handleChange('unitPrice', parseFloat(e.target.value) || null)}
                        />
                    ) : (
                        <div className="ocr-form-value">
                            {formData.unitPrice != null ? `¥${formData.unitPrice.toFixed(2)}` : '-'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function InvoicePreviewPane({ invoice, projectId, onOCRUpdated, onImportToRecords, importing }) {
    const [saving, setSaving] = useState(false);
    const [imageError, setImageError] = useState(false);

    const getImageUrl = () => {
        if (!invoice) return null;
        return `/api/app/reimbursements/invoices/${projectId}/${invoice.id}/image?type=original`;
    };

    const handleOCRSave = async (invoiceId, ocrResult) => {
        setSaving(true);
        try {
            const result = await request.put(`/app/reimbursements/invoices/${projectId}/${invoiceId}/ocr`, { ocrResult });
            onOCRUpdated(invoiceId, result.ocrResult || ocrResult);
        } catch (error) {
            console.error('保存 OCR 结果失败:', error);
            alert(`保存失败：${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    if (!invoice) {
        return (
            <CommandPanel title="发票预览" subtitle="从左侧选择一张发票">
                <div className="empty-state">
                    <p>请选择一张发票查看详情</p>
                </div>
            </CommandPanel>
        );
    }

    const imageUrl = getImageUrl();

    return (
        <div className="invoice-preview-pane">
            {/* 发票图片预览 */}
            <div className="invoice-preview-image-section">
                <div className="invoice-preview-header">
                    <h4>原始凭证</h4>
                    <span className="invoice-file-name">{invoice.fileName}</span>
                </div>
                <div className="invoice-image-container">
                    {imageUrl && !imageError ? (
                        <img
                            src={imageUrl}
                            alt={invoice.fileName}
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="invoice-image-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <p>图片加载失败</p>
                        </div>
                    )}
                </div>
            </div>

            {/* OCR 结果编辑 */}
            <div className="invoice-preview-ocr-section">
                <OCRResultForm
                    invoice={invoice}
                    onSave={handleOCRSave}
                    saving={saving}
                    onImportToRecords={onImportToRecords}
                    importing={importing}
                />
            </div>
        </div>
    );
}

export default InvoicePreviewPane;
