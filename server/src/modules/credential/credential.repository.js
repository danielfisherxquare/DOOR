import knex from '../../db/knex.js';

export async function findAccessAreasByRaceId(orgId, raceId, options = {}) {
    const { isActive = true } = options;
    const query = knex('credential_access_areas')
        .where({ org_id: orgId, race_id: raceId });

    if (isActive !== null) {
        query.where({ is_active: isActive });
    }

    return query.orderBy('sort_order', 'asc').orderBy('access_code', 'asc');
}

export async function findAccessAreaByCode(orgId, raceId, accessCode) {
    return knex('credential_access_areas')
        .where({ org_id: orgId, race_id: raceId, access_code: accessCode })
        .first();
}

export async function findAccessAreaById(orgId, id) {
    return knex('credential_access_areas')
        .where({ org_id: orgId, id })
        .first();
}

export async function findAccessAreasByIds(orgId, raceId, ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return knex('credential_access_areas')
        .where({ org_id: orgId, race_id: raceId })
        .whereIn('id', ids)
        .orderBy('sort_order', 'asc')
        .orderBy('access_code', 'asc');
}

export async function findAccessAreasByCodes(orgId, raceId, codes = []) {
    if (!Array.isArray(codes) || codes.length === 0) return [];
    return knex('credential_access_areas')
        .where({ org_id: orgId, race_id: raceId })
        .whereIn('access_code', codes)
        .orderBy('sort_order', 'asc')
        .orderBy('access_code', 'asc');
}

export async function insertAccessArea(trx, payload) {
    const [row] = await (trx || knex)('credential_access_areas').insert(payload).returning('*');
    return row;
}

export async function updateAccessAreaById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_access_areas')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function deleteAccessAreaById(trx, id) {
    return (trx || knex)('credential_access_areas').where({ id }).del();
}

export async function findCategoriesByRaceId(orgId, raceId, options = {}) {
    const { isActive = true } = options;
    const query = knex('credential_categories as cc')
        .leftJoin('credential_style_templates as cst', 'cst.id', 'cc.default_style_template_id')
        .where({ 'cc.org_id': orgId, 'cc.race_id': raceId });

    if (isActive !== null) {
        query.where({ 'cc.is_active': isActive });
    }

    return query
        .select('cc.*', 'cst.template_name as default_style_template_name')
        .orderBy('cc.sort_order', 'asc')
        .orderBy('cc.category_code', 'asc');
}

export async function findCategoryById(orgId, id) {
    return knex('credential_categories').where({ org_id: orgId, id }).first();
}

export async function findCategoryByCode(orgId, raceId, categoryCode) {
    return knex('credential_categories')
        .where({ org_id: orgId, race_id: raceId, category_code: categoryCode })
        .first();
}

export async function insertCategory(trx, payload) {
    const [row] = await (trx || knex)('credential_categories').insert(payload).returning('*');
    return row;
}

export async function updateCategoryById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_categories')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function deleteCategoryById(trx, id) {
    return (trx || knex)('credential_categories').where({ id }).del();
}

export async function findCategoryAccessAreas(categoryId) {
    return knex('credential_category_access_areas as cca')
        .join('credential_access_areas as ca', 'ca.id', 'cca.access_area_id')
        .where({ 'cca.category_id': categoryId })
        .select('cca.*', 'ca.access_code', 'ca.access_name', 'ca.access_color', 'ca.geometry', 'ca.description')
        .orderBy('cca.sort_order', 'asc')
        .orderBy('ca.access_code', 'asc');
}

export async function deleteCategoryAccessAreas(trx, categoryId) {
    return (trx || knex)('credential_category_access_areas').where({ category_id: categoryId }).del();
}

export async function insertCategoryAccessArea(trx, payload) {
    await (trx || knex)('credential_category_access_areas').insert(payload);
}

export async function findStyleTemplatesByRaceId(orgId, raceId, options = {}) {
    const { status = null } = options;
    const query = knex('credential_style_templates')
        .where({ org_id: orgId, race_id: raceId });
    if (status) query.where({ status });
    return query.orderBy('created_at', 'desc');
}

export async function findStyleTemplateByCode(orgId, raceId, templateCode) {
    return knex('credential_style_templates')
        .where({ org_id: orgId, race_id: raceId, template_code: templateCode })
        .first();
}

export async function findStyleTemplateById(orgId, id) {
    return knex('credential_style_templates')
        .where({ org_id: orgId, id })
        .first();
}

export async function insertStyleTemplate(trx, payload) {
    const [row] = await (trx || knex)('credential_style_templates').insert(payload).returning('*');
    return row;
}

export async function updateStyleTemplateById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_style_templates')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function deleteStyleTemplateById(trx, id) {
    return (trx || knex)('credential_style_templates').where({ id }).del();
}

export async function findRequestsByRaceId(orgId, raceId, options = {}) {
    const { status = null, applicantUserId = null } = options;
    const query = knex('credential_requests as cr')
        .leftJoin('users as applicant', 'applicant.id', 'cr.applicant_user_id')
        .leftJoin('users as reviewer', 'reviewer.id', 'cr.reviewer_user_id')
        .where({ 'cr.org_id': orgId, 'cr.race_id': raceId });

    if (status) query.where({ 'cr.status': status });
    if (applicantUserId) query.where({ 'cr.applicant_user_id': applicantUserId });

    return query
        .select(
            'cr.*',
            'applicant.username as applicant_username',
            'reviewer.username as reviewer_username',
        )
        .orderBy('cr.created_at', 'desc');
}

export async function findRequestById(orgId, id) {
    return knex('credential_requests as cr')
        .leftJoin('users as applicant', 'applicant.id', 'cr.applicant_user_id')
        .leftJoin('users as reviewer', 'reviewer.id', 'cr.reviewer_user_id')
        .where({ 'cr.org_id': orgId, 'cr.id': id })
        .first(
            'cr.*',
            'applicant.username as applicant_username',
            'reviewer.username as reviewer_username',
        );
}

export async function findRequestByUserAndRace(orgId, userId, raceId) {
    return knex('credential_requests')
        .where({ org_id: orgId, applicant_user_id: userId, race_id: raceId })
        .first();
}

export async function insertRequest(trx, payload) {
    const [row] = await (trx || knex)('credential_requests').insert(payload).returning('*');
    return row;
}

export async function updateRequestById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_requests')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function deleteRequestAccessAreas(trx, requestId) {
    return (trx || knex)('credential_request_access_areas').where({ request_id: requestId }).del();
}

export async function insertRequestAccessArea(trx, payload) {
    await (trx || knex)('credential_request_access_areas').insert(payload);
}

export async function findRequestAccessAreas(requestId) {
    return knex('credential_request_access_areas')
        .where({ request_id: requestId })
        .orderBy('sort_order', 'asc')
        .orderBy('access_code', 'asc');
}

export async function findCredentialsByRaceId(orgId, raceId, options = {}) {
    const { status = null, requestId = null, printBatchId = null } = options;
    const query = knex('credential_credentials as cc')
        .leftJoin('users as issued_user', 'issued_user.id', 'cc.issued_to_user_id')
        .where({ 'cc.org_id': orgId, 'cc.race_id': raceId });

    if (status) query.where({ 'cc.status': status });
    if (requestId) query.where({ 'cc.request_id': requestId });
    if (printBatchId) query.where({ 'cc.print_batch_id': printBatchId });

    return query
        .select('cc.*', 'issued_user.name as issued_user_name')
        .orderBy('cc.created_at', 'desc');
}

export async function findCredentialById(orgId, id) {
    const query = knex('credential_credentials as cc')
        .leftJoin('users as issued_user', 'issued_user.id', 'cc.issued_to_user_id')
        .where({ 'cc.id': id });

    if (orgId) {
        query.andWhere({ 'cc.org_id': orgId });
    }

    return query.first('cc.*', 'issued_user.name as issued_user_name');
}

export async function findCredentialByQrPayload(qrPayload) {
    return knex('credential_credentials').where({ qr_payload: qrPayload }).first();
}

export async function findCredentialByRequestId(orgId, requestId) {
    return knex('credential_credentials').where({ org_id: orgId, request_id: requestId }).first();
}

export async function insertCredential(trx, payload) {
    const [row] = await (trx || knex)('credential_credentials').insert(payload).returning('*');
    return row;
}

export async function updateCredentialById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_credentials')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function findCredentialAccessAreas(credentialId) {
    return knex('credential_credential_access_areas')
        .where({ credential_id: credentialId })
        .orderBy('sort_order', 'asc')
        .orderBy('access_code', 'asc');
}

export async function deleteCredentialAccessAreas(trx, credentialId) {
    return (trx || knex)('credential_credential_access_areas').where({ credential_id: credentialId }).del();
}

export async function insertCredentialAccessArea(trx, payload) {
    await (trx || knex)('credential_credential_access_areas').insert(payload);
}

export async function findPrintBatchesByRaceId(orgId, raceId, options = {}) {
    const { status = null } = options;
    const query = knex('credential_print_batches').where({ org_id: orgId, race_id: raceId });
    if (status) query.where({ status });
    return query.orderBy('created_at', 'desc');
}

export async function findPrintBatchById(orgId, id) {
    return knex('credential_print_batches').where({ org_id: orgId, id }).first();
}

export async function insertPrintBatch(trx, payload) {
    const [row] = await (trx || knex)('credential_print_batches').insert(payload).returning('*');
    return row;
}

export async function updatePrintBatchById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_print_batches')
        .where({ id })
        .update({
            ...patch,
            completed_at: patch.status === 'completed' ? (trx || knex).fn.now() : null,
            updated_at: (trx || knex).fn.now(),
        })
        .returning('*');
    return row;
}

export async function insertScanLog(trx, payload) {
    await (trx || knex)('credential_scan_logs').insert(payload);
}

export async function findScanLogsByCredentialId(credentialId, limit = 50) {
    return knex('credential_scan_logs')
        .where({ credential_id: credentialId })
        .orderBy('scanned_at', 'desc')
        .limit(limit);
}

export async function insertIssueLog(trx, payload) {
    await (trx || knex)('credential_issue_logs').insert(payload);
}

export async function findIssueLogsByCredentialId(credentialId, limit = 50) {
    return knex('credential_issue_logs')
        .where({ credential_id: credentialId })
        .orderBy('issued_at', 'desc')
        .limit(limit);
}

export async function insertVoidLog(trx, payload) {
    await (trx || knex)('credential_void_logs').insert(payload);
}

export async function insertReissueLog(trx, payload) {
    await (trx || knex)('credential_reissue_logs').insert(payload);
}
