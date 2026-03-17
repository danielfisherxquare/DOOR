/**
 * Credential Repository
 * 证件模块数据访问层
 */

import knex from '../../db/knex.js';

// ============================================================================
// Credential Zones (分区)
// ============================================================================

export async function findZonesByRaceId(orgId, raceId, options = {}) {
    const { isActive = true } = options;
    const query = knex('credential_zones')
        .where({ org_id: orgId, race_id: raceId });
    
    if (isActive !== null) {
        query.where({ is_active: isActive });
    }
    
    return query.orderBy('sort_order', 'asc').orderBy('zone_code', 'asc');
}

export async function findZoneByCode(orgId, raceId, zoneCode) {
    return knex('credential_zones')
        .where({ org_id: orgId, race_id: raceId, zone_code: zoneCode })
        .first();
}

export async function insertZone(trx, payload) {
    const [row] = await (trx || knex)('credential_zones')
        .insert(payload)
        .returning('*');
    return row;
}

export async function updateZoneById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_zones')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function deleteZoneById(trx, id) {
    return (trx || knex)('credential_zones')
        .where({ id })
        .del();
}

// ============================================================================
// Credential Role Templates (岗位模板)
// ============================================================================

export async function findRoleTemplatesByRaceId(orgId, raceId, options = {}) {
    const { isActive = true } = options;
    const query = knex('credential_role_templates as crt')
        .leftJoin('credential_style_templates as cst', 'cst.id', 'crt.default_style_template_id')
        .where({ 'crt.org_id': orgId, 'crt.race_id': raceId });
    
    if (isActive !== null) {
        query.where({ 'crt.is_active': isActive });
    }
    
    return query
        .select(
            'crt.*',
            'cst.template_name as default_style_template_name'
        )
        .orderBy('crt.sort_order', 'asc')
        .orderBy('crt.role_code', 'asc');
}

export async function findRoleTemplateByCode(orgId, raceId, roleCode) {
    return knex('credential_role_templates')
        .where({ org_id: orgId, race_id: raceId, role_code: roleCode })
        .first();
}

export async function findRoleTemplateById(orgId, id) {
    return knex('credential_role_templates')
        .where({ org_id: orgId, id })
        .first();
}

export async function insertRoleTemplate(trx, payload) {
    const [row] = await (trx || knex)('credential_role_templates')
        .insert(payload)
        .returning('*');
    return row;
}

export async function updateRoleTemplateById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_role_templates')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function deleteRoleTemplateById(trx, id) {
    return (trx || knex)('credential_role_templates')
        .where({ id })
        .del();
}

// ============================================================================
// Credential Role Template Zones (岗位 - 区域关联)
// ============================================================================

export async function findRoleTemplateZones(roleTemplateId) {
    return knex('credential_role_template_zones')
        .where({ role_template_id: roleTemplateId })
        .select('zone_code');
}

export async function insertRoleTemplateZone(trx, payload) {
    await (trx || knex)('credential_role_template_zones')
        .insert(payload);
}

export async function deleteRoleTemplateZones(trx, roleTemplateId) {
    return (trx || knex)('credential_role_template_zones')
        .where({ role_template_id: roleTemplateId })
        .del();
}

export async function deleteRoleTemplateZone(trx, roleTemplateId, zoneCode) {
    return (trx || knex)('credential_role_template_zones')
        .where({ role_template_id: roleTemplateId, zone_code: zoneCode })
        .del();
}

// ============================================================================
// Credential Style Templates (证件样式模板)
// ============================================================================

export async function findStyleTemplatesByRaceId(orgId, raceId, options = {}) {
    const { status = null } = options;
    const query = knex('credential_style_templates')
        .where({ org_id: orgId, race_id: raceId });
    
    if (status) {
        query.where({ status });
    }
    
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
    const [row] = await (trx || knex)('credential_style_templates')
        .insert(payload)
        .returning('*');
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
    return (trx || knex)('credential_style_templates')
        .where({ id })
        .del();
}

// ============================================================================
// Credential Applications (证件申请)
// ============================================================================

export async function findApplicationsByRaceId(orgId, raceId, options = {}) {
    const { status = null, applicantUserId = null } = options;
    const query = knex('credential_applications as ca')
        .leftJoin('users as applicant', 'applicant.id', 'ca.applicant_user_id')
        .leftJoin('users as reviewer', 'reviewer.id', 'ca.reviewer_user_id')
        .where({ 'ca.org_id': orgId, 'ca.race_id': raceId });
    
    if (status) {
        query.where({ 'ca.status': status });
    }
    
    if (applicantUserId) {
        query.where({ 'ca.applicant_user_id': applicantUserId });
    }
    
    return query
        .select(
            'ca.*',
            'applicant.username as applicant_username',
            'applicant.name as applicant_name',
            'reviewer.username as reviewer_username'
        )
        .orderBy('ca.created_at', 'desc');
}

export async function findApplicationById(orgId, id) {
    return knex('credential_applications as ca')
        .leftJoin('users as applicant', 'applicant.id', 'ca.applicant_user_id')
        .leftJoin('users as reviewer', 'reviewer.id', 'ca.reviewer_user_id')
        .where({ 'ca.org_id': orgId, 'ca.id': id })
        .first(
            'ca.*',
            'applicant.username as applicant_username',
            'applicant.name as applicant_name',
            'reviewer.username as reviewer_username'
        );
}

export async function findApplicationByUserAndRace(orgId, userId, raceId) {
    return knex('credential_applications')
        .where({ org_id: orgId, applicant_user_id: userId, race_id: raceId })
        .first();
}

export async function insertApplication(trx, payload) {
    const [row] = await (trx || knex)('credential_applications')
        .insert(payload)
        .returning('*');
    return row;
}

export async function updateApplicationById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_applications')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function deleteApplicationById(trx, id) {
    return (trx || knex)('credential_applications')
        .where({ id })
        .del();
}

// ============================================================================
// Credential Application Zone Overrides (申请区域调整)
// ============================================================================

export async function findApplicationZoneOverrides(applicationId) {
    return knex('credential_application_zone_overrides')
        .where({ application_id: applicationId })
        .select('zone_code', 'override_type', 'remark');
}

export async function insertApplicationZoneOverride(trx, payload) {
    await (trx || knex)('credential_application_zone_overrides')
        .insert(payload);
}

export async function deleteApplicationZoneOverrides(trx, applicationId) {
    return (trx || knex)('credential_application_zone_overrides')
        .where({ application_id: applicationId })
        .del();
}

// ============================================================================
// Credential Credentials (证件实例)
// ============================================================================

export async function findCredentialsByRaceId(orgId, raceId, options = {}) {
    const { status = null, applicationId = null, printBatchId = null } = options;
    const query = knex('credential_credentials as cc')
        .leftJoin('credential_applications as ca', 'ca.id', 'cc.application_id')
        .leftJoin('users as issued_user', 'issued_user.id', 'cc.issued_to_user_id')
        .where({ 'cc.org_id': orgId, 'cc.race_id': raceId });
    
    if (status) {
        query.where({ 'cc.status': status });
    }
    
    if (applicationId) {
        query.where({ 'cc.application_id': applicationId });
    }
    
    if (printBatchId) {
        query.where({ 'cc.print_batch_id': printBatchId });
    }
    
    return query
        .select(
            'cc.*',
            'ca.person_name as applicant_person_name',
            'issued_user.name as issued_user_name'
        )
        .orderBy('cc.created_at', 'desc');
}

export async function findCredentialById(orgId, id) {
    return knex('credential_credentials as cc')
        .leftJoin('credential_applications as ca', 'ca.id', 'cc.application_id')
        .leftJoin('users as issued_user', 'issued_user.id', 'cc.issued_to_user_id')
        .where({ 'cc.org_id': orgId, 'cc.id': id })
        .first(
            'cc.*',
            'ca.person_name as applicant_person_name',
            'issued_user.name as issued_user_name'
        );
}

export async function findCredentialByQrPayload(qrPayload) {
    return knex('credential_credentials')
        .where({ qr_payload: qrPayload })
        .first();
}

export async function findCredentialByApplicationId(orgId, applicationId) {
    return knex('credential_credentials')
        .where({ org_id: orgId, application_id: applicationId })
        .first();
}

export async function insertCredential(trx, payload) {
    const [row] = await (trx || knex)('credential_credentials')
        .insert(payload)
        .returning('*');
    return row;
}

export async function updateCredentialById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_credentials')
        .where({ id })
        .update({ ...patch, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

export async function deleteCredentialById(trx, id) {
    return (trx || knex)('credential_credentials')
        .where({ id })
        .del();
}

// ============================================================================
// Credential Credential Zones (证件区域快照)
// ============================================================================

export async function findCredentialZones(credentialId) {
    return knex('credential_credential_zones')
        .where({ credential_id: credentialId })
        .orderBy('zone_code', 'asc');
}

export async function insertCredentialZone(trx, payload) {
    await (trx || knex)('credential_credential_zones')
        .insert(payload);
}

export async function deleteCredentialZones(trx, credentialId) {
    return (trx || knex)('credential_credential_zones')
        .where({ credential_id: credentialId })
        .del();
}

// ============================================================================
// Credential Print Batches (打印批次)
// ============================================================================

export async function findPrintBatchesByRaceId(orgId, raceId, options = {}) {
    const { status = null } = options;
    const query = knex('credential_print_batches')
        .where({ org_id: orgId, race_id: raceId });
    
    if (status) {
        query.where({ status });
    }
    
    return query.orderBy('created_at', 'desc');
}

export async function findPrintBatchById(orgId, id) {
    return knex('credential_print_batches')
        .where({ org_id: orgId, id })
        .first();
}

export async function insertPrintBatch(trx, payload) {
    const [row] = await (trx || knex)('credential_print_batches')
        .insert(payload)
        .returning('*');
    return row;
}

export async function updatePrintBatchById(trx, id, patch) {
    const [row] = await (trx || knex)('credential_print_batches')
        .where({ id })
        .update({ ...patch, completed_at: patch.status === 'completed' ? (trx || knex).fn.now() : null, updated_at: (trx || knex).fn.now() })
        .returning('*');
    return row;
}

// ============================================================================
// Credential Scan Logs (扫码日志)
// ============================================================================

export async function insertScanLog(trx, payload) {
    await (trx || knex)('credential_scan_logs')
        .insert(payload);
}

export async function findScanLogsByCredentialId(credentialId, limit = 50) {
    return knex('credential_scan_logs')
        .where({ credential_id: credentialId })
        .orderBy('scanned_at', 'desc')
        .limit(limit);
}

// ============================================================================
// Credential Issue Logs (领取日志)
// ============================================================================

export async function insertIssueLog(trx, payload) {
    await (trx || knex)('credential_issue_logs')
        .insert(payload);
}

export async function findIssueLogsByCredentialId(credentialId, limit = 50) {
    return knex('credential_issue_logs')
        .where({ credential_id: credentialId })
        .orderBy('issued_at', 'desc')
        .limit(limit);
}

// ============================================================================
// Credential Void Logs (作废日志)
// ============================================================================

export async function insertVoidLog(trx, payload) {
    await (trx || knex)('credential_void_logs')
        .insert(payload);
}

// ============================================================================
// Credential Reissue Logs (补打日志)
// ============================================================================

export async function insertReissueLog(trx, payload) {
    await (trx || knex)('credential_reissue_logs')
        .insert(payload);
}
