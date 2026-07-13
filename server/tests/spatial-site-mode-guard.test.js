import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertGenericWorkZoneMutationAllowed,
    isSiteModeBoundWorkZone,
} from '../src/modules/inventory/inventory.spatial.site-mode-guard.js';

describe('site-mode work-zone mutation guard', () => {
    it('recognizes both the persisted purpose and legacy bake snapshot', () => {
        assert.equal(isSiteModeBoundWorkZone({ metadata: { purpose: 'site-mode' } }), true);
        assert.equal(isSiteModeBoundWorkZone({ snapshotJson: { siteBake: {} } }), true);
        assert.equal(isSiteModeBoundWorkZone({ metadata: { purpose: 'map-selection-export' } }), false);
    });

    it('rejects generic mutations with a safe project-bound error', () => {
        const zone = {
            id: 'zone-site',
            projectId: 'project-site',
            metadata: { purpose: 'site-mode' },
        };

        assert.throws(
            () => assertGenericWorkZoneMutationAllowed(zone),
            (error) => {
                assert.equal(error.statusCode, 409);
                assert.equal(error.publicCode, 'SITE_MODE_BOUND');
                assert.equal(error.expose, true);
                assert.deepEqual(error.data, {
                    projectId: 'project-site',
                    focusZoneId: 'zone-site',
                });
                return true;
            },
        );
    });

    it('keeps ordinary export work zones mutable', () => {
        const zone = { id: 'zone-export', metadata: { purpose: 'map-selection-export' } };
        assert.strictEqual(assertGenericWorkZoneMutationAllowed(zone), zone);
    });
});
