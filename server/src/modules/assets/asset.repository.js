import knex from '../../db/knex.js';

function dbOrDefault(db) {
    return db || knex;
}

function mapActor(row, prefix) {
    const id = row[`${prefix}_user_id`];
    if (!id) return null;
    return { id, username: row[`${prefix}_username`] || '已停用账号' };
}

export function mapAsset(row, tags = []) {
    if (!row) return null;
    return {
        id: row.id,
        orgId: row.org_id,
        libraryId: row.library_id,
        folderId: row.folder_id,
        name: row.name,
        kind: row.kind,
        note: row.note,
        rating: row.rating,
        revision: row.revision,
        currentVersion: row.current_version,
        size: Number(row.size),
        sha256: row.sha256,
        mimeType: row.mime_type,
        width: row.width,
        height: row.height,
        thumbnailUrl: row.thumbnail_key ? `/api/app/assets/${row.id}/thumbnail` : null,
        downloadUrl: `/api/app/assets/${row.id}/download`,
        tags,
        createdBy: mapActor(row, 'created_by'),
        updatedBy: mapActor(row, 'updated_by'),
        deletedAt: row.deleted_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

const assetSelect = [
    'assets.*',
    'asset_objects.sha256',
    'asset_objects.size',
    'asset_objects.mime_type',
    'asset_objects.object_key',
    'asset_objects.thumbnail_key',
    'asset_objects.width',
    'asset_objects.height',
    'creator.id as created_by_user_id',
    'creator.username as created_by_username',
    'updater.id as updated_by_user_id',
    'updater.username as updated_by_username',
];

export async function ensureDefaultLibrary(context, db) {
    const query = dbOrDefault(db);
    let library = await query('asset_libraries').where({ org_id: context.orgId, is_default: true }).first();
    if (library) return library;
    const inserted = await query('asset_libraries')
        .insert({ org_id: context.orgId, name: '团队素材库', slug: 'main', is_default: true, created_by: context.userId })
        .onConflict(['org_id', 'slug'])
        .ignore()
        .returning('*');
    library = inserted[0] || await query('asset_libraries').where({ org_id: context.orgId, slug: 'main' }).first();
    return library;
}

export async function listContext(context) {
    const library = await ensureDefaultLibrary(context);
    const [folders, tags] = await Promise.all([
        knex('asset_folders').where({ org_id: context.orgId, library_id: library.id }).orderBy(['sort_order', 'name']),
        knex('asset_tags').where({ org_id: context.orgId }).orderBy('name'),
    ]);
    return {
        libraries: [{ id: library.id, name: library.name, isDefault: library.is_default }],
        folders: folders.map((row) => ({ id: row.id, libraryId: row.library_id, parentId: row.parent_id, name: row.name, revision: row.revision })),
        tags: tags.map((row) => ({ id: row.id, name: row.name, color: row.color, revision: row.revision })),
    };
}

export async function getLibrary(context, libraryId, db) {
    return dbOrDefault(db)('asset_libraries').where({ id: libraryId, org_id: context.orgId }).first();
}

export async function getFolder(context, folderId, libraryId, db) {
    if (!folderId) return null;
    return dbOrDefault(db)('asset_folders').where({ id: folderId, org_id: context.orgId, library_id: libraryId }).first();
}

export async function getTag(context, tagId, db) {
    return dbOrDefault(db)('asset_tags').where({ id: tagId, org_id: context.orgId }).first();
}

export async function isFolderDescendant(context, folderId, candidateParentId) {
    const result = await knex.raw(`
        WITH RECURSIVE descendants AS (
            SELECT id FROM asset_folders WHERE parent_id = ? AND org_id = ?
            UNION ALL
            SELECT child.id
            FROM asset_folders child
            JOIN descendants parent ON child.parent_id = parent.id
            WHERE child.org_id = ?
        )
        SELECT 1 FROM descendants WHERE id = ? LIMIT 1
    `, [folderId, context.orgId, context.orgId, candidateParentId]);
    return result.rows.length > 0;
}

export async function createFolder(context, data) {
    const [row] = await knex('asset_folders').insert({
        org_id: context.orgId,
        library_id: data.libraryId,
        parent_id: data.parentId || null,
        name: data.name,
        created_by: context.userId,
    }).returning('*');
    return { id: row.id, libraryId: row.library_id, parentId: row.parent_id, name: row.name, revision: row.revision };
}

export async function updateFolder(context, folderId, patch) {
    return knex.transaction(async (trx) => {
        const current = await trx('asset_folders').where({ id: folderId, org_id: context.orgId }).first().forUpdate();
        if (!current) return { status: 'not-found' };
        if (current.revision !== patch.baseRevision) return { status: 'conflict', current };
        const values = { revision: current.revision + 1, updated_at: trx.fn.now() };
        if (patch.name !== undefined) values.name = patch.name;
        if (patch.parentId !== undefined) values.parent_id = patch.parentId;
        const [row] = await trx('asset_folders').where({ id: folderId }).update(values).returning('*');
        return { status: 'updated', folder: { id: row.id, libraryId: row.library_id, parentId: row.parent_id, name: row.name, revision: row.revision } };
    });
}

export async function deleteFolder(context, folderId, baseRevision) {
    return knex.transaction(async (trx) => {
        const current = await trx('asset_folders').where({ id: folderId, org_id: context.orgId }).first().forUpdate();
        if (!current) return { status: 'not-found' };
        if (current.revision !== baseRevision) return { status: 'conflict', current };
        const childCount = await trx('asset_folders').where({ parent_id: folderId }).count('* as count').first();
        const assetCount = await trx('assets').where({ folder_id: folderId }).whereNull('deleted_at').count('* as count').first();
        if (Number(childCount.count) > 0 || Number(assetCount.count) > 0) {
            return { status: 'not-empty', childCount: Number(childCount.count), assetCount: Number(assetCount.count) };
        }
        await trx('asset_folders').where({ id: folderId }).del();
        return { status: 'deleted' };
    });
}

export async function createTag(context, data) {
    const [row] = await knex('asset_tags').insert({
        org_id: context.orgId,
        name: data.name,
        color: data.color,
        created_by: context.userId,
    }).returning('*');
    return { id: row.id, name: row.name, color: row.color, revision: row.revision };
}

export async function updateTag(context, tagId, patch) {
    return knex.transaction(async (trx) => {
        const current = await trx('asset_tags').where({ id: tagId, org_id: context.orgId }).first().forUpdate();
        if (!current) return { status: 'not-found' };
        if (current.revision !== patch.baseRevision) return { status: 'conflict', current };
        const values = { revision: current.revision + 1, updated_at: trx.fn.now() };
        if (patch.name !== undefined) values.name = patch.name;
        if (patch.color !== undefined) values.color = patch.color;
        const [row] = await trx('asset_tags').where({ id: tagId }).update(values).returning('*');
        return { status: 'updated', tag: { id: row.id, name: row.name, color: row.color, revision: row.revision } };
    });
}

export async function deleteTag(context, tagId, baseRevision) {
    return knex.transaction(async (trx) => {
        const current = await trx('asset_tags').where({ id: tagId, org_id: context.orgId }).first().forUpdate();
        if (!current) return { status: 'not-found' };
        if (current.revision !== baseRevision) return { status: 'conflict', current };
        await trx('asset_tags').where({ id: tagId }).del();
        return { status: 'deleted' };
    });
}

function decodeCursor(cursor) {
    if (!cursor) return null;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        return parsed?.updatedAt && parsed?.id ? parsed : null;
    } catch {
        return null;
    }
}

function encodeCursor(row) {
    return Buffer.from(JSON.stringify({ updatedAt: row.updated_at, id: row.id })).toString('base64url');
}

async function tagsForAssets(assetIds, db) {
    if (assetIds.length === 0) return new Map();
    const rows = await dbOrDefault(db)('asset_tag_links as atl')
        .join('asset_tags as at', 'at.id', 'atl.tag_id')
        .whereIn('atl.asset_id', assetIds)
        .select('atl.asset_id', 'at.id', 'at.name', 'at.color', 'at.revision')
        .orderBy('at.name');
    const result = new Map();
    for (const row of rows) {
        const values = result.get(row.asset_id) || [];
        values.push({ id: row.id, name: row.name, color: row.color, revision: row.revision });
        result.set(row.asset_id, values);
    }
    return result;
}

export async function listAssets(context, query) {
    const library = query.libraryId ? { id: query.libraryId } : await ensureDefaultLibrary(context);
    let builder = knex('assets')
        .join('asset_objects', 'asset_objects.id', 'assets.object_id')
        .leftJoin('users as creator', 'creator.id', 'assets.created_by')
        .leftJoin('users as updater', 'updater.id', 'assets.updated_by')
        .where('assets.org_id', context.orgId)
        .where('assets.library_id', library.id)
        .select(assetSelect);
    builder = query.deleted ? builder.whereNotNull('assets.deleted_at') : builder.whereNull('assets.deleted_at');
    if (query.folderId === 'root') builder = builder.whereNull('assets.folder_id');
    else if (query.folderId) builder = builder.where('assets.folder_id', query.folderId);
    if (query.search) builder = builder.whereILike('assets.name', `%${query.search}%`);
    if (query.kinds?.length) builder = builder.whereIn('assets.kind', query.kinds);
    if (query.tags?.length) {
        builder = builder.whereExists(function tagFilter() {
            this.select(knex.raw('1')).from('asset_tag_links').whereRaw('asset_tag_links.asset_id = assets.id').whereIn('asset_tag_links.tag_id', query.tags);
        });
    }
    const cursor = decodeCursor(query.cursor);
    if (cursor && query.sort === 'updated-desc') {
        builder = builder.where((nested) => nested
            .where('assets.updated_at', '<', cursor.updatedAt)
            .orWhere((sameTime) => sameTime.where('assets.updated_at', cursor.updatedAt).where('assets.id', '<', cursor.id)));
    }
    if (query.sort === 'name-asc') builder = builder.orderBy([{ column: 'assets.name', order: 'asc' }, { column: 'assets.id', order: 'asc' }]);
    else if (query.sort === 'created-desc') builder = builder.orderBy([{ column: 'assets.created_at', order: 'desc' }, { column: 'assets.id', order: 'desc' }]);
    else if (query.sort === 'size-desc') builder = builder.orderBy([{ column: 'asset_objects.size', order: 'desc' }, { column: 'assets.id', order: 'desc' }]);
    else builder = builder.orderBy([{ column: 'assets.updated_at', order: 'desc' }, { column: 'assets.id', order: 'desc' }]);
    const rows = await builder.limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const tags = await tagsForAssets(page.map((row) => row.id));
    return {
        items: page.map((row) => mapAsset(row, tags.get(row.id) || [])),
        nextCursor: hasMore ? encodeCursor(page.at(-1)) : null,
        hasMore,
    };
}

export async function getAsset(context, assetId, db) {
    const query = dbOrDefault(db);
    const row = await query('assets')
        .join('asset_objects', 'asset_objects.id', 'assets.object_id')
        .leftJoin('users as creator', 'creator.id', 'assets.created_by')
        .leftJoin('users as updater', 'updater.id', 'assets.updated_by')
        .where('assets.org_id', context.orgId)
        .where('assets.id', assetId)
        .select(assetSelect)
        .first();
    if (!row) return null;
    const tags = (await tagsForAssets([assetId], db)).get(assetId) || [];
    return mapAsset(row, tags);
}

export async function getAssetObject(context, assetId) {
    return knex('assets')
        .join('asset_objects', 'asset_objects.id', 'assets.object_id')
        .where('assets.org_id', context.orgId)
        .where('assets.id', assetId)
        .select(
            'assets.id', 'assets.name', 'assets.deleted_at',
            'asset_objects.object_key', 'asset_objects.thumbnail_key',
            'asset_objects.mime_type', 'asset_objects.size', 'asset_objects.sha256',
        )
        .first();
}

export async function listAssetVersions(context, assetId) {
    const exists = await knex('assets').where({ id: assetId, org_id: context.orgId }).whereNull('deleted_at').first('id');
    if (!exists) return null;
    const rows = await knex('asset_versions as av')
        .join('asset_objects as ao', 'ao.id', 'av.object_id')
        .leftJoin('users as creator', 'creator.id', 'av.created_by')
        .where('av.asset_id', assetId)
        .select(
            'av.id', 'av.version', 'av.file_name', 'av.created_at',
            'ao.size', 'ao.sha256', 'ao.mime_type', 'ao.width', 'ao.height',
            'creator.id as created_by_user_id', 'creator.username as created_by_username',
        )
        .orderBy('av.version', 'desc');
    return rows.map((row) => ({
        id: row.id,
        version: row.version,
        fileName: row.file_name,
        size: Number(row.size),
        sha256: row.sha256,
        mimeType: row.mime_type,
        width: row.width,
        height: row.height,
        createdBy: mapActor(row, 'created_by'),
        createdAt: row.created_at,
        downloadUrl: `/api/app/assets/${assetId}/versions/${row.id}/download`,
    }));
}

export async function getAssetVersionObject(context, assetId, versionId) {
    return knex('asset_versions as av')
        .join('assets as a', 'a.id', 'av.asset_id')
        .join('asset_objects as ao', 'ao.id', 'av.object_id')
        .where({ 'a.id': assetId, 'a.org_id': context.orgId, 'av.id': versionId })
        .whereNull('a.deleted_at')
        .select('av.file_name', 'ao.object_key', 'ao.mime_type', 'ao.size')
        .first();
}

export async function findObject(context, sha256, size, db) {
    return dbOrDefault(db)('asset_objects').where({ org_id: context.orgId, sha256, size }).first();
}

export async function findUploadByMutation(context, clientMutationId, db) {
    return dbOrDefault(db)('asset_uploads').where({ org_id: context.orgId, client_mutation_id: clientMutationId }).first();
}

export async function createUpload(context, data, db) {
    const [row] = await dbOrDefault(db)('asset_uploads').insert({
        org_id: context.orgId,
        library_id: data.libraryId,
        folder_id: data.folderId || null,
        asset_id: data.assetId || null,
        file_name: data.fileName,
        mime_type: data.mimeType,
        size: data.size,
        sha256: data.sha256,
        part_size: data.partSize,
        expected_parts: data.expectedParts,
        status: data.status || 'pending',
        client_mutation_id: data.clientMutationId,
        base_revision: data.baseRevision || null,
        created_by: context.userId,
        expires_at: data.expiresAt,
        completed_at: data.status === 'completed' ? knex.fn.now() : null,
    }).returning('*');
    return row;
}

export async function getUpload(context, uploadId, db) {
    return dbOrDefault(db)('asset_uploads').where({ id: uploadId, org_id: context.orgId }).first();
}

export async function saveUploadPart(uploadId, part, db) {
    const [row] = await dbOrDefault(db)('asset_upload_parts').insert({
        upload_id: uploadId,
        part_number: part.partNumber,
        etag: part.etag,
        size: part.size,
        temp_path: part.tempPath,
    }).onConflict(['upload_id', 'part_number']).merge(['etag', 'size', 'temp_path', 'created_at']).returning('*');
    await dbOrDefault(db)('asset_uploads').where({ id: uploadId, status: 'pending' }).update({ status: 'uploading' });
    return row;
}

export async function listUploadParts(uploadId, db) {
    return dbOrDefault(db)('asset_upload_parts').where({ upload_id: uploadId }).orderBy('part_number');
}

export async function markUploadFailed(context, uploadId) {
    await knex('asset_uploads').where({ id: uploadId, org_id: context.orgId }).whereNot('status', 'completed').update({ status: 'failed' });
}

async function createAssetRows(context, data, db) {
    const [asset] = await db('assets').insert({
        org_id: context.orgId,
        library_id: data.libraryId,
        folder_id: data.folderId || null,
        object_id: data.objectId,
        name: data.fileName,
        kind: data.kind,
        created_by: context.userId,
        updated_by: context.userId,
    }).returning('*');
    await db('asset_versions').insert({ asset_id: asset.id, object_id: data.objectId, version: 1, file_name: data.fileName, created_by: context.userId });
    await db('asset_changes').insert({ org_id: context.orgId, asset_id: asset.id, operation: 'upsert', revision: 1, actor_id: context.userId, payload_json: { source: data.source || 'upload' } });
    return asset;
}

export async function createDeduplicatedAsset(context, data) {
    return knex.transaction(async (trx) => {
        const asset = await createAssetRows(context, data, trx);
        const upload = await createUpload(context, { ...data, assetId: asset.id, partSize: 0, expectedParts: 0, status: 'completed', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }, trx);
        return { upload, asset: await getAsset(context, asset.id, trx) };
    });
}

export async function createDeduplicatedVersion(context, data) {
    return knex.transaction(async (trx) => {
        const current = await trx('assets').where({ id: data.assetId, org_id: context.orgId }).whereNull('deleted_at').first().forUpdate();
        if (!current) return { status: 'not-found' };
        if (current.revision !== data.baseRevision) return { status: 'conflict', current: await getAsset(context, data.assetId, trx) };
        const version = current.current_version + 1;
        const revision = current.revision + 1;
        await trx('asset_versions').insert({ asset_id: current.id, object_id: data.objectId, version, file_name: data.fileName, created_by: context.userId });
        await trx('assets').where({ id: current.id }).update({
            object_id: data.objectId,
            kind: data.kind,
            current_version: version,
            revision,
            updated_by: context.userId,
            updated_at: trx.fn.now(),
        });
        const upload = await createUpload(context, {
            ...data,
            libraryId: current.library_id,
            folderId: current.folder_id,
            partSize: 0,
            expectedParts: 0,
            status: 'completed',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }, trx);
        await trx('asset_changes').insert({ org_id: context.orgId, asset_id: current.id, operation: 'upsert', revision, actor_id: context.userId, payload_json: { source: 'version-upload', version } });
        return { status: 'completed', upload, asset: await getAsset(context, current.id, trx) };
    });
}

export async function completeUpload(context, upload, objectData) {
    return knex.transaction(async (trx) => {
        let current = null;
        if (upload.asset_id) {
            current = await trx('assets').where({ id: upload.asset_id, org_id: context.orgId }).whereNull('deleted_at').first().forUpdate();
            if (!current) return { status: 'not-found' };
            if (current.revision !== upload.base_revision) return { status: 'conflict', current: await getAsset(context, upload.asset_id, trx) };
        }
        let object = await findObject(context, upload.sha256, upload.size, trx);
        if (!object) {
            [object] = await trx('asset_objects').insert({
                org_id: context.orgId,
                sha256: upload.sha256,
                size: upload.size,
                mime_type: upload.mime_type,
                object_key: objectData.objectKey,
                thumbnail_key: objectData.thumbnailKey || null,
                width: objectData.width || null,
                height: objectData.height || null,
            }).returning('*');
        }
        if (current) {
            const version = current.current_version + 1;
            const revision = current.revision + 1;
            await trx('asset_versions').insert({ asset_id: current.id, object_id: object.id, version, file_name: upload.file_name, created_by: context.userId });
            await trx('assets').where({ id: current.id }).update({ object_id: object.id, kind: objectData.kind, current_version: version, revision, updated_by: context.userId, updated_at: trx.fn.now() });
            await trx('asset_changes').insert({ org_id: context.orgId, asset_id: current.id, operation: 'upsert', revision, actor_id: context.userId, payload_json: { source: 'version-upload', version } });
            await trx('asset_uploads').where({ id: upload.id }).update({ status: 'completed', completed_at: trx.fn.now() });
            return { status: 'completed', asset: await getAsset(context, current.id, trx) };
        }
        const asset = await createAssetRows(context, { libraryId: upload.library_id, folderId: upload.folder_id, objectId: object.id, fileName: upload.file_name, kind: objectData.kind }, trx);
        await trx('asset_uploads').where({ id: upload.id }).update({ status: 'completed', asset_id: asset.id, completed_at: trx.fn.now() });
        return { status: 'completed', asset: await getAsset(context, asset.id, trx) };
    });
}

export async function updateAsset(context, assetId, patch) {
    return knex.transaction(async (trx) => {
        const current = await trx('assets').where({ id: assetId, org_id: context.orgId }).first().forUpdate();
        if (!current) return { status: 'not-found' };
        if (current.revision !== patch.baseRevision) return { status: 'conflict', current: await getAsset(context, assetId, trx) };
        const values = { revision: current.revision + 1, updated_by: context.userId, updated_at: trx.fn.now() };
        if (patch.name !== undefined) values.name = patch.name;
        if (patch.folderId !== undefined) values.folder_id = patch.folderId;
        if (patch.note !== undefined) values.note = patch.note;
        if (patch.rating !== undefined) values.rating = patch.rating;
        if (patch.tagIds) {
            const validTags = await trx('asset_tags').where({ org_id: context.orgId }).whereIn('id', patch.tagIds).pluck('id');
            if (validTags.length !== patch.tagIds.length) return { status: 'invalid-tags' };
            await trx('asset_tag_links').where({ asset_id: assetId }).del();
            if (validTags.length) await trx('asset_tag_links').insert(validTags.map((tagId) => ({ asset_id: assetId, tag_id: tagId })));
        }
        await trx('assets').where({ id: assetId }).update(values);
        await trx('asset_changes').insert({ org_id: context.orgId, asset_id: assetId, operation: 'upsert', revision: values.revision, actor_id: context.userId, payload_json: patch });
        return { status: 'updated', asset: await getAsset(context, assetId, trx) };
    });
}

export async function softDeleteAsset(context, assetId, baseRevision) {
    return knex.transaction(async (trx) => {
        const current = await trx('assets').where({ id: assetId, org_id: context.orgId }).first().forUpdate();
        if (!current) return { status: 'not-found' };
        if (current.revision !== baseRevision) return { status: 'conflict', current: await getAsset(context, assetId, trx) };
        const revision = current.revision + 1;
        await trx('assets').where({ id: assetId }).update({ deleted_at: trx.fn.now(), revision, updated_by: context.userId, updated_at: trx.fn.now() });
        await trx('asset_changes').insert({ org_id: context.orgId, asset_id: assetId, operation: 'delete', revision, actor_id: context.userId, payload_json: {} });
        return { status: 'deleted', revision };
    });
}

export async function listChanges(context, cursor, limit) {
    const after = Number(cursor || 0);
    const rows = await knex('asset_changes').where('org_id', context.orgId).where('id', '>', Number.isSafeInteger(after) ? after : 0).orderBy('id').limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
        changes: page.filter((row) => row.operation === 'upsert').map((row) => ({ id: String(row.id), assetId: row.asset_id, revision: row.revision, operation: row.operation, payload: row.payload_json, createdAt: row.created_at })),
        tombstones: page.filter((row) => row.operation === 'delete').map((row) => ({ id: String(row.id), assetId: row.asset_id, revision: row.revision, deletedAt: row.created_at })),
        nextCursor: page.length ? String(page.at(-1).id) : String(after || 0),
        hasMore,
    };
}
