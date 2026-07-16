import { createHash, randomUUID } from 'node:crypto';

const baseUrl = (process.env.ASSET_TEST_BASE_URL || 'http://127.0.0.1:3301').replace(/\/$/, '');
const password = process.env.ASSET_TEST_PASSWORD || 'ArcSproDemo@123';

async function jsonRequest(route, { method = 'GET', token, orgId, body } = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}`, 'X-ArcSpro-Scope-Type': 'org', 'X-ArcSpro-Org-Id': orgId } : {}),
            ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || payload.success !== true) {
        const error = new Error(payload?.error?.message || `HTTP ${response.status}`);
        Object.assign(error, { status: response.status, code: payload?.error?.code, payload });
        throw error;
    }
    return payload.data;
}

async function upload({ token, orgId, bytes, fileName, mimeType, initRoute, initBody }) {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const initialized = await jsonRequest(initRoute, {
        method: 'POST', token, orgId,
        body: { fileName, mimeType, size: bytes.length, sha256, clientMutationId: randomUUID(), ...initBody },
    });
    if (initialized.mode === 'deduplicated') return initialized.asset;
    const parts = [];
    for (let offset = 0, partNumber = 1; offset < bytes.length; offset += initialized.partSize, partNumber += 1) {
        const form = new FormData();
        form.append('partNumber', String(partNumber));
        form.append('part', new Blob([bytes.subarray(offset, offset + initialized.partSize)], { type: mimeType }), `${fileName}.part-${partNumber}`);
        parts.push(await jsonRequest(`/api/app/assets/uploads/${initialized.uploadId}/parts`, { method: 'POST', token, orgId, body: form }));
    }
    return jsonRequest(`/api/app/assets/uploads/${initialized.uploadId}/complete`, { method: 'POST', token, orgId, body: { parts, clientMutationId: randomUUID() } });
}

const login = await jsonRequest('/api/auth/login', { method: 'POST', body: { login: 'east.ops', password } });
const token = login.accessToken;
const orgId = String(login.user.orgId || login.user.org_id);
const suffix = Date.now().toString(36);
const context = await jsonRequest('/api/app/assets/context', { token, orgId });
const libraryId = context.libraries[0].id;
const folder = await jsonRequest('/api/app/assets/folders', { method: 'POST', token, orgId, body: { libraryId, name: `联调文件夹-${suffix}` } });
const tag = await jsonRequest('/api/app/assets/tags', { method: 'POST', token, orgId, body: { name: `已交付-${suffix}`, color: '#2563eb' } });

const versionOneBytes = Buffer.from(`ArcSpro collaboration v1 ${suffix}`);
let asset = await upload({
    token, orgId, bytes: versionOneBytes, fileName: `poster-${suffix}.txt`, mimeType: 'text/plain',
    initRoute: '/api/app/assets/uploads/init', initBody: { libraryId, folderId: folder.id },
});
asset = await jsonRequest(`/api/app/assets/${asset.id}`, {
    method: 'PATCH', token, orgId,
    body: { folderId: folder.id, tagIds: [tag.id], note: '第二阶段真实联调', baseRevision: asset.revision },
});
const revisionBeforeVersion = asset.revision;

const filtered = await jsonRequest(`/api/app/assets?tags=${encodeURIComponent(tag.id)}`, { token, orgId });
const versionTwoBytes = Buffer.from(`ArcSpro collaboration v2 ${suffix}`);
asset = await upload({
    token, orgId, bytes: versionTwoBytes, fileName: `poster-${suffix}-v2.txt`, mimeType: 'text/plain',
    initRoute: `/api/app/assets/${asset.id}/versions/uploads/init`, initBody: { baseRevision: asset.revision },
});
const versions = await jsonRequest(`/api/app/assets/${asset.id}/versions`, { token, orgId });
const versionOne = versions.items.find((item) => item.version === 1);
const oldVersionResponse = await fetch(`${baseUrl}/api/app/assets/${asset.id}/versions/${versionOne.id}/download`, {
    headers: { Authorization: `Bearer ${token}`, 'X-ArcSpro-Scope-Type': 'org', 'X-ArcSpro-Org-Id': orgId },
});
const oldVersionBytes = Buffer.from(await oldVersionResponse.arrayBuffer());

let staleWrite;
try {
    await jsonRequest(`/api/app/assets/${asset.id}`, { method: 'PATCH', token, orgId, body: { name: 'stale.txt', baseRevision: revisionBeforeVersion } });
} catch (error) {
    staleWrite = { status: error.status, code: error.code };
}
let nonEmptyDelete;
try {
    await jsonRequest(`/api/app/assets/folders/${folder.id}?baseRevision=${folder.revision}`, { method: 'DELETE', token, orgId });
} catch (error) {
    nonEmptyDelete = { status: error.status, code: error.code };
}

asset = await jsonRequest(`/api/app/assets/${asset.id}`, { method: 'PATCH', token, orgId, body: { folderId: null, baseRevision: asset.revision } });
await jsonRequest(`/api/app/assets/folders/${folder.id}?baseRevision=${folder.revision}`, { method: 'DELETE', token, orgId });
await jsonRequest(`/api/app/assets/tags/${tag.id}?baseRevision=${tag.revision}`, { method: 'DELETE', token, orgId });
await jsonRequest(`/api/app/assets/${asset.id}?baseRevision=${asset.revision}`, { method: 'DELETE', token, orgId });

console.log(JSON.stringify({
    folderCreated: Boolean(folder.id),
    tagCreated: Boolean(tag.id),
    tagFilterCount: filtered.items.filter((item) => item.id === asset.id).length,
    currentVersion: versions.items[0]?.version,
    versionCount: versions.items.length,
    oldVersionHashMatch: createHash('sha256').update(oldVersionBytes).digest('hex') === createHash('sha256').update(versionOneBytes).digest('hex'),
    staleWrite,
    nonEmptyDelete,
    cleanup: 'completed',
}, null, 2));
