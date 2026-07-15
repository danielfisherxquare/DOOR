/**
 * Reimbursement Table
 * 报销明细表格组件 - 支持批量编辑和删除
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import useReimbursementStore from '../../../stores/reimbursementStore';
import { AppH5DataCard, AppH5DataTable, AppH5StatusTag } from '../../../components/app/AppH5Surface';
import {
  formatOcrDuration,
  formatOcrImageSavings,
  formatOcrTokens,
  getRecordExportIssueLabels,
  getOcrReviewStatus,
  summarizeOcrMetrics,
  summarizeExportReadiness,
  summarizeOcrReview,
} from '../utils/ocrMetrics';

const TABLE_COLUMN_COUNT = 14;

function formatCurrency(value) {
  const number = Number(value || 0);
  return number ? `¥${number.toLocaleString()}` : '-';
}

function normalizeGroupValue(value, fallback = '未分类') {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
}

function compareGroupValue(left, right) {
  const leftEmpty = !String(left || '').trim();
  const rightEmpty = !String(right || '').trim();

  if (leftEmpty && !rightEmpty) return 1;
  if (!leftEmpty && rightEmpty) return -1;

  return String(left || '').localeCompare(String(right || ''), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortRecordsForDisplay(records) {
  return [...records].sort((left, right) => {
    const categoryDiff = compareGroupValue(left.category, right.category);
    if (categoryDiff !== 0) return categoryDiff;

    const subCategoryDiff = compareGroupValue(left.sub_category, right.sub_category);
    if (subCategoryDiff !== 0) return subCategoryDiff;

    const dateDiff = compareGroupValue(left.payment_date, right.payment_date);
    if (dateDiff !== 0) return dateDiff;

    return Number(left.index || 0) - Number(right.index || 0);
  });
}

function buildGroupedRows(records) {
  const sortedRecords = sortRecordsForDisplay(records);
  const rows = [];
  let currentGroupKey = null;
  let currentGroupCount = 0;
  let currentGroupHeaderIndex = -1;

  sortedRecords.forEach((record) => {
    const category = normalizeGroupValue(record.category);
    const subCategory = normalizeGroupValue(record.sub_category);
    const groupKey = `${category}__${subCategory}`;

    if (groupKey !== currentGroupKey) {
      rows.push({
        type: 'group',
        key: `group-${groupKey}`,
        category,
        subCategory,
        count: 0,
      });
      currentGroupHeaderIndex = rows.length - 1;
      currentGroupKey = groupKey;
      currentGroupCount = 0;
    }

    currentGroupCount += 1;
    rows[currentGroupHeaderIndex].count = currentGroupCount;
    rows.push({
      type: 'record',
      key: record.id,
      record,
    });
  });

  return {
    sortedRecords,
    rows,
  };
}

const ThumbnailList = ({ items, borderColor, onPreview }) => {
  const { getAttachmentThumbnail } = useReimbursementStore();
  const [urls, setUrls] = useState({});

  useEffect(() => {
    let mounted = true;
    const createdUrls = [];
    const loadUrls = async () => {
      for (const item of items) {
        const url = await getAttachmentThumbnail(item.id);
        if (mounted && url) {
          createdUrls.push(url);
          setUrls((prev) => ({ ...prev, [item.id]: url }));
        } else if (url) {
          URL.revokeObjectURL(url);
        }
      }
    };
    loadUrls();
    return () => {
      mounted = false;
      createdUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [items, getAttachmentThumbnail]);

  const borderClass = borderColor === '#3b82f6' ? 'thumbnail-item--invoice' : 'thumbnail-item--payment';

  return (
    <div className="thumbnail-list">
      {items.map((item) => (
        <div
          key={item.id}
          className={`thumbnail-item ${borderClass}`}
          title={item.original_name || item.file_name}
          onClick={() => onPreview && onPreview(item)}
        >
          {urls[item.id] ? (
            <img
              src={urls[item.id]}
              alt={item.original_name || item.file_name}
              className="thumbnail-item__image"
            />
          ) : (
            <span className="thumbnail-item__loading">...</span>
          )}
        </div>
      ))}
    </div>
  );
};

const AttachmentPreviewModal = ({ attachment, onClose }) => {
  const { getAttachmentImage } = useReimbursementStore();
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let loadedUrl = null;
    const loadImage = async () => {
      try {
        const url = await getAttachmentImage(attachment.id);
        loadedUrl = url;
        if (mounted) {
          setImageUrl(url);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };
    loadImage();
    return () => {
      mounted = false;
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    };
  }, [attachment.id, getAttachmentImage]);

  if (!attachment) return null;

  return (
    <div className="attachment-preview-modal__overlay" onClick={onClose}>
      <div className="attachment-preview-modal__content" onClick={(e) => e.stopPropagation()}>
        <div className="attachment-preview-modal__header">
          <span className="attachment-preview-modal__title">
            {attachment.original_name || attachment.file_name}
          </span>
          <span className={`attachment-preview-modal__type-badge ${attachment.file_type === 'invoice' ? 'badge--info' : 'badge--success'}`}>
            {attachment.file_type === 'invoice' ? '发票' : '付款凭证'}
          </span>
          <button className="attachment-preview-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="attachment-preview-modal__body">
          {loading ? (
            <div className="attachment-preview-modal__loading">加载中...</div>
          ) : imageUrl ? (
            <img src={imageUrl} alt={attachment.original_name} className="attachment-preview-modal__image" />
          ) : (
            <div className="attachment-preview-modal__error">图片加载失败</div>
          )}
        </div>
      </div>
    </div>
  );
};

const AttachmentPreview = ({ attachments }) => {
  const [previewAttachment, setPreviewAttachment] = useState(null);

  if (!attachments || attachments.length === 0) {
    return <span className="attachment-empty">-</span>;
  }

  const invoiceAttachments = attachments.filter((a) => a.file_type === 'invoice');
  const paymentAttachments = attachments.filter((a) => a.file_type === 'payment');

  return (
    <>
      <div className="attachment-preview">
        {invoiceAttachments.length > 0 && (
          <ThumbnailList items={invoiceAttachments} borderColor="#3b82f6" onPreview={setPreviewAttachment} />
        )}
        {paymentAttachments.length > 0 && (
          <ThumbnailList items={paymentAttachments} borderColor="#22c55e" onPreview={setPreviewAttachment} />
        )}
      </div>
      {previewAttachment && (
        <AttachmentPreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}
    </>
  );
};

// 批量编辑弹窗
function BatchEditModal({ visible, selectedRecords, onClose, onSave }) {
  const [editFields, setEditFields] = useState({
    category: '',
    sub_category: '',
    reporter: '',
    company: '',
    remarks: '',
  });
  const [activeFields, setActiveFields] = useState({
    category: false,
    sub_category: false,
    reporter: false,
    company: false,
    remarks: false,
  });

  if (!visible || selectedRecords.length === 0) return null;

  const handleFieldToggle = (field) => {
    setActiveFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSave = () => {
    const updates = {};
    for (const [field, active] of Object.entries(activeFields)) {
      if (active && editFields[field] !== '') {
        updates[field] = editFields[field];
      }
    }
    if (Object.keys(updates).length > 0) {
      onSave(updates);
    }
    onClose();
  };

  return (
    <div className="batch-modal-overlay" onClick={onClose}>
      <div className="batch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="batch-modal__header">
          <h3>批量编辑 ({selectedRecords.length} 条记录)</h3>
          <button className="btn btn--ghost btn--icon" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="batch-modal__content">
          <p className="batch-modal__hint">勾选需要修改的字段，输入新值：</p>

          <div className="batch-edit-field">
            <label>
              <input
                type="checkbox"
                checked={activeFields.category}
                onChange={() => handleFieldToggle('category')}
              />
              大类
            </label>
            <input
              type="text"
              value={editFields.category}
              onChange={(e) => setEditFields({ ...editFields, category: e.target.value })}
              disabled={!activeFields.category}
              placeholder="输入大类名称"
            />
          </div>

          <div className="batch-edit-field">
            <label>
              <input
                type="checkbox"
                checked={activeFields.sub_category}
                onChange={() => handleFieldToggle('sub_category')}
              />
              子类
            </label>
            <input
              type="text"
              value={editFields.sub_category}
              onChange={(e) => setEditFields({ ...editFields, sub_category: e.target.value })}
              disabled={!activeFields.sub_category}
              placeholder="输入子类名称"
            />
          </div>

          <div className="batch-edit-field">
            <label>
              <input
                type="checkbox"
                checked={activeFields.reporter}
                onChange={() => handleFieldToggle('reporter')}
              />
              报销人
            </label>
            <input
              type="text"
              value={editFields.reporter}
              onChange={(e) => setEditFields({ ...editFields, reporter: e.target.value })}
              disabled={!activeFields.reporter}
              placeholder="输入报销人姓名"
            />
          </div>

          <div className="batch-edit-field">
            <label>
              <input
                type="checkbox"
                checked={activeFields.company}
                onChange={() => handleFieldToggle('company')}
              />
              开票公司
            </label>
            <input
              type="text"
              value={editFields.company}
              onChange={(e) => setEditFields({ ...editFields, company: e.target.value })}
              disabled={!activeFields.company}
              placeholder="输入开票公司名称"
            />
          </div>

          <div className="batch-edit-field">
            <label>
              <input
                type="checkbox"
                checked={activeFields.remarks}
                onChange={() => handleFieldToggle('remarks')}
              />
              备注
            </label>
            <input
              type="text"
              value={editFields.remarks}
              onChange={(e) => setEditFields({ ...editFields, remarks: e.target.value })}
              disabled={!activeFields.remarks}
              placeholder="输入备注内容"
            />
          </div>
        </div>

        <div className="batch-modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>取消</button>
          <button className="btn btn--primary" onClick={handleSave}>
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileEditField({ label, type = 'text', value, onChange }) {
  return (
    <label className="reimbursement-mobile-record-card__edit-field">
      <span>{label}</span>
      <input type={type} value={value || ''} onChange={onChange} />
    </label>
  );
}

function ReimbursementMobileRecordCard({
  record,
  selected,
  quality,
  attachmentCount,
  editing,
  editData,
  onToggle,
  onEdit,
  onEditDataChange,
  onSave,
  onCancel,
  onDelete,
}) {
  const amount = Number(record.expense || record.income || 0);
  const tone = quality.reviewStatus.needsReview || quality.exportIssues.length > 0 ? 'warning' : 'success';
  const statusText = tone === 'success' ? '可导出' : '需处理';

  return (
    <AppH5DataCard
      className={selected ? 'reimbursement-mobile-record-card is-selected' : 'reimbursement-mobile-record-card'}
      eyebrow={record.payment_date || '未填日期'}
      title={record.description || record.company || '未命名报销'}
      meta={<AppH5StatusTag tone={tone}>{statusText}</AppH5StatusTag>}
      fields={editing ? [] : [
        { key: 'amount', label: '金额', value: amount ? `¥${amount.toLocaleString()}` : '-' },
        { key: 'reporter', label: '报销人', value: record.reporter },
        { key: 'category', label: '类别', value: [record.category, record.sub_category].filter(Boolean).join(' / ') },
        { key: 'company', label: '开票公司', value: record.company },
        { key: 'attachments', label: '附件', value: attachmentCount ? `${attachmentCount} 个` : '-' },
      ]}
      actions={editing ? (
        <>
          <button type="button" className="btn btn--primary btn--sm" onClick={onSave}>保存</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>取消</button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onToggle(record.id)}>
            {selected ? '取消选择' : '选择'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(record)}>编辑</button>
          <button type="button" className="btn btn--danger btn--sm" onClick={() => onDelete(record.id)}>删除</button>
        </>
      )}
    >
      {editing ? (
        <div className="reimbursement-mobile-record-card__edit-grid">
          <MobileEditField
            label="日期"
            type="date"
            value={editData.payment_date}
            onChange={(event) => onEditDataChange({ ...editData, payment_date: event.target.value })}
          />
          <MobileEditField
            label="大类"
            value={editData.category}
            onChange={(event) => onEditDataChange({ ...editData, category: event.target.value })}
          />
          <MobileEditField
            label="子类"
            value={editData.sub_category}
            onChange={(event) => onEditDataChange({ ...editData, sub_category: event.target.value })}
          />
          <MobileEditField
            label="摘要"
            value={editData.description}
            onChange={(event) => onEditDataChange({ ...editData, description: event.target.value })}
          />
          <MobileEditField
            label="收入"
            type="number"
            value={editData.income}
            onChange={(event) => onEditDataChange({ ...editData, income: parseFloat(event.target.value) || null })}
          />
          <MobileEditField
            label="支出"
            type="number"
            value={editData.expense}
            onChange={(event) => onEditDataChange({ ...editData, expense: parseFloat(event.target.value) || null })}
          />
          <MobileEditField
            label="报销人"
            value={editData.reporter}
            onChange={(event) => onEditDataChange({ ...editData, reporter: event.target.value })}
          />
          <MobileEditField
            label="开票公司"
            value={editData.company}
            onChange={(event) => onEditDataChange({ ...editData, company: event.target.value })}
          />
        </div>
      ) : null}
      {!editing && quality.exportIssues.length > 0 ? (
        <div className="reimbursement-mobile-record-card__issues">
          {quality.exportIssues.slice(0, 3).map((label) => <span key={label}>{label}</span>)}
        </div>
      ) : null}
    </AppH5DataCard>
  );
}

function ReimbursementTable({ focusRecordId = null, onFocusRecordHandled = null }) {
  const {
    records,
    defaultReporter,
    saveDefaultReporter,
    updateRecord,
    deleteRecord,
    batchUpdateRecords,
    batchDeleteRecords,
    exportToExcel,
    exportWithImages,
    isLoading,
    getAttachments,
  } = useReimbursementStore();

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const [reporterDraft, setReporterDraft] = useState(defaultReporter || '');
  const [exportFeedback, setExportFeedback] = useState(null);
  const [qualityFilter, setQualityFilter] = useState('all');
  const [sortMode, setSortMode] = useState('category');
  const rowRefs = useRef({});
  const isExporting = Boolean(exportFeedback?.mode);

  const ocrSummary = useMemo(() => summarizeOcrMetrics(records), [records]);
  const ocrReviewSummary = useMemo(() => summarizeOcrReview(records), [records]);
  const exportReadiness = useMemo(() => summarizeExportReadiness(records), [records]);
  const recordQualityMap = useMemo(() => {
    const map = new Map();
    records.forEach((record, index) => {
      map.set(record.id, {
        reviewStatus: getOcrReviewStatus(record),
        exportIssues: getRecordExportIssueLabels(record, index, records),
      });
    });
    return map;
  }, [records]);
  const riskRecordCount = Array.from(recordQualityMap.values())
    .filter((quality) => quality.exportIssues.length > 0).length;
  const reviewRecordCount = Array.from(recordQualityMap.values())
    .filter((quality) => quality.reviewStatus.needsReview).length;
  const visibleRecords = useMemo(() => records.filter((record) => {
    const quality = recordQualityMap.get(record.id);
    if (qualityFilter === 'risk') return (quality?.exportIssues.length || 0) > 0;
    if (qualityFilter === 'review') return Boolean(quality?.reviewStatus.needsReview);
    return true;
  }), [records, recordQualityMap, qualityFilter]);

  const { sortedRecords, rows: groupedRows } = useMemo(() => {
    if (sortMode === 'date-asc' || sortMode === 'date-desc') {
      const sorted = [...visibleRecords].sort((a, b) => {
        const dateA = a.payment_date || '';
        const dateB = b.payment_date || '';
        const dateDiff = dateA.localeCompare(dateB);
        if (dateDiff !== 0) return sortMode === 'date-asc' ? dateDiff : -dateDiff;
        return Number(a.index || 0) - Number(b.index || 0);
      });
      return { sortedRecords: sorted, rows: sorted.map((r) => ({ type: 'record', key: r.id, record: r })) };
    }
    return buildGroupedRows(visibleRecords);
  }, [visibleRecords, sortMode]);
  const visibleRecordIds = useMemo(() => sortedRecords.map((record) => record.id), [sortedRecords]);
  const selectedVisibleCount = visibleRecordIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleRecordIds.length > 0 && selectedVisibleCount === visibleRecordIds.length;

  const startEdit = (record) => {
    setEditingId(record.id);
    setEditData({ ...record });
  };

  const saveEdit = async () => {
    if (editingId) {
      await updateRecord(editingId, editData);
      setEditingId(null);
      setEditData({});
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleDelete = async (id) => {
    if (confirm('确定要删除这条记录吗？')) {
      await deleteRecord(id);
    }
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) {
        visibleRecordIds.forEach((id) => next.delete(id));
        return next;
      }
      visibleRecordIds.forEach((id) => next.add(id));
      return next;
    });
  };

  // 切换单条选择
  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？此操作不可恢复。`)) return;
    await batchDeleteRecords(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  // 批量编辑保存
  const handleBatchEditSave = async (updates) => {
    await batchUpdateRecords(Array.from(selectedIds), updates);
    setSelectedIds(new Set());
  };

  const handleApplyDefaultReporter = async () => {
    if (!reporterDraft?.trim() || selectedIds.size === 0) return;
    await batchUpdateRecords(Array.from(selectedIds), { reporter: reporterDraft.trim() });
  };

  const handleSaveDefaultReporter = async () => {
    await saveDefaultReporter(reporterDraft);
  };

  const runExport = async (mode, action) => {
    const isZip = mode === 'zip';
    if (!exportReadiness.ready && !confirm(exportReadiness.confirmMessage)) {
      setExportFeedback({
        mode: null,
        type: 'info',
        message: '已取消导出',
      });
      return;
    }

    setExportFeedback({
      mode,
      type: 'info',
      message: isZip ? '正在生成 Excel + 附件...' : '正在生成 Excel...',
    });

    try {
      await action();
      setExportFeedback({
        mode: null,
        type: 'success',
        message: isZip ? 'Excel + 附件已开始下载' : 'Excel 已开始下载',
      });
    } catch (error) {
      setExportFeedback({
        mode: null,
        type: 'error',
        message: error?.message || '导出失败',
      });
    }
  };

  const handleExportToExcel = () => runExport('excel', exportToExcel);
  const handleExportWithImages = () => runExport('zip', exportWithImages);

  const totalExpense = records.reduce((sum, r) => sum + (Number(r.expense) || 0), 0);
  const totalIncome = records.reduce((sum, r) => sum + (Number(r.income) || 0), 0);

  useEffect(() => {
    if (!focusRecordId) return;
    if (!records.some((record) => record.id === focusRecordId)) return;

    const target = rowRefs.current[focusRecordId];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(focusRecordId);
      window.setTimeout(() => {
        setHighlightedId((current) => (current === focusRecordId ? null : current));
      }, 2200);
    }

    onFocusRecordHandled?.();
  }, [focusRecordId, onFocusRecordHandled, records]);

  useEffect(() => {
    setReporterDraft(defaultReporter || '');
  }, [defaultReporter]);

  const handleRowRef = (recordId, node) => {
    if (node) {
      rowRefs.current[recordId] = node;
      return;
    }
    delete rowRefs.current[recordId];
  };

  if (records.length === 0) {
    return (
      <div className="reimbursement-table--empty">
        <p>暂无报销记录</p>
        <p className="hint">请先在"导入与识别"页签上传发票或付款凭证并完成识别</p>
      </div>
    );
  }

  return (
    <div className="reimbursement-table">
      <div className="reimbursement-table__toolbar">
        <div className="reimbursement-table__summary">
          <div className="reimbursement-table__stats">
            <span className="stat">
              共 <strong>{records.length}</strong> 条记录
            </span>
            <span className="stat">
              支出: <strong className="text-expense">¥{totalExpense.toLocaleString()}</strong>
            </span>
            <span className="stat">
              收入: <strong className="text-income">¥{totalIncome.toLocaleString()}</strong>
            </span>
            {ocrSummary.coveredRecordCount > 0 && (
              <>
                <span className="stat stat--ocr">
                  识别成本: <strong>{ocrSummary.coveredRecordCount}</strong> 条
                </span>
                <span className="stat stat--ocr">
                  Token: <strong>{formatOcrTokens(ocrSummary.totalTokens)}</strong>
                </span>
                <span className="stat stat--ocr">
                  调用: <strong>{ocrSummary.modelCallCount}</strong> 次
                </span>
                <span className="stat stat--ocr">
                  平均耗时: <strong>{formatOcrDuration(ocrSummary.averageDurationMs)}</strong>
                </span>
                {ocrSummary.imageOptimization.savedBytes > 0 && (
                  <span className="stat stat--ocr">
                    图片压缩: <strong>{formatOcrImageSavings(ocrSummary.imageOptimization)}</strong>
                  </span>
                )}
              </>
            )}
            {ocrReviewSummary.needsReviewCount > 0 && (
              <span className="stat stat--review">
                需复核: <strong>{ocrReviewSummary.needsReviewCount}</strong> 条
              </span>
            )}
            <span className={exportReadiness.ready ? 'stat stat--export-ready' : 'stat stat--review'}>
              导出检查: <strong>{exportReadiness.ready ? '已通过' : exportReadiness.warningCount + ' 项风险'}</strong>
            </span>
            {selectedIds.size > 0 && (
              <span className="stat stat--selected">
                已选 <strong>{selectedIds.size}</strong> 条
              </span>
            )}
            {qualityFilter !== 'all' && (
              <span className="stat stat--filter">
                显示 <strong>{sortedRecords.length}</strong> / {records.length} 条
              </span>
            )}
          </div>
          <div className="reimbursement-table__quality-filters" role="group" aria-label="记录筛选">
            <button
              type="button"
              className={qualityFilter === 'all' ? 'active' : ''}
              onClick={() => setQualityFilter('all')}
            >
              全部
            </button>
            <button
              type="button"
              className={qualityFilter === 'risk' ? 'active' : ''}
              onClick={() => setQualityFilter('risk')}
            >
              只看风险 {riskRecordCount}
            </button>
            <button
              type="button"
              className={qualityFilter === 'review' ? 'active' : ''}
              onClick={() => setQualityFilter('review')}
            >
              只看复核 {reviewRecordCount}
            </button>
          </div>
          <div className="reimbursement-table__sort-controls" role="group" aria-label="排序方式">
            <span className="reimbursement-table__sort-label">排序</span>
            <button
              type="button"
              className={sortMode === 'category' ? 'active' : ''}
              onClick={() => setSortMode('category')}
              title="按大类/子类分组展示"
            >
              分类
            </button>
            <button
              type="button"
              className={sortMode === 'date-asc' ? 'active' : ''}
              onClick={() => setSortMode('date-asc')}
              title="按日期从早到晚排列"
            >
              日期 ↑
            </button>
            <button
              type="button"
              className={sortMode === 'date-desc' ? 'active' : ''}
              onClick={() => setSortMode('date-desc')}
              title="按日期从晚到早排列"
            >
              日期 ↓
            </button>
          </div>
        </div>

        <div className="reimbursement-table__actions">
          <div className="reimbursement-table__reporter-bar">
            <span className="reimbursement-table__reporter-label">默认报销人</span>
            <input
              type="text"
              className="reimbursement-table__reporter-input"
              value={reporterDraft}
              onChange={(e) => setReporterDraft(e.target.value)}
              placeholder="输入默认报销人"
            />
            <button
              className="btn btn--ghost btn--sm"
              onClick={handleSaveDefaultReporter}
              disabled={isLoading || reporterDraft.trim() === (defaultReporter || '').trim()}
            >
              保存默认值
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={handleApplyDefaultReporter}
              disabled={!reporterDraft?.trim() || selectedIds.size === 0 || isLoading}
              title={!reporterDraft?.trim() ? '请先输入默认报销人' : '将默认报销人写入已选记录'}
            >
              一键写入已选
            </button>
          </div>

          {selectedIds.size > 0 && (
            <>
              <button className="btn btn--primary" onClick={() => setShowBatchEdit(true)}>
                批量编辑
              </button>
              <button className="btn btn--danger" onClick={handleBatchDelete}>
                批量删除
              </button>
            </>
          )}
          <button className="btn btn--primary" onClick={handleExportToExcel} disabled={isLoading || isExporting}>
            {exportFeedback?.mode === 'excel' ? '生成中...' : '导出 Excel'}
          </button>
          <button className="btn btn--ghost" onClick={handleExportWithImages} disabled={isLoading || isExporting}>
            {exportFeedback?.mode === 'zip' ? '打包中...' : '导出 Excel + 附件'}
          </button>
        </div>

        {exportFeedback?.message && (
          <div className={'reimbursement-table__export-feedback reimbursement-table__export-feedback--' + exportFeedback.type}>
            {exportFeedback.message}
          </div>
        )}

        {!exportReadiness.ready && (
          <div className="reimbursement-table__export-readiness">
            {exportReadiness.warnings.slice(0, 3).map((warning) => (
              <span key={warning.code}>{warning.message}</span>
            ))}
          </div>
        )}
      </div>

      <AppH5DataTable
        className="reimbursement-table__container"
        mobileCards={sortedRecords.map((record) => {
          const quality = recordQualityMap.get(record.id) || {
            reviewStatus: getOcrReviewStatus(record),
            exportIssues: getRecordExportIssueLabels(record, 0, records),
          };
          return (
            <ReimbursementMobileRecordCard
              key={record.id}
              record={record}
              selected={selectedIds.has(record.id)}
              quality={quality}
              attachmentCount={getAttachments(record.id).length}
              editing={editingId === record.id}
              editData={editingId === record.id ? editData : record}
              onToggle={toggleSelect}
              onEdit={startEdit}
              onEditDataChange={setEditData}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onDelete={handleDelete}
            />
          );
        })}
      >
        <table>
          <thead>
            <tr>
              <th className="th-checkbox">
	                <input
	                  type="checkbox"
	                  checked={allVisibleSelected}
	                  onChange={toggleSelectAll}
	                />
                </th>
              <th>序号</th>
              <th>日期</th>
              <th>大类</th>
              <th>子类</th>
              <th>摘要</th>
              <th>收入</th>
              <th>支出</th>
              <th>报销人</th>
              <th>发票</th>
              <th>开票公司</th>
              <th>附件</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((row) => {
              if (row.type === 'group') {
                return (
                  <tr key={row.key} className="reimbursement-table__group-row">
                    <td colSpan={TABLE_COLUMN_COUNT}>
                      <div className="reimbursement-table__group-label">
                        <span className="reimbursement-table__group-category">{row.category}</span>
                        <span className="reimbursement-table__group-divider">/</span>
                        <span className="reimbursement-table__group-subcategory">{row.subCategory}</span>
                        <span className="reimbursement-table__group-count">{row.count} 条</span>
                      </div>
                    </td>
                  </tr>
                );
              }

              const record = row.record;
              const quality = recordQualityMap.get(record.id) || {
                reviewStatus: getOcrReviewStatus(record),
                exportIssues: getRecordExportIssueLabels(record, 0, records),
              };
              const reviewStatus = quality.reviewStatus;
              return (
                <tr
                  key={record.id}
                  ref={(node) => handleRowRef(record.id, node)}
                  className={`${editingId === record.id ? 'editing' : ''} ${selectedIds.has(record.id) ? 'selected' : ''} ${highlightedId === record.id ? 'reimbursement-table__row--highlighted' : ''}`}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelect(record.id)}
                    />
                  </td>
                  <td>{record.index}</td>
                  <td>
                    {editingId === record.id ? (
                      <input
                        type="date"
                        value={editData.payment_date || ''}
                        onChange={(e) => setEditData({ ...editData, payment_date: e.target.value })}
                      />
                    ) : (
                      record.payment_date || '-'
                    )}
                  </td>
                  <td>
                    {editingId === record.id ? (
                      <input
                        type="text"
                        value={editData.category || ''}
                        onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                      />
                    ) : (
                      record.category || '-'
                    )}
                  </td>
                  <td>
                    {editingId === record.id ? (
                      <input
                        type="text"
                        value={editData.sub_category || ''}
                        onChange={(e) => setEditData({ ...editData, sub_category: e.target.value })}
                      />
                    ) : (
                      record.sub_category || '-'
                    )}
                  </td>
                  <td className="cell-description">
                    {editingId === record.id ? (
                      <input
                        type="text"
                        value={editData.description || ''}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      />
                    ) : (
                      record.description || '-'
                    )}
                  </td>
                  <td className="cell-amount">
                    {editingId === record.id ? (
                      <input
                        type="number"
                        value={editData.income || ''}
                        onChange={(e) => setEditData({ ...editData, income: parseFloat(e.target.value) || null })}
                      />
                    ) : (
                      formatCurrency(record.income)
                    )}
                  </td>
                  <td className="cell-amount cell-expense">
                    {editingId === record.id ? (
                      <input
                        type="number"
                        value={editData.expense || ''}
                        onChange={(e) => setEditData({ ...editData, expense: parseFloat(e.target.value) || null })}
                      />
                    ) : (
                      formatCurrency(record.expense)
                    )}
                  </td>
                  <td>
                    {editingId === record.id ? (
                      <input
                        type="text"
                        value={editData.reporter || ''}
                        onChange={(e) => setEditData({ ...editData, reporter: e.target.value })}
                      />
                    ) : (
                      record.reporter || '-'
                    )}
                  </td>
                  <td>
                    <div className="invoice-review-cell">
                      <span className={`badge ${record.has_invoice ? 'badge--success' : 'badge--default'}`}>
                        {record.has_invoice ? '有' : '无'}
                      </span>
                      {reviewStatus.needsReview && (
                        <span
                          className="badge badge--review"
                          title={reviewStatus.title || '识别字段需要人工复核'}
                        >
                          复核 {reviewStatus.issueCount}
                        </span>
                      )}
                      {quality.exportIssues.length > 0 && (
                        <div className="reimbursement-table__risk-list" title={quality.exportIssues.join('；')}>
                          {quality.exportIssues.slice(0, 2).map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="cell-company">
                    {editingId === record.id ? (
                      <input
                        type="text"
                        value={editData.company || ''}
                        onChange={(e) => setEditData({ ...editData, company: e.target.value })}
                      />
                    ) : (
                      record.company || '-'
                    )}
                  </td>
                  <td>
                    <AttachmentPreview attachments={getAttachments(record.id)} />
                  </td>
                  <td className="cell-remarks">
                    {record.remarks || '-'}
                  </td>
                  <td className="cell-actions">
                    {editingId === record.id ? (
                      <>
                        <button className="btn btn--sm btn--primary" onClick={saveEdit}>保存</button>
                        <button className="btn btn--sm btn--ghost" onClick={cancelEdit}>取消</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn--sm btn--ghost" onClick={() => startEdit(record)}>编辑</button>
                        <button className="btn btn--sm btn--danger" onClick={() => handleDelete(record.id)}>删除</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AppH5DataTable>

      <BatchEditModal
        visible={showBatchEdit}
        selectedRecords={sortedRecords.filter((r) => selectedIds.has(r.id))}
        onClose={() => setShowBatchEdit(false)}
        onSave={handleBatchEditSave}
      />
    </div>
  );
}

export default ReimbursementTable;
