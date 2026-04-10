/**
 * Reimbursement Table
 * 报销明细表格组件 - 支持批量编辑和删除
 */

import { useEffect, useRef, useState } from 'react';
import useReimbursementStore from '../../../stores/reimbursementStore';

const TABLE_COLUMN_COUNT = 14;

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

const ThumbnailList = ({ items, borderColor }) => {
  const { getAttachmentUrl } = useReimbursementStore();
  const [urls, setUrls] = useState({});

  useEffect(() => {
    let mounted = true;
    items.forEach((item) => {
      getAttachmentUrl(item.storage_path).then((url) => {
        if (mounted) {
          setUrls((prev) => ({ ...prev, [item.id]: url }));
        }
      });
    });
    return () => {
      mounted = false;
    };
  }, [items, getAttachmentUrl]);

  const borderClass = borderColor === '#3b82f6' ? 'thumbnail-item--invoice' : 'thumbnail-item--payment';

  return (
    <div className="thumbnail-list">
      {items.map((item) => (
        <div
          key={item.id}
          className={`thumbnail-item ${borderClass}`}
          title={item.original_name || item.file_name}
          onClick={() => {
            const url = urls[item.id];
            if (url) {
              window.open(url, '_blank');
            }
          }}
        >
          {urls[item.id] ? (
            <img
              src={urls[item.id]}
              alt={item.original_name}
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

const AttachmentPreview = ({ attachments }) => {
  if (!attachments || attachments.length === 0) {
    return <span className="attachment-empty">-</span>;
  }

  const invoiceAttachments = attachments.filter((a) => a.file_type === 'invoice');
  const paymentAttachments = attachments.filter((a) => a.file_type === 'payment');

  return (
    <div className="attachment-preview">
      {invoiceAttachments.length > 0 && (
        <ThumbnailList items={invoiceAttachments} borderColor="#3b82f6" />
      )}
      {paymentAttachments.length > 0 && (
        <ThumbnailList items={paymentAttachments} borderColor="#22c55e" />
      )}
    </div>
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

function ReimbursementTable({ focusRecordId = null, onFocusRecordHandled = null }) {
  const {
    records,
    activeProject,
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
  const rowRefs = useRef({});

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
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map((r) => r.id)));
    }
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

  const totalExpense = records.reduce((sum, r) => sum + (Number(r.expense) || 0), 0);
  const totalIncome = records.reduce((sum, r) => sum + (Number(r.income) || 0), 0);
  const { sortedRecords, rows: groupedRows } = buildGroupedRows(records);

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
            {selectedIds.size > 0 && (
              <span className="stat stat--selected">
                已选 <strong>{selectedIds.size}</strong> 条
              </span>
            )}
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
          <button className="btn btn--primary" onClick={exportToExcel} disabled={isLoading}>
            导出 Excel
          </button>
          <button className="btn btn--ghost" onClick={exportWithImages} disabled={isLoading}>
            导出 Excel + 附件
          </button>
        </div>
      </div>

      <div className="reimbursement-table__container">
        <table>
          <thead>
            <tr>
              <th className="th-checkbox">
                <input
                  type="checkbox"
                    checked={selectedIds.size === records.length && records.length > 0}
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
                      record.income ? `¥${record.income.toLocaleString()}` : '-'
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
                      record.expense ? `¥${record.expense.toLocaleString()}` : '-'
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
                    <span className={`badge ${record.has_invoice ? 'badge--success' : 'badge--default'}`}>
                      {record.has_invoice ? '有' : '无'}
                    </span>
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
      </div>

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
