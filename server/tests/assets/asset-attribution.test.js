import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAsset } from '../../src/modules/assets/asset.repository.js';

const baseRow = {
    id: 'asset-1',
    org_id: 'org-1',
    library_id: 'library-1',
    folder_id: null,
    name: 'brand-mark.svg',
    kind: 'image',
    note: null,
    rating: null,
    revision: 1,
    current_version: 1,
    size: 1024,
    sha256: 'a'.repeat(64),
    mime_type: 'image/svg+xml',
    width: 800,
    height: 600,
    thumbnail_key: null,
    deleted_at: null,
    created_at: '2026-07-16T08:00:00.000Z',
    updated_at: '2026-07-16T08:00:00.000Z',
};

test('maps uploader and updater as public account identities', () => {
    const asset = mapAsset({
        ...baseRow,
        created_by_user_id: 'user-a',
        created_by_username: 'designer-a',
        updated_by_user_id: 'user-b',
        updated_by_username: 'designer-b',
    });
    assert.deepEqual(asset.createdBy, { id: 'user-a', username: 'designer-a' });
    assert.deepEqual(asset.updatedBy, { id: 'user-b', username: 'designer-b' });
    assert.equal('email' in asset.createdBy, false);
});

test('keeps attribution nullable for legacy or removed users', () => {
    const legacy = mapAsset(baseRow);
    assert.equal(legacy.createdBy, null);
    assert.equal(legacy.updatedBy, null);

    const removed = mapAsset({ ...baseRow, created_by_user_id: 'removed-user', created_by_username: null });
    assert.deepEqual(removed.createdBy, { id: 'removed-user', username: '已停用账号' });
});
