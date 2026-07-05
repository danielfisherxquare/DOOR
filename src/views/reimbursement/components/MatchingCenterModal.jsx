/**
 * MatchingCenterModal
 * 待匹配项管理中心
 * 处理无法自动匹配的付款凭证
 */

import { useState, useEffect } from 'react';
import useReimbursementStore from '../../../stores/reimbursementStore';

// 图标组件
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

function MatchingCenterModal({ visible, onClose }) {
  const {
    pendingMatches,
    records,
    resolvePendingMatch,
    rejectPendingMatch,
    isLoading,
  } = useReimbursementStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [operationError, setOperationError] = useState('');

  // 重置索引
  useEffect(() => {
    if (visible && pendingMatches.length > 0) {
      setCurrentIndex(0);
      setOperationError('');
    }
  }, [visible, pendingMatches.length]);

  // 不显示或没有待匹配项
  if (!visible || pendingMatches.length === 0) {
    return null;
  }

  // 确保索引有效
  const validIndex = Math.min(currentIndex, pendingMatches.length - 1);
  const currentMatch = pendingMatches[validIndex];

  // 获取候选记录详情
  const candidates = currentMatch.candidates || [];

  // 处理匹配
  const handleResolve = async (recordId) => {
    setOperationError('');
    try {
      await resolvePendingMatch(currentMatch.id, recordId);
      if (pendingMatches.length <= 1) {
        onClose();
      } else {
        setCurrentIndex((i) => Math.min(i, pendingMatches.length - 2));
      }
    } catch (error) {
      console.error('匹配失败:', error);
      setOperationError(`关联失败：${error.message || '请稍后重试'}`);
    }
  };

  // 拒绝匹配
  const handleReject = async () => {
    setOperationError('');
    try {
      await rejectPendingMatch(currentMatch.id);
      if (pendingMatches.length <= 1) {
        onClose();
      } else {
        setCurrentIndex((i) => Math.min(i, pendingMatches.length - 2));
      }
    } catch (error) {
      console.error('拒绝匹配失败:', error);
      setOperationError(`操作失败：${error.message || '请稍后重试'}`);
    }
  };

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount && amount !== 0) return '-';
    return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  };

  // 格式化日期
  const formatDate = (date) => {
    if (!date) return '-';
    return String(date).slice(0, 10);
  };

  return (
    <div className="matching-modal-overlay" onClick={onClose}>
      <div className="matching-modal matching-modal--mobile-wizard" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="matching-modal__header">
          <h2 className="matching-modal__title">
            待确认匹配 ({validIndex + 1} / {pendingMatches.length})
          </h2>
          <button className="matching-modal__close" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        {/* 提示信息 */}
        <div className="matching-modal__alert">
          <span className="matching-modal__alert-icon">⚠️</span>
          <div className="matching-modal__alert-content">
            <div className="matching-modal__alert-title">发现无法唯一匹配的付款凭证</div>
            <div className="matching-modal__alert-desc">
              这笔付款金额为 {formatAmount(currentMatch.payment_data?.amount)}，
              但在系统内找到了多个相同金额的发票。请手动选择应该关联的发票。
            </div>
          </div>
        </div>

        {/* 操作错误提示 */}
        {operationError && (
          <div className="matching-modal__error" style={{ padding: '8px 20px', margin: '0 20px', background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #dc2626)', borderRadius: '6px', fontSize: '13px' }}>
            ⚠️ {operationError}
          </div>
        )}

        {/* 内容区域 */}
        <div className="matching-modal__content">
          {/* 左侧：付款凭证信息 */}
          <section className="matching-modal__payment matching-modal__wizard-step matching-modal__wizard-step--payment">
            <h3 className="matching-modal__section-title">待分配的付款凭证</h3>
            <div className="matching-modal__payment-card">
              <div className="matching-modal__payment-info">
                <div className="matching-modal__payment-row">
                  <span className="matching-modal__payment-label">付款方/收款方</span>
                  <span className="matching-modal__payment-value">
                    {currentMatch.payment_data?.payee ||
                     currentMatch.payment_data?.targetName || '未解析'}
                  </span>
                </div>
                <div className="matching-modal__payment-row">
                  <span className="matching-modal__payment-label">付款金额</span>
                  <span className="matching-modal__payment-value matching-modal__payment-amount">
                    {formatAmount(currentMatch.payment_data?.amount)}
                  </span>
                </div>
                <div className="matching-modal__payment-row">
                  <span className="matching-modal__payment-label">付款日期</span>
                  <span className="matching-modal__payment-value">
                    {formatDate(currentMatch.payment_data?.date)}
                  </span>
                </div>
              </div>
              <button
                className="matching-modal__reject-btn"
                onClick={handleReject}
                disabled={isLoading}
              >
                放弃关联，独立作为新记录
              </button>
            </div>
          </section>

          {/* 右侧：候选发票列表 */}
          <section className="matching-modal__candidates matching-modal__wizard-step matching-modal__wizard-step--candidates">
            <h3 className="matching-modal__section-title">候选发票记录</h3>
            {candidates.length > 0 ? (
              <div className="matching-modal__candidates-list">
                {candidates.map((candidate) => (
                  <div key={candidate.id} className="matching-modal__candidate-card">
                    <div className="matching-modal__candidate-info">
                      <div className="matching-modal__candidate-header">
                        <span className="matching-modal__candidate-company">
                          {candidate.company || candidate.description || '无名称发票'}
                        </span>
                        <span className="matching-modal__candidate-amount">
                          {formatAmount(candidate.expense)}
                        </span>
                      </div>
                      <div className="matching-modal__candidate-meta">
                        <span className="matching-modal__candidate-tag">
                          {candidate.category || '未分类'}
                        </span>
                        <span className="matching-modal__candidate-date">
                          {formatDate(candidate.payment_date)}
                        </span>
                      </div>
                      <div className="matching-modal__candidate-remarks">
                        {candidate.remarks || '无备注'}
                      </div>
                    </div>
                    <button
                      className="matching-modal__match-btn"
                      onClick={() => handleResolve(candidate.id)}
                      disabled={isLoading}
                    >
                      <CheckIcon />
                      确认关联
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="matching-modal__no-candidates">
                未能找到候选记录
              </div>
            )}
          </section>
        </div>

        {/* 底部导航 */}
        {pendingMatches.length > 1 && (
          <div className="matching-modal__footer">
            <button
              className="matching-modal__nav-btn"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeftIcon />
              上一个
            </button>
            <span className="matching-modal__nav-info">
              {validIndex + 1} / {pendingMatches.length}
            </span>
            <button
              className="matching-modal__nav-btn"
              onClick={() => setCurrentIndex(Math.min(pendingMatches.length - 1, currentIndex + 1))}
              disabled={currentIndex === pendingMatches.length - 1}
            >
              下一个
              <ChevronRightIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default MatchingCenterModal;
