function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOcrMetaEntries(meta) {
  if (!isPlainObject(meta)) return [];

  if (meta.usage || meta.modelCallCount || meta.durationMs || meta.calls) {
    return [meta];
  }

  return Object.values(meta).filter(isPlainObject);
}

function collectRecordOcrMeta(record) {
  if (!isPlainObject(record)) return [];

  return [
    ...normalizeOcrMetaEntries(record.ocrMeta),
    ...normalizeOcrMetaEntries(record.ocr_meta),
  ];
}

function normalizeOcrReviewEntries(meta) {
  if (!isPlainObject(meta)) return [];

  if (isPlainObject(meta.review)) {
    return [meta.review];
  }

  if (meta.status === 'needs_review' || meta.status === 'ready') {
    return [meta];
  }

  return Object.values(meta)
    .filter(isPlainObject)
    .flatMap((value) => normalizeOcrReviewEntries(value));
}

function collectRecordOcrReviews(record) {
  if (!isPlainObject(record)) return [];

  return [
    ...normalizeOcrReviewEntries(record.ocrMeta),
    ...normalizeOcrReviewEntries(record.ocr_meta),
  ];
}

function normalizeReviewIssue(issue) {
  if (!isPlainObject(issue)) return null;

  return {
    field: issue.field || '',
    code: issue.code || '',
    label: issue.label || issue.field || '字段',
    message: issue.message || issue.code || '需要人工复核',
    level: issue.level || 'warning',
  };
}

function createImageOptimizationSummary() {
  return {
    imageCount: 0,
    originalBytes: 0,
    optimizedBytes: 0,
    savedBytes: 0,
    savedRatio: 0,
  };
}

function addImageOptimizationSummary(summary, value) {
  if (!isPlainObject(value)) return;

  const originalBytes = toNumber(value.originalBytes);
  const optimizedBytes = toNumber(value.optimizedBytes);
  const savedBytes = toNumber(value.savedBytes)
    || (originalBytes > optimizedBytes ? originalBytes - optimizedBytes : 0);

  summary.imageCount += toNumber(value.imageCount) || (originalBytes > 0 ? 1 : 0);
  summary.originalBytes += originalBytes;
  summary.optimizedBytes += optimizedBytes;
  summary.savedBytes += savedBytes;
}

export function summarizeOcrMetrics(records = []) {
  const summary = {
    coveredRecordCount: 0,
    modelCallCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    durationMs: 0,
    averageDurationMs: 0,
    imageOptimization: createImageOptimizationSummary(),
  };

  if (!Array.isArray(records) || records.length === 0) {
    return summary;
  }

  for (const record of records) {
    const entries = collectRecordOcrMeta(record);
    if (entries.length === 0) continue;

    summary.coveredRecordCount += 1;

    for (const entry of entries) {
      const usage = isPlainObject(entry.usage) ? entry.usage : {};
      summary.modelCallCount += toNumber(entry.modelCallCount);
      summary.promptTokens += toNumber(usage.promptTokens);
      summary.completionTokens += toNumber(usage.completionTokens);
      summary.totalTokens += toNumber(usage.totalTokens);
      summary.durationMs += toNumber(entry.durationMs);
      addImageOptimizationSummary(summary.imageOptimization, entry.imageOptimization);
    }
  }

  summary.averageDurationMs = summary.coveredRecordCount > 0
    ? Math.round(summary.durationMs / summary.coveredRecordCount)
    : 0;
  summary.imageOptimization.savedRatio = summary.imageOptimization.originalBytes > 0
    ? Math.round((summary.imageOptimization.savedBytes / summary.imageOptimization.originalBytes) * 10000) / 10000
    : 0;

  return summary;
}

export function collectOcrReviewIssues(record) {
  return collectRecordOcrReviews(record)
    .flatMap((review) => (Array.isArray(review.issues) ? review.issues : []))
    .map(normalizeReviewIssue)
    .filter(Boolean);
}

export function getOcrReviewStatus(record) {
  const reviews = collectRecordOcrReviews(record);
  const issues = collectOcrReviewIssues(record);
  const issueCount = issues.length || reviews.reduce((sum, review) => sum + toNumber(review.issueCount), 0);
  const needsReview = issueCount > 0 || reviews.some((review) => review.status === 'needs_review');
  const title = issues
    .map((issue) => `${issue.label}：${issue.message}`)
    .join('；');

  return {
    needsReview,
    issueCount,
    issues,
    title,
  };
}

export function summarizeOcrReview(records = []) {
  const summary = {
    needsReviewCount: 0,
    issueCount: 0,
  };

  if (!Array.isArray(records) || records.length === 0) {
    return summary;
  }

  for (const record of records) {
    const status = getOcrReviewStatus(record);
    if (!status.needsReview) continue;

    summary.needsReviewCount += 1;
    summary.issueCount += status.issueCount;
  }

  return summary;
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function hasPositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function getRecordLabel(record, fallbackIndex) {
  const rowNumber = record?.index || fallbackIndex + 1;
  return '第' + rowNumber + '行';
}

function getRecordInvoiceIdentifier(record) {
  return String(record?.invoice_number || record?.invoiceNumber || record?.invoice_code || record?.invoiceCode || '')
    .trim();
}

function countInvoiceIdentifiers(records = []) {
  const invoiceIdentifiers = new Map();

  records.forEach((record) => {
    const invoiceIdentifier = getRecordInvoiceIdentifier(record);
    if (!invoiceIdentifier) return;

    invoiceIdentifiers.set(invoiceIdentifier, (invoiceIdentifiers.get(invoiceIdentifier) || 0) + 1);
  });

  return invoiceIdentifiers;
}

function getRecordAttachments(record) {
  if (Array.isArray(record?.attachments)) return record.attachments;
  if (Array.isArray(record?.attachmentList)) return record.attachmentList;
  return [];
}

function hasAttachmentType(record, fileType) {
  return getRecordAttachments(record).some((attachment) => (
    attachment?.file_type === fileType || attachment?.fileType === fileType
  ));
}

function requiresPaymentAttachment(record) {
  return !record?.has_invoice && hasPositiveAmount(record?.expense);
}

function getMissingExportFields(record) {
  const missing = [];

  if (!hasText(record?.payment_date ?? record?.paymentDate)) missing.push('日期');
  if (!hasText(record?.category)) missing.push('大类');
  if (!hasText(record?.sub_category ?? record?.subCategory)) missing.push('子类');
  if (!hasText(record?.description)) missing.push('说明');
  if (!hasPositiveAmount(record?.expense)) missing.push('金额');
  if (!hasText(record?.reporter)) missing.push('报销人');
  if (record?.has_invoice && !getRecordInvoiceIdentifier(record)) missing.push('发票号码/代码');

  return missing;
}

export function getRecordExportIssueLabels(record, index = 0, records = []) {
  const labels = [];
  const safeRecords = Array.isArray(records) && records.length > 0 ? records : [record];
  const reviewStatus = getOcrReviewStatus(record);
  const missingFields = getMissingExportFields(record);
  const invoiceIdentifiers = countInvoiceIdentifiers(safeRecords);
  const invoiceIdentifier = getRecordInvoiceIdentifier(record);

  if (reviewStatus.needsReview) {
    labels.push('OCR复核 ' + (reviewStatus.issueCount || 1) + '项');
  }

  if (missingFields.length > 0) {
    labels.push('缺少' + missingFields.join('、'));
  }

  if (record?.has_invoice && !hasAttachmentType(record, 'invoice')) {
    labels.push('缺少发票附件');
  }

  if (requiresPaymentAttachment(record) && !hasAttachmentType(record, 'payment')) {
    labels.push('缺少付款凭证附件');
  }

  if (invoiceIdentifier && invoiceIdentifiers.get(invoiceIdentifier) > 1) {
    labels.push('发票重复');
  }

  return labels;
}

function summarizeWarningLines(warnings) {
  return warnings
    .slice(0, 6)
    .map((warning) => '- ' + warning.message)
    .join('\n');
}

export function summarizeExportReadiness(records = []) {
  const warnings = [];
  const safeRecords = Array.isArray(records) ? records : [];
  const reviewRecords = [];
  const missingFieldRecords = [];
  const missingAttachmentRecords = [];
  const missingPaymentAttachmentRecords = [];
  const invoiceIdentifiers = new Map();

  safeRecords.forEach((record, index) => {
    const label = getRecordLabel(record, index);
    const reviewStatus = getOcrReviewStatus(record);
    if (reviewStatus.needsReview) {
      reviewRecords.push({ label, issueCount: reviewStatus.issueCount });
    }

    const missingFields = getMissingExportFields(record);
    if (missingFields.length > 0) {
      missingFieldRecords.push({ label, fields: missingFields });
    }

    if (record?.has_invoice && !hasAttachmentType(record, 'invoice')) {
      missingAttachmentRecords.push(label);
    }

    if (requiresPaymentAttachment(record) && !hasAttachmentType(record, 'payment')) {
      missingPaymentAttachmentRecords.push(label);
    }

    const invoiceIdentifier = getRecordInvoiceIdentifier(record);
    if (invoiceIdentifier) {
      const current = invoiceIdentifiers.get(invoiceIdentifier) || [];
      current.push(label);
      invoiceIdentifiers.set(invoiceIdentifier, current);
    }
  });

  if (reviewRecords.length > 0) {
    warnings.push({
      code: 'ocr_review',
      count: reviewRecords.length,
      message: reviewRecords.length + ' 条记录仍有 OCR 复核项',
      records: reviewRecords,
    });
  }

  if (missingFieldRecords.length > 0) {
    const sample = missingFieldRecords
      .slice(0, 3)
      .map((item) => item.label + '缺少' + item.fields.join('、'))
      .join('；');
    warnings.push({
      code: 'missing_required_fields',
      count: missingFieldRecords.length,
      message: missingFieldRecords.length + ' 条记录缺少导出关键字段：' + sample,
      records: missingFieldRecords,
    });
  }

  if (missingAttachmentRecords.length > 0) {
    warnings.push({
      code: 'missing_invoice_attachment',
      count: missingAttachmentRecords.length,
      message: missingAttachmentRecords.length + ' 条有发票记录缺少发票附件',
      records: missingAttachmentRecords,
    });
  }

  if (missingPaymentAttachmentRecords.length > 0) {
    warnings.push({
      code: 'missing_payment_attachment',
      count: missingPaymentAttachmentRecords.length,
      message: missingPaymentAttachmentRecords.length + ' 条无发票支出缺少付款凭证附件',
      records: missingPaymentAttachmentRecords,
    });
  }

  const duplicateInvoiceGroups = Array.from(invoiceIdentifiers.entries())
    .filter(([, labels]) => labels.length > 1)
    .map(([invoiceIdentifier, labels]) => ({ invoiceIdentifier, labels }));

  if (duplicateInvoiceGroups.length > 0) {
    const sample = duplicateInvoiceGroups
      .slice(0, 3)
      .map((group) => group.invoiceIdentifier + '(' + group.labels.join('、') + ')')
      .join('；');
    warnings.push({
      code: 'duplicate_invoice_number',
      count: duplicateInvoiceGroups.length,
      message: duplicateInvoiceGroups.length + ' 组发票号码/代码重复：' + sample,
      records: duplicateInvoiceGroups,
    });
  }

  const warningCount = warnings.reduce((sum, warning) => sum + warning.count, 0);
  const ready = safeRecords.length > 0 && warningCount === 0;
  const confirmMessage = ready
    ? ''
    : '仍有 ' + warningCount + ' 项导出风险：\n' + summarizeWarningLines(warnings) + '\n确认继续导出？';

  return {
    ready,
    warningCount,
    recordCount: safeRecords.length,
    needsReviewCount: reviewRecords.length,
    missingFieldCount: missingFieldRecords.length,
    missingAttachmentCount: missingAttachmentRecords.length + missingPaymentAttachmentRecords.length,
    missingInvoiceAttachmentCount: missingAttachmentRecords.length,
    missingPaymentAttachmentCount: missingPaymentAttachmentRecords.length,
    duplicateInvoiceCount: duplicateInvoiceGroups.length,
    warnings,
    confirmMessage,
  };
}

export function formatOcrTokens(value) {
  const tokens = toNumber(value);
  if (!tokens) return '-';
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}k`;
}

export function formatOcrDuration(value) {
  const durationMs = toNumber(value);
  if (!durationMs) return '-';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatOcrImageSavings(value) {
  if (!isPlainObject(value)) return '-';

  const originalBytes = toNumber(value.originalBytes);
  const savedBytes = toNumber(value.savedBytes);
  if (!originalBytes || !savedBytes) return '-';

  return `节省 ${Math.round((savedBytes / originalBytes) * 100)}%`;
}
