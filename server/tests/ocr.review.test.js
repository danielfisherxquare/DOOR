import test from 'node:test';
import assert from 'node:assert/strict';

import { attachOcrReview, buildOcrReview } from '../src/modules/reimbursement/ocr.review.js';

test('buildOcrReview flags incomplete invoice fields for operator review', () => {
  const review = buildOcrReview('invoice', {
    payment_date: null,
    invoice_code: null,
    invoice_number: null,
    category: '办公费',
    sub_category: '',
    expense: null,
    company: '',
  });

  assert.equal(review.status, 'needs_review');
  assert.equal(review.issueCount, 5);
  assert.deepEqual(
    review.issues.map((issue) => issue.code),
    [
      'missing_amount',
      'missing_date',
      'missing_company',
      'missing_invoice_identifier',
      'missing_sub_category',
    ],
  );
});

test('buildOcrReview treats complete payment voucher fields as ready', () => {
  const review = buildOcrReview('payment', {
    payment_date: '2026-05-12',
    category: '交通费',
    sub_category: '网约车',
    expense: 48.5,
    company: '滴滴出行',
  });

  assert.equal(review.status, 'ready');
  assert.equal(review.issueCount, 0);
  assert.deepEqual(review.issues, []);
});

test('attachOcrReview preserves OCR metrics and adds review details', () => {
  const meta = {
    modelCallCount: 1,
    durationMs: 820,
    usage: {
      totalTokens: 620,
    },
  };

  const nextMeta = attachOcrReview(meta, 'payment', {
    payment_date: null,
    expense: 0,
    company: null,
  });

  assert.notEqual(nextMeta, meta);
  assert.equal(nextMeta.modelCallCount, 1);
  assert.equal(nextMeta.usage.totalTokens, 620);
  assert.equal(nextMeta.review.status, 'needs_review');
  assert.deepEqual(
    nextMeta.review.issues.map((issue) => issue.field),
    ['expense', 'payment_date', 'company', 'category', 'sub_category'],
  );
});
