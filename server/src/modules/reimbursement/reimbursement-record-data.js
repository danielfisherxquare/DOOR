import { attachOcrReview } from './ocr.review.js';
import { isPlainObject } from './reimbursement-ocr-meta.js';
export function normalizeReimbursementDate(dateString) {
  if (!dateString) {
    return null;
  }

  if (dateString instanceof Date) {
    return dateString.toISOString().slice(0, 10);
  }

  if (typeof dateString !== 'string') {
    return null;
  }

  const chineseDateMatch = dateString.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (chineseDateMatch) {
    const [, year, month, day] = chineseDateMatch;
    return `${year}-${String(parseInt(month, 10)).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
  }

  const patterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
  ];

  for (const regex of patterns) {
    const match = dateString.match(regex);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${String(parseInt(month, 10)).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  return null;
}

export function toNullableNumber(value) {
  if (value === '' || value == null) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function toPositiveNullableNumber(value) {
  const result = toNullableNumber(value);
  return result != null ? Math.abs(result) : null;
}

export function normalizeSortText(value) {
  return String(value || '').trim();
}

export function compareSortText(left, right) {
  const leftText = normalizeSortText(left);
  const rightText = normalizeSortText(right);
  const leftEmpty = !leftText;
  const rightEmpty = !rightText;

  if (leftEmpty && !rightEmpty) return 1;
  if (!leftEmpty && rightEmpty) return -1;

  return leftText.localeCompare(rightText, 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function compareRecordOrder(left, right) {
  const categoryDiff = compareSortText(left.category, right.category);
  if (categoryDiff !== 0) return categoryDiff;

  const subCategoryDiff = compareSortText(left.sub_category, right.sub_category);
  if (subCategoryDiff !== 0) return subCategoryDiff;

  const dateDiff = compareSortText(left.payment_date, right.payment_date);
  if (dateDiff !== 0) return dateDiff;

  return Number(left.index || 0) - Number(right.index || 0);
}

export function buildPaymentReviewRecordData(paymentData = {}) {
  return buildStandalonePaymentRecordData(paymentData);
}

export function attachDocumentReview(ocrMeta, documentType, recordData) {
  if (!ocrMeta || !documentType) return ocrMeta || null;
  return attachOcrReview(ocrMeta, documentType, recordData);
}

export function reviewLooksInvoiceLike(review) {
  const issues = Array.isArray(review?.issues) ? review.issues : [];
  return issues.some((issue) => (
    issue?.field === 'invoice_number' ||
    issue?.field === 'invoice_code' ||
    String(issue?.code || '').includes('invoice')
  ));
}

export function inferDirectOcrDocumentType(recordData, ocrMeta = {}) {
  if (ocrMeta?.review?.documentType === 'invoice' || ocrMeta?.review?.documentType === 'payment') {
    return ocrMeta.review.documentType;
  }

  if (reviewLooksInvoiceLike(ocrMeta?.review)) {
    return 'invoice';
  }

  if (recordData?.has_invoice || recordData?.invoice_number || recordData?.invoice_code) {
    return 'invoice';
  }

  return 'payment';
}

export function refreshRecordOcrReviewMeta(ocrMeta, recordData) {
  if (!isPlainObject(ocrMeta)) return ocrMeta || null;

  const hasGroupedMeta = isPlainObject(ocrMeta.invoice) || isPlainObject(ocrMeta.payment);
  if (hasGroupedMeta) {
    return {
      ...ocrMeta,
      ...(isPlainObject(ocrMeta.invoice)
        ? { invoice: attachDocumentReview(ocrMeta.invoice, 'invoice', recordData) }
        : {}),
      ...(isPlainObject(ocrMeta.payment)
        ? { payment: attachDocumentReview(ocrMeta.payment, 'payment', recordData) }
        : {}),
    };
  }

  return attachDocumentReview(
    ocrMeta,
    inferDirectOcrDocumentType(recordData, ocrMeta),
    recordData
  );
}

export function buildReviewRecordData(documentType, ocrResult = {}) {
  if (documentType === 'invoice') {
    return buildInvoiceRecordData(ocrResult);
  }

  if (documentType === 'payment') {
    return buildPaymentReviewRecordData(ocrResult);
  }

  return ocrResult || {};
}

export function buildInvoiceRecordData(invoiceData = {}) {
  return {
    payment_date: normalizeReimbursementDate(invoiceData.payment_date ?? invoiceData.date),
    invoice_code: invoiceData.invoice_code ?? invoiceData.invoiceCode ?? null,
    invoice_number: invoiceData.invoice_number ?? invoiceData.invoiceNumber ?? null,
    category: invoiceData.category || null,
    sub_category: invoiceData.sub_category ?? invoiceData.subCategory ?? null,
    description: invoiceData.description ?? invoiceData.details ?? null,
    expense: toPositiveNullableNumber(invoiceData.expense ?? invoiceData.amount),
    company: invoiceData.company ?? invoiceData.buyer ?? null,
    has_invoice: true,
    unit_price: toPositiveNullableNumber(invoiceData.unit_price ?? invoiceData.unitPrice),
    unit: invoiceData.unit ?? null,
    quantity: toNullableNumber(invoiceData.quantity),
    remarks: invoiceData.remarks ?? null,
  };
}

export function buildStandalonePaymentRecordData(paymentData = {}, remarks = '由付款凭证识别生成') {
  const amount = Number(paymentData.amount) || 0;

  return {
    payment_date: normalizeReimbursementDate(paymentData.date),
    category: paymentData.category || '其他费用',
    sub_category: paymentData.subCategory || '付款凭证',
    description: paymentData.payee || paymentData.targetName || '付款凭证',
    expense: amount || null,
    has_invoice: false,
    company: paymentData.payee || paymentData.targetName || null,
    remarks,
  };
}
