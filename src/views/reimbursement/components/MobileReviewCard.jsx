import { getRecordExportIssueLabels, getOcrReviewStatus } from '../utils/ocrMetrics';

function formatAmount(record) {
  const value = Number(record.expense || record.income || 0);
  return value ? `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '未填金额';
}

function formatCategory(record) {
  return [record.category, record.sub_category].filter(Boolean).join(' / ') || '-';
}

function MobileReviewCard({ record, onOpen }) {
  const reviewStatus = getOcrReviewStatus(record);
  const exportIssues = getRecordExportIssueLabels(record, 0, [record]);

  return (
    <article className="mobile-review-card">
      <header className="mobile-review-card__header">
        <div className="mobile-review-card__title">
          <strong>{formatAmount(record)}</strong>
          <span>{record.company || record.description || '未命名报销'}</span>
        </div>
        <span className={reviewStatus.needsReview ? 'badge badge--review' : 'badge badge--success'}>
          {reviewStatus.needsReview ? `复核 ${reviewStatus.issueCount}` : '可入表'}
        </span>
      </header>

      <dl className="mobile-review-card__fields">
        <div>
          <dt>日期</dt>
          <dd>{record.payment_date || '-'}</dd>
        </div>
        <div>
          <dt>报销人</dt>
          <dd>{record.reporter || '-'}</dd>
        </div>
        <div>
          <dt>类别</dt>
          <dd>{formatCategory(record)}</dd>
        </div>
      </dl>

      {exportIssues.length > 0 ? (
        <div className="mobile-review-card__issues">
          {exportIssues.slice(0, 3).map((issue) => <span key={issue}>{issue}</span>)}
        </div>
      ) : null}

      <footer className="mobile-review-card__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={onOpen}>
          查看明细
        </button>
      </footer>
    </article>
  );
}

export default MobileReviewCard;
