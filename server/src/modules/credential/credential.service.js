import crypto from 'node:crypto';
import knex from '../../db/knex.js';
import { resolveRaceAccess } from '../races/race-access.service.js';
import * as repo from './credential.repository.js';

const REQUEST_STATUS = {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    UNDER_REVIEW: 'under_review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    GENERATED: 'generated',
    VOIDED: 'voided',
};

const CREDENTIAL_STATUS = {
    GENERATED: 'generated',
    PRINTED: 'printed',
    ISSUED: 'issued',
    RETURNED: 'returned',
    VOIDED: 'voided',
};

const SCAN_RESULT = {
    VALID: 'valid',
    INVALID: 'invalid',
    VOIDED: 'voided',
    NOT_FOUND: 'not_found',
};

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function notFound(message) {
    return Object.assign(new Error(message), { status: 404, expose: true });
}

function forbidden(message) {
    return Object.assign(new Error(message), { status: 403, expose: true });
}

function normalizeRaceId(rawRaceId) {
    const raceId = Number(rawRaceId);
    if (!Number.isFinite(raceId) || raceId <= 0) throw badRequest('Invalid raceId');
    return raceId;
}

function ensureEditorAccess(access) {
    if (access?.effectiveAccessLevel === 'viewer') {
        throw forbidden('Read-only race access cannot perform write operations');
    }
}

function assertNumericAccessCode(accessCode) {
    if (!/^[0-9]+$/.test(String(accessCode || ''))) {
        throw badRequest('Access codes must be numeric strings');
    }
}

function generateQrPayload(credentialId, credentialNo, raceId, orgId, version = 1) {
    const payload = { credentialId, credentialNo, raceId, orgId, version };
    const secret = process.env.JWT_SECRET || 'default-secret';
    const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    return JSON.stringify({ ...payload, signature });
}

function verifyQrSignature(payloadObj, signature) {
    const { signature: _, ...payloadWithoutSig } = payloadObj;
    const secret = process.env.JWT_SECRET || 'default-secret';
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payloadWithoutSig))
        .digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
    } catch {
        return false;
    }
}

function parseQrPayload(qrPayload) {
    try {
        return JSON.parse(qrPayload);
    } catch {
        throw badRequest('Invalid qr payload');
    }
}

function mapAccessArea(area) {
    return {
        id: area.id ? Number(area.id) : (area.access_area_id ? Number(area.access_area_id) : null),
        accessCode: area.access_code,
        accessName: area.access_name,
        accessColor: area.access_color,
        sortOrder: Number(area.sort_order || 0),
        geometry: area.geometry ?? null,
        description: area.description ?? area.access_description ?? null,
        isActive: area.is_active ?? true,
        createdAt: area.created_at,
        updatedAt: area.updated_at,
    };
}

function mapCategory(category, accessAreas = []) {
    return {
        id: Number(category.id),
        categoryName: category.category_name,
        categoryCode: category.category_code,
        cardColor: category.card_color,
        requiresReview: category.requires_review,
        isActive: category.is_active,
        defaultStyleTemplateId: category.default_style_template_id,
        defaultStyleTemplateName: category.default_style_template_name || null,
        description: category.description,
        sortOrder: Number(category.sort_order || 0),
        accessAreas,
        createdAt: category.created_at,
        updatedAt: category.updated_at,
    };
}

function mapRequest(request, accessAreas = [], credential = null) {
    return {
        id: Number(request.id),
        applicantUserId: request.applicant_user_id,
        applicantName: request.applicant_name || request.person_name,
        applicantUsername: request.applicant_username || null,
        personName: request.person_name,
        orgName: request.org_name,
        sourceMode: request.source_mode,
        categoryId: Number(request.category_id),
        categoryName: request.category_name,
        categoryColor: request.category_color,
        jobTitle: request.job_title,
        status: request.status,
        reviewerUserId: request.reviewer_user_id,
        reviewerUsername: request.reviewer_username || null,
        reviewedAt: request.reviewed_at,
        reviewRemark: request.review_remark,
        rejectReason: request.reject_reason,
        remark: request.remark,
        customFields: request.custom_fields,
        accessAreas,
        credentialId: credential ? Number(credential.id) : null,
        credentialStatus: credential ? credential.status : null,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
    };
}

function mapCredentialCore(cred, accessAreas = []) {
    return {
        id: Number(cred.id),
        credentialNo: cred.credential_no,
        requestId: cred.request_id ? Number(cred.request_id) : null,
        categoryName: cred.category_name || cred.role_name,
        categoryColor: cred.category_color || null,
        jobTitle: cred.job_title || null,
        personName: cred.person_name,
        orgName: cred.org_name,
        qrPayload: cred.qr_payload,
        qrVersion: Number(cred.qr_version),
        status: cred.status,
        printBatchId: cred.print_batch_id,
        printedAt: cred.printed_at,
        issuedToUserId: cred.issued_to_user_id,
        issuedToUserName: cred.issued_user_name,
        issuedAt: cred.issued_at,
        issueSource: cred.issue_source,
        returnedAt: cred.returned_at,
        returnRemark: cred.return_remark,
        voidedAt: cred.voided_at,
        voidedByUserId: cred.voided_by_user_id,
        voidReason: cred.void_reason,
        templateSnapshotJson: cred.template_snapshot_json,
        mapSnapshotJson: cred.map_snapshot_json,
        accessAreas,
        createdAt: cred.created_at,
        updatedAt: cred.updated_at,
    };
}

async function loadAccessAreasForCodes(orgId, raceId, accessCodes) {
    for (const accessCode of accessCodes) assertNumericAccessCode(accessCode);
    const accessAreas = await repo.findAccessAreasByCodes(orgId, raceId, accessCodes);
    if (accessAreas.length !== accessCodes.length) {
        const existingCodes = new Set(accessAreas.map((item) => item.access_code));
        const missingCode = accessCodes.find((code) => !existingCodes.has(code));
        throw badRequest(`Unknown access code "${missingCode}"`);
    }
    return accessAreas;
}

async function replaceRequestAccessAreas(trx, requestId, accessAreas) {
    await repo.deleteRequestAccessAreas(trx, requestId);
    for (const [index, area] of accessAreas.entries()) {
        await repo.insertRequestAccessArea(trx, {
            request_id: requestId,
            access_area_id: area.id,
            access_code: area.access_code,
            access_name: area.access_name,
            access_color: area.access_color,
            geometry: area.geometry ?? null,
            access_description: area.description ?? null,
            sort_order: index,
        });
    }
}

async function loadRequestWithRelations(orgId, requestId) {
    const request = await repo.findRequestById(orgId, requestId);
    if (!request) return null;
    const accessAreas = (await repo.findRequestAccessAreas(requestId)).map(mapAccessArea);
    const credential = await repo.findCredentialByRequestId(orgId, requestId);
    return mapRequest(request, accessAreas, credential);
}

export async function getAccessAreas(authContext, rawRaceId) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    return (await repo.findAccessAreasByRaceId(access.operatorOrgId, raceId)).map(mapAccessArea);
}

export async function createAccessArea(authContext, rawRaceId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    assertNumericAccessCode(data.accessCode);
    const existing = await repo.findAccessAreaByCode(access.operatorOrgId, raceId, data.accessCode);
    if (existing) throw badRequest(`Access code "${data.accessCode}" already exists`);
    return mapAccessArea(await repo.insertAccessArea(knex, {
        org_id: access.operatorOrgId,
        race_id: raceId,
        access_code: data.accessCode,
        access_name: data.accessName,
        access_color: data.accessColor || '#3B82F6',
        sort_order: data.sortOrder || 0,
        geometry: data.geometry ?? null,
        description: data.description || null,
        is_active: data.isActive !== false,
    }));
}

export async function updateAccessArea(authContext, rawRaceId, rawAccessAreaId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const accessAreaId = Number(rawAccessAreaId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const current = await repo.findAccessAreaById(access.operatorOrgId, accessAreaId);
    if (!current || Number(current.race_id) !== raceId) throw notFound('Access area not found');
    if (data.accessCode !== undefined) {
        assertNumericAccessCode(data.accessCode);
        if (data.accessCode !== current.access_code) {
            const existing = await repo.findAccessAreaByCode(access.operatorOrgId, raceId, data.accessCode);
            if (existing && Number(existing.id) !== accessAreaId) {
                throw badRequest(`Access code "${data.accessCode}" already exists`);
            }
        }
    }
    return mapAccessArea(await repo.updateAccessAreaById(knex, accessAreaId, {
        ...(data.accessCode !== undefined ? { access_code: data.accessCode } : {}),
        ...(data.accessName !== undefined ? { access_name: data.accessName } : {}),
        ...(data.accessColor !== undefined ? { access_color: data.accessColor } : {}),
        ...(data.sortOrder !== undefined ? { sort_order: data.sortOrder } : {}),
        ...(data.geometry !== undefined ? { geometry: data.geometry } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    }));
}

export async function deleteAccessArea(authContext, rawRaceId, rawAccessAreaId) {
    const raceId = normalizeRaceId(rawRaceId);
    const accessAreaId = Number(rawAccessAreaId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const current = await repo.findAccessAreaById(access.operatorOrgId, accessAreaId);
    if (!current || Number(current.race_id) !== raceId) throw notFound('Access area not found');
    const categoryUsage = await knex('credential_category_access_areas').where({ access_area_id: accessAreaId }).count('* as count').first();
    if (Number(categoryUsage?.count || 0) > 0) throw badRequest('Access area is still used by categories');
    const requestUsage = await knex('credential_request_access_areas').where({ access_area_id: accessAreaId }).count('* as count').first();
    if (Number(requestUsage?.count || 0) > 0) throw badRequest('Access area is still used by requests');
    await repo.deleteAccessAreaById(knex, accessAreaId);
    return { success: true };
}

export async function getCategories(authContext, rawRaceId) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    const categories = await repo.findCategoriesByRaceId(access.operatorOrgId, raceId);
    return Promise.all(categories.map(async (category) => (
        mapCategory(category, (await repo.findCategoryAccessAreas(category.id)).map(mapAccessArea))
    )));
}

export async function createCategory(authContext, rawRaceId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const existing = await repo.findCategoryByCode(access.operatorOrgId, raceId, data.categoryCode);
    if (existing) throw badRequest(`Category code "${data.categoryCode}" already exists`);
    const accessAreas = data.accessAreaIds ? await repo.findAccessAreasByIds(access.operatorOrgId, raceId, data.accessAreaIds) : [];
    if (data.accessAreaIds && accessAreas.length !== data.accessAreaIds.length) {
        throw badRequest('One or more access areas were not found');
    }
    const category = await knex.transaction(async (trx) => {
        const row = await repo.insertCategory(trx, {
            org_id: access.operatorOrgId,
            race_id: raceId,
            category_name: data.categoryName,
            category_code: data.categoryCode,
            card_color: data.cardColor || '#6B7280',
            requires_review: data.requiresReview !== false,
            is_active: data.isActive !== false,
            default_style_template_id: data.defaultStyleTemplateId || null,
            description: data.description || null,
            sort_order: data.sortOrder || 0,
        });
        for (const [index, area] of accessAreas.entries()) {
            await repo.insertCategoryAccessArea(trx, { category_id: row.id, access_area_id: area.id, sort_order: index });
        }
        return row;
    });
    return mapCategory(category, (await repo.findCategoryAccessAreas(category.id)).map(mapAccessArea));
}

export async function updateCategory(authContext, rawRaceId, rawCategoryId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const categoryId = Number(rawCategoryId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const current = await repo.findCategoryById(access.operatorOrgId, categoryId);
    if (!current || Number(current.race_id) !== raceId) throw notFound('Category not found');
    if (data.categoryCode && data.categoryCode !== current.category_code) {
        const existing = await repo.findCategoryByCode(access.operatorOrgId, raceId, data.categoryCode);
        if (existing && Number(existing.id) !== categoryId) {
            throw badRequest(`Category code "${data.categoryCode}" already exists`);
        }
    }
    const accessAreas = data.accessAreaIds !== undefined ? await repo.findAccessAreasByIds(access.operatorOrgId, raceId, data.accessAreaIds) : null;
    if (data.accessAreaIds !== undefined && accessAreas.length !== data.accessAreaIds.length) {
        throw badRequest('One or more access areas were not found');
    }
    const category = await knex.transaction(async (trx) => {
        const row = await repo.updateCategoryById(trx, categoryId, {
            ...(data.categoryName !== undefined ? { category_name: data.categoryName } : {}),
            ...(data.categoryCode !== undefined ? { category_code: data.categoryCode } : {}),
            ...(data.cardColor !== undefined ? { card_color: data.cardColor } : {}),
            ...(data.requiresReview !== undefined ? { requires_review: data.requiresReview } : {}),
            ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
            ...(data.defaultStyleTemplateId !== undefined ? { default_style_template_id: data.defaultStyleTemplateId } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.sortOrder !== undefined ? { sort_order: data.sortOrder } : {}),
        });
        if (accessAreas) {
            await repo.deleteCategoryAccessAreas(trx, categoryId);
            for (const [index, area] of accessAreas.entries()) {
                await repo.insertCategoryAccessArea(trx, { category_id: categoryId, access_area_id: area.id, sort_order: index });
            }
        }
        return row;
    });
    return mapCategory(category, (await repo.findCategoryAccessAreas(categoryId)).map(mapAccessArea));
}

export async function deleteCategory(authContext, rawRaceId, rawCategoryId) {
    const raceId = normalizeRaceId(rawRaceId);
    const categoryId = Number(rawCategoryId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const current = await repo.findCategoryById(access.operatorOrgId, categoryId);
    if (!current || Number(current.race_id) !== raceId) throw notFound('Category not found');
    const requestUsage = await knex('credential_requests').where({ category_id: categoryId }).count('* as count').first();
    if (Number(requestUsage?.count || 0) > 0) throw badRequest('Category is still used by requests');
    await repo.deleteCategoryById(knex, categoryId);
    return { success: true };
}

export async function getStyleTemplates(authContext, rawRaceId, options = {}) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    const templates = await repo.findStyleTemplatesByRaceId(access.operatorOrgId, raceId, options);
    return templates.map((template) => ({
        id: Number(template.id),
        templateName: template.template_name,
        templateCode: template.template_code,
        frontLayoutJson: template.front_layout_json,
        backLayoutJson: template.back_layout_json,
        pageWidth: Number(template.page_width),
        pageHeight: Number(template.page_height),
        version: Number(template.version),
        status: template.status,
        description: template.description,
        createdBy: template.created_by,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
    }));
}

export async function getStyleTemplate(authContext, rawRaceId, rawTemplateId) {
    const raceId = normalizeRaceId(rawRaceId);
    const templateId = Number(rawTemplateId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    const template = await repo.findStyleTemplateById(access.operatorOrgId, templateId);
    if (!template || Number(template.race_id) !== raceId) throw notFound('Style template not found');
    return {
        id: Number(template.id),
        templateName: template.template_name,
        templateCode: template.template_code,
        frontLayoutJson: template.front_layout_json,
        backLayoutJson: template.back_layout_json,
        pageWidth: Number(template.page_width),
        pageHeight: Number(template.page_height),
        version: Number(template.version),
        status: template.status,
        description: template.description,
        createdBy: template.created_by,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
    };
}

export async function createStyleTemplate(authContext, rawRaceId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const existing = await repo.findStyleTemplateByCode(access.operatorOrgId, raceId, data.templateCode);
    if (existing) throw badRequest(`Template code "${data.templateCode}" already exists`);
    const template = await repo.insertStyleTemplate(knex, {
        org_id: access.operatorOrgId,
        race_id: raceId,
        template_name: data.templateName,
        template_code: data.templateCode,
        front_layout_json: data.frontLayoutJson,
        back_layout_json: data.backLayoutJson || null,
        page_width: data.pageWidth || 567,
        page_height: data.pageHeight || 567,
        version: data.version || 1,
        status: data.status || 'draft',
        description: data.description || null,
        created_by: authContext.userId,
    });
    return {
        id: Number(template.id),
        templateName: template.template_name,
        templateCode: template.template_code,
        frontLayoutJson: template.front_layout_json,
        backLayoutJson: template.back_layout_json,
        pageWidth: Number(template.page_width),
        pageHeight: Number(template.page_height),
        version: Number(template.version),
        status: template.status,
        description: template.description,
        createdBy: template.created_by,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
    };
}

export async function updateStyleTemplate(authContext, rawRaceId, rawTemplateId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const templateId = Number(rawTemplateId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const template = await repo.findStyleTemplateById(access.operatorOrgId, templateId);
    if (!template || Number(template.race_id) !== raceId) throw notFound('Style template not found');
    if (data.templateCode && data.templateCode !== template.template_code) {
        const existing = await repo.findStyleTemplateByCode(access.operatorOrgId, raceId, data.templateCode);
        if (existing && Number(existing.id) !== templateId) {
            throw badRequest(`Template code "${data.templateCode}" already exists`);
        }
    }
    const updated = await repo.updateStyleTemplateById(knex, templateId, {
        ...(data.templateName !== undefined ? { template_name: data.templateName } : {}),
        ...(data.templateCode !== undefined ? { template_code: data.templateCode } : {}),
        ...(data.frontLayoutJson !== undefined ? { front_layout_json: data.frontLayoutJson } : {}),
        ...(data.backLayoutJson !== undefined ? { back_layout_json: data.backLayoutJson } : {}),
        ...(data.pageWidth !== undefined ? { page_width: data.pageWidth } : {}),
        ...(data.pageHeight !== undefined ? { page_height: data.pageHeight } : {}),
        ...(data.version !== undefined ? { version: data.version } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
    });
    return {
        id: Number(updated.id),
        templateName: updated.template_name,
        templateCode: updated.template_code,
        frontLayoutJson: updated.front_layout_json,
        backLayoutJson: updated.back_layout_json,
        pageWidth: Number(updated.page_width),
        pageHeight: Number(updated.page_height),
        version: Number(updated.version),
        status: updated.status,
        description: updated.description,
        createdBy: updated.created_by,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
    };
}

export async function deleteStyleTemplate(authContext, rawRaceId, rawTemplateId) {
    const raceId = normalizeRaceId(rawRaceId);
    const templateId = Number(rawTemplateId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const template = await repo.findStyleTemplateById(access.operatorOrgId, templateId);
    if (!template || Number(template.race_id) !== raceId) throw notFound('Style template not found');
    await repo.deleteStyleTemplateById(knex, templateId);
    return { success: true };
}

export async function getRequests(authContext, rawRaceId, options = {}) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    const requests = await repo.findRequestsByRaceId(access.operatorOrgId, raceId, options);
    return Promise.all(requests.map(async (request) => (
        mapRequest(
            request,
            (await repo.findRequestAccessAreas(request.id)).map(mapAccessArea),
            await repo.findCredentialByRequestId(access.operatorOrgId, request.id),
        )
    )));
}

export async function getRequest(authContext, rawRaceId, rawRequestId) {
    const raceId = normalizeRaceId(rawRaceId);
    const requestId = Number(rawRequestId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    const request = await repo.findRequestById(access.operatorOrgId, requestId);
    if (!request || Number(request.race_id) !== raceId) throw notFound('Request not found');
    return mapRequest(
        request,
        (await repo.findRequestAccessAreas(requestId)).map(mapAccessArea),
        await repo.findCredentialByRequestId(access.operatorOrgId, requestId),
    );
}

export async function createRequest(authContext, rawRaceId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    if (!['self_service', 'admin_direct'].includes(data.sourceMode)) throw badRequest('Invalid sourceMode');
    if (data.sourceMode === 'admin_direct') ensureEditorAccess(access);
    const category = await repo.findCategoryById(access.operatorOrgId, Number(data.categoryId));
    if (!category || Number(category.race_id) !== raceId) throw badRequest('Invalid category');
    if (data.sourceMode === 'self_service') {
        const existing = await repo.findRequestByUserAndRace(access.operatorOrgId, authContext.userId, raceId);
        if (existing) throw badRequest('You already have a request for this race');
    }
    const defaultAreas = await repo.findCategoryAccessAreas(category.id);
    const accessAreas = data.accessCodes && data.accessCodes.length > 0
        ? await loadAccessAreasForCodes(access.operatorOrgId, raceId, data.accessCodes)
        : defaultAreas;
    const status = category.requires_review ? REQUEST_STATUS.SUBMITTED : REQUEST_STATUS.APPROVED;
    const request = await knex.transaction(async (trx) => {
        const row = await repo.insertRequest(trx, {
            org_id: access.operatorOrgId,
            race_id: raceId,
            applicant_user_id: data.sourceMode === 'self_service' ? authContext.userId : (data.applicantUserId || authContext.userId || null),
            source_mode: data.sourceMode,
            category_id: category.id,
            category_name: category.category_name,
            category_color: category.card_color,
            person_name: data.personName,
            org_name: data.orgName || null,
            job_title: data.jobTitle || null,
            status,
            remark: data.remark || null,
            custom_fields: data.customFields || null,
            created_by: authContext.userId || null,
            updated_by: authContext.userId || null,
        });
        await replaceRequestAccessAreas(trx, row.id, accessAreas);
        return row;
    });
    return loadRequestWithRelations(access.operatorOrgId, request.id);
}

export async function reviewRequest(authContext, rawRaceId, rawRequestId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const requestId = Number(rawRequestId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const current = await repo.findRequestById(access.operatorOrgId, requestId);
    if (!current || Number(current.race_id) !== raceId) throw notFound('Request not found');
    if (![REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.UNDER_REVIEW, REQUEST_STATUS.APPROVED].includes(current.status)) {
        throw badRequest('Request cannot be reviewed in current status');
    }
    const approved = data.approved === true;
    const category = data.categoryId !== undefined
        ? await repo.findCategoryById(access.operatorOrgId, Number(data.categoryId))
        : await repo.findCategoryById(access.operatorOrgId, Number(current.category_id));
    if (!category || Number(category.race_id) !== raceId) throw badRequest('Invalid category');
    const currentAreas = await repo.findRequestAccessAreas(requestId);
    const accessAreas = data.accessCodes !== undefined
        ? await loadAccessAreasForCodes(access.operatorOrgId, raceId, data.accessCodes)
        : currentAreas;
    await knex.transaction(async (trx) => {
        await repo.updateRequestById(trx, requestId, {
            reviewer_user_id: authContext.userId,
            reviewed_at: trx.fn.now(),
            review_remark: data.remark ?? null,
            reject_reason: approved ? null : (data.rejectReason || null),
            status: approved ? REQUEST_STATUS.APPROVED : REQUEST_STATUS.REJECTED,
            category_id: category.id,
            category_name: category.category_name,
            category_color: category.card_color,
            job_title: data.jobTitle !== undefined ? data.jobTitle : current.job_title,
            updated_by: authContext.userId || null,
        });
        if (approved) await replaceRequestAccessAreas(trx, requestId, accessAreas);
    });
    return loadRequestWithRelations(access.operatorOrgId, requestId);
}

export async function getCredentials(authContext, rawRaceId, options = {}) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    const credentials = await repo.findCredentialsByRaceId(access.operatorOrgId, raceId, options);
    return Promise.all(credentials.map(async (cred) => (
        mapCredentialCore(cred, (await repo.findCredentialAccessAreas(cred.id)).map(mapAccessArea))
    )));
}

export async function getCredential(authContext, rawRaceId, rawCredentialId) {
    const raceId = normalizeRaceId(rawRaceId);
    const credentialId = Number(rawCredentialId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    const cred = await repo.findCredentialById(access.operatorOrgId, credentialId);
    if (!cred || Number(cred.race_id) !== raceId) throw notFound('Credential not found');
    const accessAreas = (await repo.findCredentialAccessAreas(credentialId)).map(mapAccessArea);
    const scanLogs = await repo.findScanLogsByCredentialId(credentialId, 10);
    const issueLogs = await repo.findIssueLogsByCredentialId(credentialId, 10);
    return {
        ...mapCredentialCore(cred, accessAreas),
        recentScanLogs: scanLogs.map((log) => ({
            id: Number(log.id),
            scanResult: log.scan_result,
            scannedAt: log.scanned_at,
            scanDevice: log.scan_device,
            scanLocation: log.scan_location,
        })),
        recentIssueLogs: issueLogs.map((log) => ({
            id: Number(log.id),
            issuedToPersonName: log.issued_to_person_name,
            issuedAt: log.issued_at,
            issueSource: log.issue_source,
        })),
    };
}

export async function resolveCredentialByQrPayload(_authContext, qrPayload) {
    const payloadObj = parseQrPayload(qrPayload);
    const { credentialId, signature } = payloadObj;
    if (!signature || !verifyQrSignature(payloadObj, signature)) {
        return { valid: false, result: SCAN_RESULT.INVALID, message: 'Invalid signature' };
    }
    const cred = await repo.findCredentialById(null, credentialId);
    if (!cred) {
        return { valid: false, result: SCAN_RESULT.NOT_FOUND, message: 'Credential not found' };
    }
    const accessAreas = (await repo.findCredentialAccessAreas(cred.id)).map(mapAccessArea);
    if (cred.status === CREDENTIAL_STATUS.VOIDED) {
        return {
            valid: false,
            result: SCAN_RESULT.VOIDED,
            message: 'Credential has been voided',
            credential: {
                id: Number(cred.id),
                credentialNo: cred.credential_no,
                personName: cred.person_name,
                categoryName: cred.category_name || cred.role_name,
                categoryColor: cred.category_color || null,
                jobTitle: cred.job_title || null,
                status: cred.status,
                accessAreas,
            },
        };
    }
    return {
        valid: true,
        result: SCAN_RESULT.VALID,
        credential: {
            id: Number(cred.id),
            credentialNo: cred.credential_no,
            personName: cred.person_name,
            categoryName: cred.category_name || cred.role_name,
            categoryColor: cred.category_color || null,
            jobTitle: cred.job_title || null,
            orgName: cred.org_name,
            status: cred.status,
            accessAreas,
        },
    };
}

export async function voidCredential(authContext, rawRaceId, rawCredentialId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const credentialId = Number(rawCredentialId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const cred = await repo.findCredentialById(access.operatorOrgId, credentialId);
    if (!cred || Number(cred.race_id) !== raceId) throw notFound('Credential not found');
    if (cred.status === CREDENTIAL_STATUS.VOIDED) throw badRequest('Credential is already voided');
    await knex.transaction(async (trx) => {
        await repo.updateCredentialById(trx, credentialId, {
            status: CREDENTIAL_STATUS.VOIDED,
            voided_at: trx.fn.now(),
            voided_by_user_id: authContext.userId,
            void_reason: data.voidReason || null,
        });
        await repo.insertVoidLog(trx, {
            credential_id: credentialId,
            org_id: access.operatorOrgId,
            race_id: raceId,
            void_reason: data.voidReason || null,
            remark: data.remark || null,
            voided_by_user_id: authContext.userId,
        });
    });
    return { success: true };
}

async function generateCredentialNo(trx, raceId) {
    const maxRow = await (trx || knex)('credential_credentials').where({ race_id: raceId }).max('credential_no as max_no').first();
    const maxNo = maxRow?.max_no || 'CRED-000000';
    const numPart = parseInt(String(maxNo).replace(/\D/g, ''), 10) || 0;
    return `CRED-${String(numPart + 1).padStart(6, '0')}`;
}

export async function reissueCredential(authContext, rawRaceId, rawCredentialId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const credentialId = Number(rawCredentialId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);
    const cred = await repo.findCredentialById(access.operatorOrgId, credentialId);
    if (!cred || Number(cred.race_id) !== raceId) throw notFound('Credential not found');
    await knex.transaction(async (trx) => {
        const newCredentialNo = await generateCredentialNo(trx, raceId);
        const newCredential = await repo.insertCredential(trx, {
            org_id: access.operatorOrgId,
            race_id: raceId,
            application_id: cred.application_id || null,
            request_id: cred.request_id || null,
            credential_no: newCredentialNo,
            role_name: cred.role_name || cred.category_name,
            category_name: cred.category_name || cred.role_name,
            category_color: cred.category_color || null,
            job_title: cred.job_title || null,
            person_name: cred.person_name,
            org_name: cred.org_name,
            default_zone_code: cred.default_zone_code,
            template_snapshot_json: cred.template_snapshot_json,
            map_snapshot_json: cred.map_snapshot_json,
            qr_payload: '',
            qr_version: Number(cred.qr_version) + 1,
            status: CREDENTIAL_STATUS.GENERATED,
            created_by: authContext.userId,
        });
        await repo.updateCredentialById(trx, newCredential.id, {
            qr_payload: generateQrPayload(Number(newCredential.id), newCredentialNo, raceId, access.operatorOrgId, Number(cred.qr_version) + 1),
        });
        const oldAccessAreas = await repo.findCredentialAccessAreas(credentialId);
        for (const [index, area] of oldAccessAreas.entries()) {
            await repo.insertCredentialAccessArea(trx, {
                credential_id: newCredential.id,
                access_area_id: area.access_area_id || null,
                access_code: area.access_code,
                access_name: area.access_name,
                access_color: area.access_color,
                geometry: area.geometry ?? null,
                access_description: area.access_description ?? null,
                sort_order: index,
            });
        }
        await repo.insertReissueLog(trx, {
            credential_id: credentialId,
            org_id: access.operatorOrgId,
            race_id: raceId,
            reissue_reason: data.reissueReason || null,
            remark: data.remark || null,
            reissued_by_user_id: authContext.userId,
            new_credential_id: newCredential.id,
        });
    });
    return { success: true };
}

export async function issueCredential(authContext, rawRaceId, rawCredentialId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const credentialId = Number(rawCredentialId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    const cred = await repo.findCredentialById(access.operatorOrgId, credentialId);
    if (!cred || Number(cred.race_id) !== raceId) throw notFound('Credential not found');
    if (cred.status === CREDENTIAL_STATUS.VOIDED) throw badRequest('Credential has been voided');
    if (cred.status === CREDENTIAL_STATUS.ISSUED) throw badRequest('Credential has already been issued');
    await knex.transaction(async (trx) => {
        await repo.updateCredentialById(trx, credentialId, {
            status: CREDENTIAL_STATUS.ISSUED,
            issued_to_user_id: authContext.userId,
            issued_at: trx.fn.now(),
            issue_source: 'manual',
        });
        await repo.insertIssueLog(trx, {
            credential_id: credentialId,
            org_id: access.operatorOrgId,
            race_id: raceId,
            issued_to_user_id: authContext.userId,
            issued_to_person_name: data.recipientName,
            issued_to_org_name: data.recipientIdCard || null,
            issued_by_user_id: authContext.userId,
            issue_source: 'manual',
            issued_at: trx.fn.now(),
            remark: data.remark || null,
        });
    });
    return { success: true };
}

export async function getCredentialStats(authContext, rawRaceId) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    const stats = await knex('credential_credentials')
        .where({ org_id: access.operatorOrgId, race_id: raceId })
        .select('status')
        .count('* as count')
        .groupBy('status');
    const result = { total: 0, generated: 0, printed: 0, issued: 0, returned: 0, voided: 0 };
    for (const row of stats) {
        const count = Number(row.count || 0);
        result.total += count;
        if (row.status) result[row.status] = count;
    }
    return result;
}
