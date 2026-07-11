import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveReimbursementExportName } from '../src/modules/reimbursement/reimbursement-export-name.js';

describe('reimbursement export naming', () => {
    it('prefers the trimmed project short name', () => {
        assert.equal(
            resolveReimbursementExportName({ short_name: '  AUP  ', name: 'Async Upload Project' }),
            'AUP'
        );
    });

    it('falls back to the trimmed project name', () => {
        assert.equal(
            resolveReimbursementExportName({ short_name: ' ', name: '  Async Upload Project  ' }),
            'Async Upload Project'
        );
    });

    it('uses the requested fallback for missing project names', () => {
        assert.equal(resolveReimbursementExportName(null, 'Export'), 'Export');
    });
});
