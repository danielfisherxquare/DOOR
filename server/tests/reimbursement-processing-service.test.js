import assert from 'node:assert/strict';
import test from 'node:test';

import * as facade from '../src/modules/reimbursement/reimbursement.service.js';
import * as processing from '../src/modules/reimbursement/reimbursement-processing.service.js';

const processingExports = [
  'startProcessingFile',
  'getProcessingStats',
  'getProcessingJobs',
  'getDuplicateFiles',
  'getErrorFiles',
  'clearProcessingRecords',
];

test('reimbursement service preserves the processing API through the focused module', () => {
  for (const exportName of processingExports) {
    assert.equal(facade[exportName], processing[exportName], exportName);
  }
});
