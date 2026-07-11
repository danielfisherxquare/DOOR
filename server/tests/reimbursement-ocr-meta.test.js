import assert from 'node:assert/strict';
import test from 'node:test';

import { isPlainObject, mergeRecordOcrMeta } from '../src/modules/reimbursement/reimbursement-ocr-meta.js';

test('isPlainObject accepts records but rejects arrays and null', () => {
    assert.equal(isPlainObject({ review: {} }), true);
    assert.equal(isPlainObject([]), false);
    assert.equal(isPlainObject(null), false);
});

test('mergeRecordOcrMeta preserves an existing ungrouped document as the counterpart', () => {
    const existingInvoiceMeta = { model: 'invoice-v1', review: { documentType: 'invoice' } };
    const paymentMeta = { model: 'payment-v2', review: { documentType: 'payment' } };

    assert.deepEqual(mergeRecordOcrMeta(existingInvoiceMeta, 'payment', paymentMeta), {
        invoice: existingInvoiceMeta,
        payment: paymentMeta,
    });
});

test('mergeRecordOcrMeta replaces one grouped document without dropping the other', () => {
    const invoiceMeta = { model: 'invoice-v1' };
    const oldPaymentMeta = { model: 'payment-v1' };
    const newPaymentMeta = { model: 'payment-v2' };

    assert.deepEqual(
        mergeRecordOcrMeta(
            { invoice: invoiceMeta, payment: oldPaymentMeta, source: 'preview' },
            'payment',
            newPaymentMeta,
        ),
        { invoice: invoiceMeta, payment: newPaymentMeta, source: 'preview' },
    );
});

