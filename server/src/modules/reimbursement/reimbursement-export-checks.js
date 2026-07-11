import { isPlainObject } from './reimbursement-ocr-meta.js';

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function hasPositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function getExportRecordLabel(record, fallbackIndex) {
  return `第${record?.index || fallbackIndex + 1}行`;
}

function getRecordInvoiceIdentifier(record) {
  return String(record?.invoice_number || record?.invoice_code || '').trim();
}

function getMissingExportFields(record) {
  const missing = [];

  if (!hasText(record?.payment_date)) missing.push('日期');
  if (!hasText(record?.category)) missing.push('大类');
  if (!hasText(record?.sub_category)) missing.push('子类');
  if (!hasText(record?.description)) missing.push('说明');
  if (!hasPositiveAmount(record?.expense)) missing.push('金额');
  if (!hasText(record?.reporter)) missing.push('报销人');
  if (record?.has_invoice && !getRecordInvoiceIdentifier(record)) missing.push('发票号码/代码');

  return missing;
}

function requiresPaymentAttachment(record) {
  return !record?.has_invoice && hasPositiveAmount(record?.expense);
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

function getOcrReviewIssues(record) {
  return [
    ...normalizeOcrReviewEntries(record?.ocr_meta),
    ...normalizeOcrReviewEntries(record?.ocrMeta),
  ].flatMap((review) => (Array.isArray(review.issues) ? review.issues : []));
}

function needsOcrReview(record) {
  const reviews = [
    ...normalizeOcrReviewEntries(record?.ocr_meta),
    ...normalizeOcrReviewEntries(record?.ocrMeta),
  ];
  const issueCount = reviews.reduce((sum, review) => sum + (Number(review.issueCount) || 0), 0);
  return issueCount > 0 || reviews.some((review) => review.status === 'needs_review');
}

function hasExportAttachment(record, imagesByRecord, fileType) {
  return (imagesByRecord.get(record.id) || []).some((attachment) => attachment.fileType === fileType);
}

function countInvoiceIdentifiers(records) {
  const counts = new Map();

  records.forEach((record) => {
    const identifier = getRecordInvoiceIdentifier(record);
    if (!identifier) return;
    counts.set(identifier, [...(counts.get(identifier) || []), record]);
  });

  return counts;
}

export function buildExportCheckRows(records, imagesByRecord) {
  const rows = [];
  const invoiceIdentifiers = countInvoiceIdentifiers(records);

  records.forEach((record, index) => {
    const label = getExportRecordLabel(record, index);
    const reviewIssues = getOcrReviewIssues(record);

    if (needsOcrReview(record)) {
      const details = reviewIssues.length > 0
        ? reviewIssues.map((issue) => `${issue.label || issue.field || '字段'}：${issue.message || '需要人工复核'}`).join('；')
        : 'OCR 识别结果需要人工复核';
      rows.push({
        label,
        type: 'OCR复核',
        message: details,
        action: '补齐或确认识别字段后再归档',
      });
    }

    const missingFields = getMissingExportFields(record);
    if (missingFields.length > 0) {
      rows.push({
        label,
        type: '关键字段',
        message: '缺少' + missingFields.join('、'),
        action: '在报销明细表补齐字段',
      });
    }

    if (record?.has_invoice && !hasExportAttachment(record, imagesByRecord, 'invoice')) {
      rows.push({
        label,
        type: '发票附件',
        message: '缺少发票附件',
        action: '上传或重新关联发票原件',
      });
    }

    if (requiresPaymentAttachment(record) && !hasExportAttachment(record, imagesByRecord, 'payment')) {
      rows.push({
        label,
        type: '付款凭证',
        message: '缺少付款凭证附件',
        action: '上传或重新关联付款凭证',
      });
    }

    const invoiceIdentifier = getRecordInvoiceIdentifier(record);
    const duplicateRecords = invoiceIdentifier ? invoiceIdentifiers.get(invoiceIdentifier) || [] : [];
    if (duplicateRecords.length > 1) {
      const duplicateLabels = duplicateRecords
        .map((duplicateRecord) => getExportRecordLabel(duplicateRecord, records.indexOf(duplicateRecord)))
        .join('、');
      rows.push({
        label,
        type: '发票重复',
        message: `${invoiceIdentifier} 与 ${duplicateLabels} 重复`,
        action: '核对是否重复报销',
      });
    }
  });

  return rows;
}

function styleExportCheckRow(row, fillColor = 'FFFFFFFF') {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.font = { name: 'Microsoft YaHei', size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

export function addExportCheckWorksheet(workbook, records, imagesByRecord) {
  const checkRows = buildExportCheckRows(records, imagesByRecord);
  const sheet = workbook.addWorksheet('导出检查', {
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { key: 'Row', width: 12 },
    { key: 'Type', width: 16 },
    { key: 'Message', width: 54 },
    { key: 'Action', width: 28 },
  ];

  sheet.mergeCells('A1:D1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = '导出检查';
  titleCell.font = { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 28;

  const headerRow = sheet.addRow({
    Row: '明细行',
    Type: '风险类型',
    Message: '检查结果',
    Action: '处理建议',
  });
  headerRow.font = { name: 'Microsoft YaHei', size: 10, bold: true };
  styleExportCheckRow(headerRow, 'FFEDEDED');

  if (checkRows.length === 0) {
    styleExportCheckRow(sheet.addRow({
      Row: '全部',
      Type: '已通过',
      Message: '当前导出未发现 OCR 复核、关键字段、发票附件或重复发票风险',
      Action: '可归档流转',
    }));
    return;
  }

  checkRows.forEach((checkRow) => {
    styleExportCheckRow(sheet.addRow({
      Row: checkRow.label,
      Type: checkRow.type,
      Message: checkRow.message,
      Action: checkRow.action,
    }), 'FFFFF7ED');
  });
}
