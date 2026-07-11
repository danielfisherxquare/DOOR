import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInvoiceRecordData,
  buildStandalonePaymentRecordData,
  compareRecordOrder,
  inferDirectOcrDocumentType,
  normalizeReimbursementDate,
} from '../src/modules/reimbursement/reimbursement-record-data.js';

test('reimbursement record data normalizes supported date formats', () => {
  assert.equal(normalizeReimbursementDate('2026 年 7 月 2 日'), '2026-07-02');
  assert.equal(normalizeReimbursementDate('2026/7/3'), '2026-07-03');
  assert.equal(normalizeReimbursementDate('invalid'), null);
  assert.equal(normalizeReimbursementDate(null), null);
});

test('invoice and payment builders preserve aliases and positive monetary values', () => {
  assert.deepEqual(buildInvoiceRecordData({
    date: '2026-07-04',
    invoiceCode: 'CODE-1',
    invoiceNumber: 'NO-1',
    subCategory: '交通',
    amount: '-88.5',
    unitPrice: '-44.25',
    quantity: '2',
  }), {
    payment_date: '2026-07-04',
    invoice_code: 'CODE-1',
    invoice_number: 'NO-1',
    category: null,
    sub_category: '交通',
    description: null,
    expense: 88.5,
    company: null,
    has_invoice: true,
    unit_price: 44.25,
    unit: null,
    quantity: 2,
    remarks: null,
  });

  const payment = buildStandalonePaymentRecordData({
    date: '2026-07-05',
    amount: '20',
    targetName: '测试商户',
  });
  assert.equal(payment.expense, 20);
  assert.equal(payment.company, '测试商户');
  assert.equal(payment.has_invoice, false);
});

test('record ordering keeps empty categories last and uses numeric text ordering', () => {
  const records = [
    { category: '', sub_category: '', payment_date: '', index: 1 },
    { category: '交通10', sub_category: '', payment_date: '2026-07-02', index: 2 },
    { category: '交通2', sub_category: '', payment_date: '2026-07-03', index: 3 },
  ];
  records.sort(compareRecordOrder);
  assert.deepEqual(records.map((record) => record.category), ['交通2', '交通10', '']);
});

test('direct OCR document type follows review evidence before record fields', () => {
  assert.equal(inferDirectOcrDocumentType({}, { review: { documentType: 'payment' } }), 'payment');
  assert.equal(inferDirectOcrDocumentType({}, {
    review: { issues: [{ field: 'invoice_number', code: 'missing' }] },
  }), 'invoice');
  assert.equal(inferDirectOcrDocumentType({ has_invoice: true }, {}), 'invoice');
  assert.equal(inferDirectOcrDocumentType({}, {}), 'payment');
});
