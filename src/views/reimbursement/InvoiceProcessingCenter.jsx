/**
 * Invoice Processing Center
 * 发票处理中心 - 可视化展示发票处理全过程
 * 作为内嵌组件使用，接受 projectId 作为 prop
 */

import { useEffect, useState, useCallback } from 'react';
import { CommandPanel, CommandNotice } from '../../components/command/CommandPrimitives';
import InvoiceThumbnailList from './InvoiceThumbnailList';
import InvoicePreviewPane from './InvoicePreviewPane';
import ProcessingStatusRail from './ProcessingStatusRail';
import request from '../../utils/request';
import './invoice-processing.css';

const RefreshIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

const UploadIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

const PaymentIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
);

const ImportIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="14 16 10 12 14 8" />
        <line x1="20" y1="12" x2="10" y2="12" />
        <path d="M4 20a8 8 0 0 1 8-8" />
    </svg>
);

function InvoiceProcessingCenter({ projectId, onImportToRecords }) {
    const [invoices, setInvoices] = useState([]);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [stats, setStats] = useState({ total: 0, pending: 0, processing: 0, completed: 0, error: 0 });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [uploadType, setUploadType] = useState('invoice');
    const [importingInvoiceId, setImportingInvoiceId] = useState(null);

    const fetchQueue = useCallback(async () => {
        try {
            const data = await request.get(`/app/reimbursements/invoices/processing-queue/${projectId}`);
            setInvoices(data.queue || []);

            const newStats = { total: 0, pending: 0, processing: 0, completed: 0, error: 0 };
            (data.queue || []).forEach(inv => {
                newStats.total++;
                newStats[inv.status] = (newStats[inv.status] || 0) + 1;
            });
            setStats(newStats);

            setSelectedInvoice((current) => {
                if (!current) return current;
                return data.queue.find(inv => inv.id === current.id) || current;
            });
        } catch (error) {
            console.error('获取处理队列失败:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (projectId) {
            fetchQueue();
            const interval = setInterval(fetchQueue, 3000);
            return () => clearInterval(interval);
        }
    }, [projectId, fetchQueue]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchQueue();
    };

    const handleInvoiceSelect = (invoice) => {
        setSelectedInvoice(invoice);
    };

    const handleUploadComplete = () => {
        setShowUpload(false);
        fetchQueue();
    };

    const handleOCRUpdated = (invoiceId, newOCRResult) => {
        setInvoices(prev => prev.map(inv =>
            inv.id === invoiceId
                ? { ...inv, ocrResult: newOCRResult }
                : inv
        ));
        if (selectedInvoice?.id === invoiceId) {
            setSelectedInvoice(prev => ({ ...prev, ocrResult: newOCRResult }));
        }
    };

    const handleImportToRecords = async (invoice) => {
        if (!invoice?.ocrResult || !projectId) return;

        setImportingInvoiceId(invoice.id);

        try {
            const ocrData = invoice.ocrResult;

            const recordData = {
                payment_date: ocrData.date || '',
                invoice_code: ocrData.invoiceCode || '',
                invoice_number: ocrData.invoiceNumber || '',
                category: ocrData.category || '',
                sub_category: ocrData.subCategory || '',
                description: ocrData.details || invoice.fileName,
                expense: parseFloat(ocrData.amount) || 0,
                company: ocrData.buyer || '',
                has_invoice: true,
                unit_price: ocrData.unitPrice ?? null,
                unit: ocrData.unit || null,
                quantity: ocrData.quantity ?? null,
                remarks: '[发票处理中心导入]',
                processed_file_id: invoice.id,
                file_type: invoice.fileType || 'invoice',
                file_name: invoice.fileName,
            };

            const result = await request.post(`/app/reimbursements/projects/${projectId}/records`, recordData);

            setInvoices(prev => prev.map(inv =>
                inv.id === invoice.id
                    ? { ...inv, imported: true, importedRecordId: result.record?.id }
                    : inv
            ));

            if (selectedInvoice?.id === invoice.id) {
                setSelectedInvoice(prev => ({ ...prev, imported: true, importedRecordId: result.record?.id }));
            }

            if (onImportToRecords) {
                onImportToRecords();
            }

            alert(`发票 "${invoice.fileName}" 已成功导入到报销明细`);
        } catch (err) {
            console.error('导入报销明细失败:', err);
            alert(`导入失败：${err.message}`);
        } finally {
            setImportingInvoiceId(null);
        }
    };

    const handleBatchImport = async () => {
        const completedInvoices = invoices.filter(
            (inv) => inv.status === 'completed' && inv.fileType === 'invoice' && !inv.imported
        );

        if (completedInvoices.length === 0) {
            alert('没有可导入的发票');
            return;
        }

        if (!confirm(`确定要导入 ${completedInvoices.length} 张发票到报销明细吗？`)) {
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const invoice of completedInvoices) {
            try {
                const ocrData = invoice.ocrResult;
                const recordData = {
                    payment_date: ocrData.date || '',
                    invoice_code: ocrData.invoiceCode || '',
                    invoice_number: ocrData.invoiceNumber || '',
                    category: ocrData.category || '',
                    sub_category: ocrData.subCategory || '',
                    description: ocrData.details || invoice.fileName,
                    expense: parseFloat(ocrData.amount) || 0,
                    company: ocrData.buyer || '',
                    has_invoice: true,
                    unit_price: ocrData.unitPrice ?? null,
                    unit: ocrData.unit || null,
                    quantity: ocrData.quantity ?? null,
                    remarks: '[发票处理中心导入]',
                    processed_file_id: invoice.id,
                    file_type: invoice.fileType || 'invoice',
                    file_name: invoice.fileName,
                };

                await request.post(`/app/reimbursements/projects/${projectId}/records`, recordData);
                successCount++;
                setInvoices(prev => prev.map(inv =>
                    inv.id === invoice.id
                        ? { ...inv, imported: true }
                        : inv
                ));
            } catch (_err) {
                failCount++;
            }
        }

        alert(`批量导入完成：成功 ${successCount} 张，失败 ${failCount} 张`);

        if (onImportToRecords) {
            onImportToRecords();
        }
    };

    const completedCount = invoices.filter(inv => inv.status === 'completed' && !inv.imported).length;

    return (
        <div className="invoice-processing-page">
            <div className="invoice-stats-strip">
                <div className="invoice-stat-card">
                    <span className="invoice-stat-value">{stats.total}</span>
                    <span className="invoice-stat-label">总计</span>
                </div>
                <div className="invoice-stat-card invoice-stat-card--processing">
                    <span className="invoice-stat-value">{stats.processing}</span>
                    <span className="invoice-stat-label">处理中</span>
                </div>
                <div className="invoice-stat-card invoice-stat-card--completed">
                    <span className="invoice-stat-value">{stats.completed}</span>
                    <span className="invoice-stat-label">已完成</span>
                </div>
                <div className="invoice-stat-card invoice-stat-card--error">
                    <span className="invoice-stat-value">{stats.error}</span>
                    <span className="invoice-stat-label">失败</span>
                </div>
            </div>

            <div className="invoice-processing-toolbar">
                <div className="invoice-processing-actions">
                    <button
                        className={`btn btn--ghost ${refreshing ? 'spinning' : ''}`}
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        <RefreshIcon />
                        {refreshing ? '刷新中...' : '刷新'}
                    </button>
                    <button
                        className="btn btn--primary"
                        onClick={() => {
                            setUploadType('invoice');
                            setShowUpload(true);
                        }}
                    >
                        <UploadIcon />
                        上传发票
                    </button>
                    <button
                        className="btn btn--secondary"
                        onClick={() => {
                            setUploadType('payment');
                            setShowUpload(true);
                        }}
                    >
                        <PaymentIcon />
                        上传付款凭证
                    </button>
                    {completedCount > 0 && (
                        <button
                            className="btn btn--primary btn--batch-import"
                            onClick={handleBatchImport}
                        >
                            <ImportIcon />
                            批量导入 ({completedCount})
                        </button>
                    )}
                </div>
            </div>

            <div className="invoice-processing-layout">
                <div className="invoice-list-panel">
                    <CommandPanel
                        title="发票列表"
                        subtitle={invoices.length > 0 ? `${invoices.length} 张发票` : '暂无发票'}
                    >
                        {loading ? (
                            <div className="invoice-loading-state">加载中...</div>
                        ) : invoices.length === 0 ? (
                            <div className="invoice-empty-state">
                                <p>暂无发票</p>
                                <button className="btn btn--primary" onClick={() => setShowUpload(true)}>
                                    <UploadIcon />
                                    上传第一张发票
                                </button>
                            </div>
                        ) : (
                            <InvoiceThumbnailList
                                invoices={invoices}
                                selectedId={selectedInvoice?.id}
                                onSelect={handleInvoiceSelect}
                                projectId={projectId}
                            />
                        )}
                    </CommandPanel>
                </div>

                <div className="invoice-detail-panel">
                    {selectedInvoice ? (
                        <>
                            <ProcessingStatusRail
                                invoice={selectedInvoice}
                                onUpdate={fetchQueue}
                            />

                            <InvoicePreviewPane
                                invoice={selectedInvoice}
                                projectId={projectId}
                                onOCRUpdated={handleOCRUpdated}
                                onImportToRecords={() => handleImportToRecords(selectedInvoice)}
                                importing={importingInvoiceId === selectedInvoice.id}
                            />
                        </>
                    ) : (
                        <CommandPanel title="预览区" subtitle="从左侧选择一张发票查看">
                            <div className="invoice-empty-state">
                                <p>请选择一张发票查看详情</p>
                            </div>
                        </CommandPanel>
                    )}
                </div>
            </div>

            {showUpload && (
                <UploadModal
                    projectId={projectId}
                    uploadType={uploadType}
                    onClose={() => setShowUpload(false)}
                    onUploadComplete={handleUploadComplete}
                />
            )}
        </div>
    );
}

function UploadModal({ projectId, uploadType, onClose, onUploadComplete }) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [uploadCount, setUploadCount] = useState(0);

    const handleUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        setError('');
        setUploadCount(files.length);

        try {
            const uploadPromises = Array.from(files).map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);

                const endpoint = uploadType === 'payment'
                    ? `/api/app/reimbursements/invoices/upload-payment/${projectId}`
                    : `/api/app/reimbursements/invoices/upload/${projectId}`;

                return request.post(endpoint, formData);
            });

            await Promise.all(uploadPromises);
            onUploadComplete();
        } catch (err) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const title = uploadType === 'payment' ? '上传付款凭证' : '上传发票';
    const hint = uploadType === 'payment'
        ? '支持截图、图片格式，用于识别付款记录'
        : '支持 PDF、JPG、PNG 格式，最大 20MB';

    return (
        <div className="invoice-modal-overlay" onClick={onClose}>
            <div className="invoice-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="invoice-modal-header">
                    <h2>{title}</h2>
                    <button className="invoice-modal-close" onClick={onClose}>×</button>
                </div>
                <div className="invoice-modal-body">
                    <p className="upload-hint">{hint}</p>
                    <input
                        type="file"
                        multiple
                        accept=".pdf,image/*"
                        onChange={handleUpload}
                        disabled={uploading}
                        autoFocus
                    />
                    {uploading && (
                        <div className="uploading-state">
                            <div className="invoice-spinner" />
                            <p>正在上传并开始处理... ({uploadCount} 个文件)</p>
                        </div>
                    )}
                    {error && <CommandNotice tone="danger">{error}</CommandNotice>}
                </div>
            </div>
        </div>
    );
}

export default InvoiceProcessingCenter;
