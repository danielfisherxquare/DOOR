import { assetError } from './asset.errors.js';

function firstValue(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '') || null;
}

export function resolveAssetContext(req) {
    const requestedOrgId = firstValue(
        req.headers?.['x-arcspro-org-id'],
        req.query?.orgId,
        req.body?.orgId,
    );
    const orgId = req.authContext?.role === 'super_admin'
        ? firstValue(requestedOrgId, req.authContext?.orgId)
        : req.authContext?.orgId;

    if (!orgId) {
        throw assetError(400, 'ASSET_ORG_REQUIRED', '请先选择机构运营工作区');
    }

    return {
        orgId: String(orgId),
        userId: req.authContext?.userId || null,
        requestId: req.id || null,
    };
}
