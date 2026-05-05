import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGlbFromBatchFile } from '../../server/src/modules/inventory/inventory.spatial.export.js';

test('white-model glb builder outputs glb header', () => {
    const glb = buildGlbFromBatchFile({
        meshes: [{
            id: 'mesh-1',
            color: '#d9d9d9',
            vertices: [
                0, 0, 0,
                1, 0, 0,
                0, 1, 0,
            ],
            indices: [0, 1, 2],
        }],
    });

    assert.ok(glb.length > 20);
    assert.equal(glb.readUInt32LE(0), 0x46546c67);
});
