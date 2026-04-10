/**
 * AttachmentManager
 * 票据管理组件 - 查看和管理已上传的发票与付款凭证
 */

import { useState, useEffect } from 'react';
import useReimbursementStore from '../../../stores/reimbursementStore';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

// 票据预览模态框
function AttachmentPreviewModal({ attachment, record, onClose, onDelete, onReplace }) {
  const [imageUrl, setImageUrl] = useState(null);
  const { getAttachmentImage } = useReimbursementStore();
  const fileInputRef = useState(null);

  useEffect(() => {
    let url;
    if (attachment?.id) {
      getAttachmentImage(attachment.id).then((result) => {
        url = result;
        setImageUrl(result);
      });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment, getAttachmentImage]);

  if (!attachment) return null;

  const handleReplace = (e) => {
    const file = e.target.files?.[0];
    if (file && onReplace) {
      onReplace(attachment.id, file);
    }
  };

  return (
    <div className="attachment-modal-overlay" onClick={onClose}>
      <div className="attachment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="attachment-modal__header">
          <h3>{attachment.file_type === 'invoice' ? '发票' : '付款凭证'}</h3>
          <button className="btn btn--ghost btn--icon" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="attachment-modal__content">
          <div className="attachment-modal__image">
            {imageUrl ? (
              <img src={imageUrl} alt={attachment.original_name} />
            ) : (
              <div className="attachment-modal__loading">加载中...</div>
            )}
          </div>

          <div className="attachment-modal__info">
            <div className="attachment-info-item">
              <span className="attachment-info-item__label">文件名</span>
              <span className="attachment-info-item__value">{attachment.original_name || attachment.file_name}</span>
            </div>

            {attachment.invoice_number && (
              <div className="attachment-info-item">
                <span className="attachment-info-item__label">发票号码</span>
                <span className="attachment-info-item__value">{attachment.invoice_number}</span>
              </div>
            )}

            {record && (
              <>
                <div className="attachment-info-item">
                  <span className="attachment-info-item__label">关联记录</span>
                  <span className="attachment-info-item__value">第 {record.index} 条</span>
                </div>
                <div className="attachment-info-item">
                  <span className="attachment-info-item__label">金额</span>
                  <span className="attachment-info-item__value">
                    ¥{(Number(record.expense) || Number(record.income) || 0).toLocaleString()}
                  </span>
                </div>
                <div className="attachment-info-item">
                  <span className="attachment-info-item__label">日期</span>
                  <span className="attachment-info-item__value">{record.payment_date || '-'}</span>
                </div>
                <div className="attachment-info-item">
                  <span className="attachment-info-item__label">报销人</span>
                  <span className="attachment-info-item__value">{record.reporter || '-'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="attachment-modal__actions">
          <input
            type="file"
            accept="image/*,.pdf"
            ref={fileInputRef}
            onChange={handleReplace}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn--ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon />
            替换图片
          </button>
          <button
            className="btn btn--danger"
            onClick={() => onDelete(attachment.id)}
          >
            <TrashIcon />
            删除票据
          </button>
        </div>
      </div>
    </div>
  );
}

// 票据卡片
function AttachmentCard({ attachment, record, onClick }) {
  const [imageUrl, setImageUrl] = useState(null);
  const { getAttachmentThumbnail } = useReimbursementStore();

  useEffect(() => {
    let url;
    if (attachment?.thumbnail_data) {
      // 后端已将thumbnail_data转为base64字符串
      setImageUrl(`data:image/jpeg;base64,${attachment.thumbnail_data}`);
    } else if (attachment?.id) {
      // 通过API获取缩略图
      getAttachmentThumbnail(attachment.id).then((result) => {
        url = result;
        setImageUrl(result);
      });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment, getAttachmentThumbnail]);

  const typeLabel = attachment.file_type === 'invoice' ? '发票' : '付款凭证';
  const typeClass = attachment.file_type === 'invoice' ? 'invoice' : 'payment';

  return (
    <div className="attachment-card" onClick={onClick}>
      <div className={`attachment-card__image attachment-card__image--${typeClass}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={attachment.original_name} />
        ) : (
          <div className="attachment-card__placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
        )}
      </div>

      <div className="attachment-card__info">
        <span className={`attachment-card__type attachment-card__type--${typeClass}`}>
          {typeLabel}
        </span>

        {attachment.invoice_number && (
          <span className="attachment-card__invoice-number">
            #{attachment.invoice_number}
          </span>
        )}

        {record && (
          <span className="attachment-card__amount">
            ¥{(Number(record.expense) || Number(record.income) || 0).toLocaleString()}
          </span>
        )}

        {record && (
          <span className="attachment-card__record">
            记录 #{record.index}
          </span>
        )}
      </div>
    </div>
  );
}

function AttachmentManager({ projectId }) {
  const {
    records,
    fetchRecords,
    deleteAttachment,
    replaceAttachment,
    isLoading,
  } = useReimbursementStore();

  const [filter, setFilter] = useState('all');
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [attachments, setAttachments] = useState([]);

  // 从记录中提取所有附件
  useEffect(() => {
    if (projectId) {
      fetchRecords(projectId);
    }
  }, [projectId, fetchRecords]);

  // 汇总所有附件
  useEffect(() => {
    const allAttachments = [];
    records.forEach((record) => {
      const recordAttachments = record.attachments || [];
      recordAttachments.forEach((att) => {
        allAttachments.push({
          ...att,
          record,
        });
      });
    });
    setAttachments(allAttachments);
  }, [records]);

  // 筛选附件
  const filteredAttachments = attachments.filter((att) => {
    if (filter === 'all') return true;
    return att.file_type === filter;
  });

  // 统计
  const stats = {
    total: attachments.length,
    invoices: attachments.filter((a) => a.file_type === 'invoice').length,
    payments: attachments.filter((a) => a.file_type === 'payment').length,
  };

  const handleDelete = async (attachmentId) => {
    if (!confirm('确定要删除此票据吗？删除后无法恢复。')) return;

    try {
      await deleteAttachment(attachmentId);
      setSelectedAttachment(null);
      fetchRecords(projectId);
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  const handleReplace = async (attachmentId, file) => {
    try {
      await replaceAttachment(attachmentId, file);
      fetchRecords(projectId);
      // 刷新预览
      if (selectedAttachment?.id === attachmentId) {
        setSelectedAttachment(null);
      }
    } catch (err) {
      alert('替换失败: ' + err.message);
    }
  };

  const handleRefresh = () => {
    fetchRecords(projectId);
  };

  return (
    <div className="attachment-manager">
      <div className="attachment-manager__toolbar">
        <div className="attachment-manager__filters">
          <button
            className={`filter-btn filter-btn--all ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 ({stats.total})
          </button>
          <button
            className={`filter-btn filter-btn--invoice ${filter === 'invoice' ? 'active' : ''}`}
            onClick={() => setFilter('invoice')}
          >
            发票 ({stats.invoices})
          </button>
          <button
            className={`filter-btn filter-btn--payment ${filter === 'payment' ? 'active' : ''}`}
            onClick={() => setFilter('payment')}
          >
            付款凭证 ({stats.payments})
          </button>
        </div>

        <button
          className="btn btn--ghost btn--sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshIcon />
          刷新
        </button>
      </div>

      <div className="attachment-manager__content">
        {filteredAttachments.length === 0 ? (
          <div className="attachment-manager__empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p>暂无票据</p>
            <p className="attachment-manager__empty-hint">
              请先在"导入与识别"页签上传发票或付款凭证
            </p>
          </div>
        ) : (
          <div className="attachment-manager__grid">
            {filteredAttachments.map((attachment) => (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                record={attachment.record}
                onClick={() => setSelectedAttachment(attachment)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 票据预览模态框 */}
      {selectedAttachment && (
        <AttachmentPreviewModal
          attachment={selectedAttachment}
          record={selectedAttachment.record}
          onClose={() => setSelectedAttachment(null)}
          onDelete={handleDelete}
          onReplace={handleReplace}
        />
      )}
    </div>
  );
}

export default AttachmentManager;
