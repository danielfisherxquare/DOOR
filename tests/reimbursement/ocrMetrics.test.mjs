import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectOcrReviewIssues,
  formatOcrDuration,
  formatOcrImageSavings,
  formatOcrTokens,
  getRecordExportIssueLabels,
  getOcrReviewStatus,
  summarizeOcrMetrics,
  summarizeExportReadiness,
  summarizeOcrReview,
} from '../../src/views/reimbursement/utils/ocrMetrics.js';

test('summarizeOcrMetrics aggregates direct and grouped OCR metadata', () => {
  const records = [
    {
      id: 'record-direct',
      ocrMeta: {
        modelCallCount: 1,
        durationMs: 1210,
        usage: {
          promptTokens: 900,
          completionTokens: 80,
          totalTokens: 980,
        },
        imageOptimization: {
          imageCount: 1,
          originalBytes: 1200000,
          optimizedBytes: 360000,
          savedBytes: 840000,
        },
      },
    },
    {
      id: 'record-grouped',
      ocr_meta: {
        invoice: {
          modelCallCount: 2,
          durationMs: 3420,
          usage: {
            totalTokens: 1500,
          },
          imageOptimization: {
            imageCount: 1,
            originalBytes: 900000,
            optimizedBytes: 450000,
            savedBytes: 450000,
          },
        },
        payment: {
          modelCallCount: 1,
          durationMs: 880,
          usage: {
            promptTokens: 300,
            completionTokens: 42,
            totalTokens: 342,
          },
        },
      },
    },
    {
      id: 'record-without-meta',
      ocrMeta: null,
    },
  ];

  const summary = summarizeOcrMetrics(records);

  assert.equal(summary.coveredRecordCount, 2);
  assert.equal(summary.modelCallCount, 4);
  assert.equal(summary.totalTokens, 2822);
  assert.equal(summary.promptTokens, 1200);
  assert.equal(summary.completionTokens, 122);
  assert.equal(summary.durationMs, 5510);
  assert.equal(summary.averageDurationMs, 2755);
  assert.equal(summary.imageOptimization.imageCount, 2);
  assert.equal(summary.imageOptimization.originalBytes, 2100000);
  assert.equal(summary.imageOptimization.optimizedBytes, 810000);
  assert.equal(summary.imageOptimization.savedBytes, 1290000);
});

test('formatOcrTokens and formatOcrDuration produce compact operator labels', () => {
  assert.equal(formatOcrTokens(999), '999');
  assert.equal(formatOcrTokens(1280), '1.3k');
  assert.equal(formatOcrTokens(0), '-');
  assert.equal(formatOcrDuration(940), '0.9s');
  assert.equal(formatOcrDuration(61200), '61.2s');
  assert.equal(formatOcrDuration(null), '-');
  assert.equal(formatOcrImageSavings({ savedBytes: 1290000, originalBytes: 2100000 }), '节省 61%');
  assert.equal(formatOcrImageSavings(null), '-');
});

test('summarizeOcrReview aggregates direct and grouped OCR review issues', () => {
  const records = [
    {
      id: 'direct-review',
      ocrMeta: {
        review: {
          status: 'needs_review',
          issueCount: 1,
          issues: [{ field: 'invoice_number', label: '发票号码', message: '缺少发票号码' }],
        },
      },
    },
    {
      id: 'grouped-review',
      ocr_meta: {
        invoice: {
          review: {
            status: 'ready',
            issueCount: 0,
            issues: [],
          },
        },
        payment: {
          review: {
            status: 'needs_review',
            issueCount: 2,
            issues: [
              { field: 'expense', label: '金额', message: '缺少金额' },
              { field: 'payment_date', label: '日期', message: '缺少日期' },
            ],
          },
        },
      },
    },
  ];

  const summary = summarizeOcrReview(records);
  const status = getOcrReviewStatus(records[1]);

  assert.equal(summary.needsReviewCount, 2);
  assert.equal(summary.issueCount, 3);
  assert.equal(status.needsReview, true);
  assert.equal(status.issueCount, 2);
  assert.equal(status.title, '金额：缺少金额；日期：缺少日期');
  assert.equal(collectOcrReviewIssues(records[0]).length, 1);
});

test('summarizeExportReadiness surfaces unresolved review, missing fields, missing attachments, and duplicate invoices', () => {
  const records = [
    {
      id: 'review-risk',
      index: 1,
      payment_date: '2026-04-20',
      category: '交通费',
      sub_category: '打车费',
      description: '机场打车',
      expense: 88,
      reporter: '张三',
      has_invoice: true,
      invoice_number: 'DUP-001',
      attachments: [{ file_type: 'invoice' }],
      ocr_meta: {
        review: {
          status: 'needs_review',
          issueCount: 1,
          issues: [{ field: 'company', label: '开票公司', message: '缺少开票公司' }],
        },
      },
    },
    {
      id: 'missing-risk',
      index: 2,
      payment_date: '',
      category: '',
      sub_category: '餐费',
      description: '晚餐',
      expense: 0,
      reporter: '',
      has_invoice: true,
      invoice_number: '',
      attachments: [],
    },
    {
      id: 'duplicate-risk',
      index: 3,
      payment_date: '2026-04-21',
      category: '交通费',
      sub_category: '打车费',
      description: '市内打车',
      expense: 66,
      reporter: '李四',
      has_invoice: true,
      invoice_number: 'DUP-001',
      attachments: [{ file_type: 'invoice' }],
    },
  ];

  const readiness = summarizeExportReadiness(records);

  assert.equal(readiness.ready, false);
  assert.equal(readiness.warningCount, 4);
  assert.equal(readiness.needsReviewCount, 1);
  assert.equal(readiness.missingFieldCount, 1);
  assert.equal(readiness.missingAttachmentCount, 1);
  assert.equal(readiness.duplicateInvoiceCount, 1);
  assert.match(readiness.confirmMessage, /仍有 4 项导出风险/);
  assert.ok(readiness.warnings.some((warning) => warning.code === 'ocr_review'));
  assert.ok(readiness.warnings.some((warning) => warning.code === 'missing_required_fields'));
  assert.ok(readiness.warnings.some((warning) => warning.code === 'missing_invoice_attachment'));
  assert.ok(readiness.warnings.some((warning) => warning.code === 'duplicate_invoice_number'));
});

test('getRecordExportIssueLabels identifies row-level export risks for review queues', () => {
  const records = [
    {
      id: 'review-risk',
      index: 1,
      payment_date: '2026-04-20',
      category: '交通费',
      sub_category: '打车费',
      description: '机场打车',
      expense: 88,
      reporter: '张三',
      has_invoice: true,
      invoice_number: 'DUP-001',
      attachments: [{ file_type: 'invoice' }],
      ocr_meta: {
        review: {
          status: 'needs_review',
          issueCount: 1,
          issues: [{ field: 'company', label: '开票公司', message: '缺少开票公司' }],
        },
      },
    },
    {
      id: 'missing-risk',
      index: 2,
      payment_date: '',
      category: '',
      sub_category: '餐费',
      description: '晚餐',
      expense: 0,
      reporter: '',
      has_invoice: true,
      invoice_number: '',
      attachments: [],
    },
    {
      id: 'duplicate-risk',
      index: 3,
      payment_date: '2026-04-21',
      category: '交通费',
      sub_category: '打车费',
      description: '市内打车',
      expense: 66,
      reporter: '李四',
      has_invoice: true,
      invoice_number: 'DUP-001',
      attachments: [{ file_type: 'invoice' }],
    },
  ];

  assert.deepEqual(getRecordExportIssueLabels(records[0], 0, records), ['OCR复核 1项', '发票重复']);
  assert.deepEqual(getRecordExportIssueLabels(records[1], 1, records), [
    '缺少日期、大类、金额、报销人、发票号码/代码',
    '缺少发票附件',
  ]);
  assert.deepEqual(getRecordExportIssueLabels(records[2], 2, records), ['发票重复']);
});

test('summarizeExportReadiness flags rows without payment voucher attachments', () => {
  const records = [
    {
      id: 'missing-payment-proof',
      index: 1,
      payment_date: '2026-05-01',
      category: '办公费',
      sub_category: '耗材',
      description: '打印纸',
      expense: 128,
      reporter: '王五',
      has_invoice: false,
      attachments: [],
    },
    {
      id: 'complete-payment-proof',
      index: 2,
      payment_date: '2026-05-02',
      category: '办公费',
      sub_category: '耗材',
      description: '墨盒',
      expense: 256,
      reporter: '王五',
      has_invoice: false,
      attachments: [{ file_type: 'payment' }],
    },
  ];

  const readiness = summarizeExportReadiness(records);

  assert.equal(readiness.ready, false);
  assert.equal(readiness.missingAttachmentCount, 1);
  assert.ok(readiness.warnings.some((warning) => warning.code === 'missing_payment_attachment'));
  assert.deepEqual(getRecordExportIssueLabels(records[0], 0, records), ['缺少付款凭证附件']);
  assert.deepEqual(getRecordExportIssueLabels(records[1], 1, records), []);
});
