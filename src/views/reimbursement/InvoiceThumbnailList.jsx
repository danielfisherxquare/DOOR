/**
 * Invoice Thumbnail List
 * 发票缩略图列表组件
 */

const statusConfig = {
    pending: { label: '待处理', className: 'invoice-status-badge--pending' },
    processing: { label: '处理中', className: 'invoice-status-badge--processing' },
    completed: { label: '已完成', className: 'invoice-status-badge--completed' },
    error: { label: '失败', className: 'invoice-status-badge--error' },
};

const StatusBadge = ({ status }) => {
    const config = statusConfig[status] || statusConfig.pending;

    return (
        <span className={`invoice-status-badge ${config.className}`}>
            {config.label}
        </span>
    );
};

const FileIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
    </svg>
);

const InvoiceCard = ({ invoice, isSelected, onClick, projectId }) => {
    const formatAmount = (amount) => {
        if (amount == null) return '¥0.00';
        return `¥${Number(amount).toFixed(2)}`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return dateStr;
        }
    };

    const getThumbnailUrl = () => {
        if (invoice.thumbnailPath) {
            return `/api/app/reimbursements/invoices/${projectId}/${invoice.id}/image?type=thumbnail`;
        }
        return null;
    };

    const thumbnailUrl = getThumbnailUrl();

    return (
        <div
            className={`invoice-card ${isSelected ? 'selected' : ''}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    onClick();
                }
            }}
        >
            <div className="invoice-card-thumbnail">
                {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={invoice.fileName} />
                ) : (
                    <div className="invoice-card-placeholder">
                        <FileIcon />
                    </div>
                )}
            </div>
            <div className="invoice-card-content">
                <div className="invoice-card-header">
                    <span className="invoice-card-name">{invoice.fileName}</span>
                    <StatusBadge status={invoice.status} />
                </div>
                <div className="invoice-card-info">
                    <span className="invoice-card-amount">
                        {invoice.ocrResult?.amount ? formatAmount(invoice.ocrResult.amount) : '-'}
                    </span>
                    <span className="invoice-card-date">{formatDate(invoice.startedAt)}</span>
                </div>
                {invoice.status === 'error' && invoice.errorMessage && (
                    <div className="invoice-card-error">{invoice.errorMessage}</div>
                )}
                {invoice.status === 'completed' && invoice.ocrResult?.subCategory && (
                    <div className="invoice-card-category">{invoice.ocrResult.subCategory}</div>
                )}
            </div>
        </div>
    );
};

function InvoiceThumbnailList({ invoices, selectedId, onSelect, projectId }) {
    if (!invoices || invoices.length === 0) {
        return null;
    }

    return (
        <div className="invoice-thumbnail-list">
            {invoices.map((invoice) => (
                <InvoiceCard
                    key={invoice.id}
                    invoice={invoice}
                    isSelected={selectedId === invoice.id}
                    onClick={() => onSelect(invoice)}
                    projectId={projectId}
                />
            ))}
        </div>
    );
}

export default InvoiceThumbnailList;
