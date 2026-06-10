const FIELD_LABELS = {
  expense: '金额',
  payment_date: '日期',
  company: '往来单位',
  invoice_identifier: '发票号码',
  category: '大类',
  sub_category: '子类',
};

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function hasPositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function issue(field, code, label, message) {
  return {
    field,
    code,
    label,
    level: 'warning',
    message,
  };
}

export function buildOcrReview(documentType, recordData = {}) {
  const issues = [];

  if (!hasPositiveAmount(recordData.expense)) {
    issues.push(issue('expense', 'missing_amount', FIELD_LABELS.expense, '识别结果缺少有效金额'));
  }

  if (!hasText(recordData.payment_date)) {
    issues.push(issue('payment_date', 'missing_date', FIELD_LABELS.payment_date, '识别结果缺少有效日期'));
  }

  if (!hasText(recordData.company)) {
    const code = documentType === 'payment' ? 'missing_payee' : 'missing_company';
    const label = documentType === 'payment' ? '收款方' : '开票公司';
    issues.push(issue('company', code, label, `识别结果缺少${label}`));
  }

  if (documentType === 'invoice' && !hasText(recordData.invoice_number) && !hasText(recordData.invoice_code)) {
    issues.push(issue(
      'invoice_number',
      'missing_invoice_identifier',
      FIELD_LABELS.invoice_identifier,
      '识别结果缺少发票号码或发票代码',
    ));
  }

  if (!hasText(recordData.category)) {
    issues.push(issue('category', 'missing_category', FIELD_LABELS.category, '识别结果缺少费用大类'));
  }

  if (!hasText(recordData.sub_category)) {
    issues.push(issue('sub_category', 'missing_sub_category', FIELD_LABELS.sub_category, '识别结果缺少费用子类'));
  }

  return {
    status: issues.length > 0 ? 'needs_review' : 'ready',
    issueCount: issues.length,
    issues,
  };
}

export function attachOcrReview(ocrMeta, documentType, recordData = {}) {
  if (!ocrMeta) return null;

  return {
    ...ocrMeta,
    review: buildOcrReview(documentType, recordData),
  };
}
