import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExportCheckRows } from '../src/modules/reimbursement/reimbursement-export-checks.js';

test('buildExportCheckRows reports missing fields and required attachments', () => {
  const records = [{ id: 'record-1', index: 1, has_invoice: true, expense: 120 }];

  assert.deepEqual(buildExportCheckRows(records, new Map()), [
    {
      label: '第1行',
      type: '关键字段',
      message: '缺少日期、大类、子类、说明、报销人、发票号码/代码',
      action: '在报销明细表补齐字段',
    },
    {
      label: '第1行',
      type: '发票附件',
      message: '缺少发票附件',
      action: '上传或重新关联发票原件',
    },
  ]);
});

test('buildExportCheckRows preserves OCR review and duplicate invoice checks', () => {
  const records = [
    {
      id: 'record-1',
      index: 1,
      payment_date: '2026-07-11',
      category: '交通费',
      sub_category: '火车票',
      description: '差旅',
      expense: 120,
      reporter: '张三',
      has_invoice: true,
      invoice_number: 'INV-001',
      ocr_meta: {
        invoice: {
          review: {
            status: 'needs_review',
            issueCount: 1,
            issues: [{ field: 'amount', label: '金额', message: '金额不一致' }],
          },
        },
      },
    },
    {
      id: 'record-2',
      index: 2,
      payment_date: '2026-07-11',
      category: '交通费',
      sub_category: '火车票',
      description: '返程',
      expense: 130,
      reporter: '李四',
      has_invoice: true,
      invoice_number: 'INV-001',
    },
  ];
  const imagesByRecord = new Map([
    ['record-1', [{ fileType: 'invoice' }]],
    ['record-2', [{ fileType: 'invoice' }]],
  ]);

  const checks = buildExportCheckRows(records, imagesByRecord);

  assert.equal(checks.filter((check) => check.type === '发票重复').length, 2);
  assert.deepEqual(checks[0], {
    label: '第1行',
    type: 'OCR复核',
    message: '金额：金额不一致',
    action: '补齐或确认识别字段后再归档',
  });
});
