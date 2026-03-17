/**
 * Credential Service
 * 证件模块业务逻辑层
 */

import crypto from 'node:crypto';
import knex from '../../db/knex.js';
import { resolveRaceAccess } from '../races/race-access.service.js';
import * as repo from './credential.repository.js';

// ============================================================================
// Constants & Enums
// ============================================================================

const APPLICATION_STATUS = {
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

const OVERRIDE_TYPE = {
    ADD: 'add',
    REMOVE: 'remove',
};

// ============================================================================
// Helper Functions
// ============================================================================

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
    if (!Number.isFinite(raceId) || raceId <= 0) {
        throw badRequest('Invalid raceId');
    }
    return raceId;
}

function ensureEditorAccess(access) {
    if (access?.effectiveAccessLevel === 'viewer') {
        throw forbidden('Read-only race access cannot perform write operations');
    }
}

function generateQrPayload(credentialId, credentialNo, raceId, orgId, version = 1) {
    const payload = {
        credentialId,
        credentialNo,
        raceId,
        orgId,
        version,
    };

    // 生成签名 (使用环境变量中的密钥)
    const secret = process.env.JWT_SECRET || 'default-secret';
    const dataToSign = JSON.stringify(payload);
    const signature = crypto
        .createHmac('sha256', secret)
        .update(dataToSign)
        .digest('hex');

    payload.signature = signature;
    return JSON.stringify(payload);
}

function verifyQrSignature(payloadObj, signature) {
    const { signature: _, ...payloadWithoutSig } = payloadObj;
    const secret = process.env.JWT_SECRET || 'default-secret';
    const dataToSign = JSON.stringify(payloadWithoutSig);
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(dataToSign)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    } catch {
        return false;
    }
}

// ============================================================================
// Credential Zones (分区管理)
// ============================================================================

export async function getZones(authContext, rawRaceId) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const zones = await repo.findZonesByRaceId(access.operatorOrgId, raceId);
    return zones.map(zone => ({
        id: Number(zone.id),
        zoneCode: zone.zone_code,
        zoneName: zone.zone_name,
        zoneColor: zone.zone_color,
        sortOrder: Number(zone.sort_order),
        geometry: zone.geometry,
        description: zone.description,
        isActive: zone.is_active,
        createdAt: zone.created_at,
        updatedAt: zone.updated_at,
    }));
}

export async function createZone(authContext, rawRaceId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    // 检查 zone_code 是否已存在
    const existing = await repo.findZoneByCode(access.operatorOrgId, raceId, data.zoneCode);
    if (existing) {
        throw badRequest(`Zone code "${data.zoneCode}" already exists`);
    }

    const payload = {
        org_id: access.operatorOrgId,
        race_id: raceId,
        zone_code: data.zoneCode,
        zone_name: data.zoneName,
        zone_color: data.zoneColor || '#3B82F6',
        sort_order: data.sortOrder || 0,
        geometry: data.geometry,
        description: data.description || null,
        is_active: data.isActive !== false,
    };

    const zone = await repo.insertZone(knex, payload);

    return {
        id: Number(zone.id),
        zoneCode: zone.zone_code,
        zoneName: zone.zone_name,
        zoneColor: zone.zone_color,
        sortOrder: Number(zone.sort_order),
        geometry: zone.geometry,
        description: zone.description,
        isActive: zone.is_active,
        createdAt: zone.created_at,
        updatedAt: zone.updated_at,
    };
}

export async function updateZone(authContext, rawRaceId, rawZoneId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const zoneId = Number(rawZoneId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const zone = await repo.findZoneById(access.operatorOrgId, zoneId);
    if (!zone || zone.race_id !== raceId) {
        throw notFound('Zone not found');
    }

    // 如果修改了 zone_code，检查是否与其他记录冲突
    if (data.zoneCode && data.zoneCode !== zone.zone_code) {
        const existing = await repo.findZoneByCode(access.operatorOrgId, raceId, data.zoneCode);
        if (existing && existing.id !== zoneId) {
            throw badRequest(`Zone code "${data.zoneCode}" already exists`);
        }
    }

    const patch = {};
    if (data.zoneCode !== undefined) patch.zone_code = data.zoneCode;
    if (data.zoneName !== undefined) patch.zone_name = data.zoneName;
    if (data.zoneColor !== undefined) patch.zone_color = data.zoneColor;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    if (data.geometry !== undefined) patch.geometry = data.geometry;
    if (data.description !== undefined) patch.description = data.description;
    if (data.isActive !== undefined) patch.is_active = data.isActive;

    const updated = await repo.updateZoneById(knex, zoneId, patch);

    return {
        id: Number(updated.id),
        zoneCode: updated.zone_code,
        zoneName: updated.zone_name,
        zoneColor: updated.zone_color,
        sortOrder: Number(updated.sort_order),
        geometry: updated.geometry,
        description: updated.description,
        isActive: updated.is_active,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
    };
}

export async function deleteZone(authContext, rawRaceId, rawZoneId) {
    const raceId = normalizeRaceId(rawRaceId);
    const zoneId = Number(rawZoneId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const zone = await repo.findZoneById(access.operatorOrgId, zoneId);
    if (!zone || zone.race_id !== raceId) {
        throw notFound('Zone not found');
    }

    // 检查是否被岗位模板引用
    const roleTemplateZones = await knex('credential_role_template_zones')
        .where({ zone_code: zone.zone_code, race_id: raceId })
        .count('* as count')
        .first();

    if (Number(roleTemplateZones.count) > 0) {
        throw badRequest(`分区 "${zone.zone_code}" 正被 ${roleTemplateZones.count} 个岗位模板引用，无法删除`);
    }

    // 检查是否被证件申请引用
    const applications = await knex('credential_applications')
        .where({ default_zone_code: zone.zone_code, race_id: raceId })
        .count('* as count')
        .first();

    if (Number(applications.count) > 0) {
        throw badRequest(`分区 "${zone.zone_code}" 正被 ${applications.count} 个证件申请引用，无法删除`);
    }

    await repo.deleteZoneById(knex, zoneId);
    return { success: true };
}

// ============================================================================
// Credential Role Templates (岗位模板)
// ============================================================================

export async function getRoleTemplates(authContext, rawRaceId) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const templates = await repo.findRoleTemplatesByRaceId(access.operatorOrgId, raceId);

    return Promise.all(templates.map(async (template) => {
        const zones = await repo.findRoleTemplateZones(template.id);
        return {
            id: Number(template.id),
            roleName: template.role_name,
            roleCode: template.role_code,
            defaultColor: template.default_color,
            requiresReview: template.requires_review,
            isActive: template.is_active,
            defaultStyleTemplateId: template.default_style_template_id,
            description: template.description,
            sortOrder: Number(template.sort_order),
            zoneCodes: zones.map(z => z.zone_code),
            createdAt: template.created_at,
            updatedAt: template.updated_at,
        };
    }));
}

export async function createRoleTemplate(authContext, rawRaceId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    // 检查 role_code 是否已存在
    const existing = await repo.findRoleTemplateByCode(access.operatorOrgId, raceId, data.roleCode);
    if (existing) {
        throw badRequest(`Role code "${data.roleCode}" already exists`);
    }

    const payload = {
        org_id: access.operatorOrgId,
        race_id: raceId,
        role_name: data.roleName,
        role_code: data.roleCode,
        default_color: data.defaultColor || '#6B7280',
        requires_review: data.requiresReview !== false,
        is_active: data.isActive !== false,
        default_style_template_id: data.defaultStyleTemplateId || null,
        description: data.description || null,
        sort_order: data.sortOrder || 0,
    };

    const template = await repo.insertRoleTemplate(knex, payload);

    // 关联区域
    if (data.zoneCodes && Array.isArray(data.zoneCodes) && data.zoneCodes.length > 0) {
        await knex.transaction(async (trx) => {
            for (const zoneCode of data.zoneCodes) {
                await repo.insertRoleTemplateZone(trx, {
                    role_template_id: template.id,
                    org_id: access.operatorOrgId,
                    race_id: raceId,
                    zone_code: zoneCode,
                });
            }
        });
    }

    const zones = await repo.findRoleTemplateZones(template.id);

    return {
        id: Number(template.id),
        roleName: template.role_name,
        roleCode: template.role_code,
        defaultColor: template.default_color,
        requiresReview: template.requires_review,
        isActive: template.is_active,
        defaultStyleTemplateId: template.default_style_template_id,
        description: template.description,
        sortOrder: Number(template.sort_order),
        zoneCodes: zones.map(z => z.zone_code),
        createdAt: template.created_at,
        updatedAt: template.updated_at,
    };
}

export async function updateRoleTemplate(authContext, rawRaceId, rawTemplateId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const templateId = Number(rawTemplateId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const template = await repo.findRoleTemplateById(access.operatorOrgId, templateId);
    if (!template || template.race_id !== raceId) {
        throw notFound('Role template not found');
    }

    // 如果修改了 role_code，检查是否与其他记录冲突
    if (data.roleCode && data.roleCode !== template.role_code) {
        const existing = await repo.findRoleTemplateByCode(access.operatorOrgId, raceId, data.roleCode);
        if (existing && existing.id !== templateId) {
            throw badRequest(`Role code "${data.roleCode}" already exists`);
        }
    }

    const patch = {};
    if (data.roleName !== undefined) patch.role_name = data.roleName;
    if (data.roleCode !== undefined) patch.role_code = data.roleCode;
    if (data.defaultColor !== undefined) patch.default_color = data.defaultColor;
    if (data.requiresReview !== undefined) patch.requires_review = data.requiresReview;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.defaultStyleTemplateId !== undefined) patch.default_style_template_id = data.defaultStyleTemplateId;
    if (data.description !== undefined) patch.description = data.description;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;

    const updated = await knex.transaction(async (trx) => {
        await repo.updateRoleTemplateById(trx, templateId, patch);

        // 更新区域关联
        if (data.zoneCodes !== undefined) {
            await repo.deleteRoleTemplateZones(trx, templateId);
            for (const zoneCode of data.zoneCodes) {
                await repo.insertRoleTemplateZone(trx, {
                    role_template_id: templateId,
                    org_id: access.operatorOrgId,
                    race_id: raceId,
                    zone_code: zoneCode,
                });
            }
        }

        return repo.findRoleTemplateById(access.operatorOrgId, templateId);
    });

    const zones = await repo.findRoleTemplateZones(templateId);

    return {
        id: Number(updated.id),
        roleName: updated.role_name,
        roleCode: updated.role_code,
        defaultColor: updated.default_color,
        requiresReview: updated.requires_review,
        isActive: updated.is_active,
        defaultStyleTemplateId: updated.default_style_template_id,
        description: updated.description,
        sortOrder: Number(updated.sort_order),
        zoneCodes: zones.map(z => z.zone_code),
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
    };
}

export async function deleteRoleTemplate(authContext, rawRaceId, rawTemplateId) {
    const raceId = normalizeRaceId(rawRaceId);
    const templateId = Number(rawTemplateId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const template = await repo.findRoleTemplateById(access.operatorOrgId, templateId);
    if (!template || template.race_id !== raceId) {
        throw notFound('Role template not found');
    }

    await repo.deleteRoleTemplateById(knex, templateId);
    return { success: true };
}

// ============================================================================
// Credential Style Templates (证件样式模板)
// ============================================================================

export async function getStyleTemplates(authContext, rawRaceId, options = {}) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const templates = await repo.findStyleTemplatesByRaceId(access.operatorOrgId, raceId, options);

    return templates.map(template => ({
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
    if (!template || template.race_id !== raceId) {
        throw notFound('Style template not found');
    }

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

    // 检查 template_code 是否已存在
    const existing = await repo.findStyleTemplateByCode(access.operatorOrgId, raceId, data.templateCode);
    if (existing) {
        throw badRequest(`Template code "${data.templateCode}" already exists`);
    }

    const payload = {
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
    };

    const template = await repo.insertStyleTemplate(knex, payload);

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
    if (!template || template.race_id !== raceId) {
        throw notFound('Style template not found');
    }

    // 如果修改了 template_code，检查是否与其他记录冲突
    if (data.templateCode && data.templateCode !== template.template_code) {
        const existing = await repo.findStyleTemplateByCode(access.operatorOrgId, raceId, data.templateCode);
        if (existing && existing.id !== templateId) {
            throw badRequest(`Template code "${data.templateCode}" already exists`);
        }
    }

    const patch = {};
    if (data.templateName !== undefined) patch.template_name = data.templateName;
    if (data.templateCode !== undefined) patch.template_code = data.templateCode;
    if (data.frontLayoutJson !== undefined) patch.front_layout_json = data.frontLayoutJson;
    if (data.backLayoutJson !== undefined) patch.back_layout_json = data.backLayoutJson;
    if (data.pageWidth !== undefined) patch.page_width = data.pageWidth;
    if (data.pageHeight !== undefined) patch.page_height = data.pageHeight;
    if (data.version !== undefined) patch.version = data.version;
    if (data.status !== undefined) patch.status = data.status;
    if (data.description !== undefined) patch.description = data.description;

    const updated = await repo.updateStyleTemplateById(knex, templateId, patch);

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
    if (!template || template.race_id !== raceId) {
        throw notFound('Style template not found');
    }

    await repo.deleteStyleTemplateById(knex, templateId);
    return { success: true };
}

// ============================================================================
// Credential Applications (证件申请)
// ============================================================================

export async function getApplications(authContext, rawRaceId, options = {}) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const applications = await repo.findApplicationsByRaceId(access.operatorOrgId, raceId, options);

    return Promise.all(applications.map(async (app) => {
        const overrides = await repo.findApplicationZoneOverrides(app.id);
        const credential = await repo.findCredentialByApplicationId(access.operatorOrgId, app.id);

        return {
            id: Number(app.id),
            applicantUserId: app.applicant_user_id,
            applicantName: app.applicant_name || app.person_name,
            applicantUsername: app.applicant_username,
            personName: app.person_name,
            orgName: app.org_name,
            roleTemplateId: Number(app.role_template_id),
            roleName: app.role_name,
            defaultZoneCode: app.default_zone_code,
            status: app.status,
            reviewerUserId: app.reviewer_user_id,
            reviewerUsername: app.reviewer_username,
            reviewedAt: app.reviewed_at,
            reviewRemark: app.review_remark,
            rejectReason: app.reject_reason,
            remark: app.remark,
            customFields: app.custom_fields,
            zoneOverrides: overrides,
            credentialId: credential ? Number(credential.id) : null,
            credentialStatus: credential ? credential.status : null,
            createdAt: app.created_at,
            updatedAt: app.updated_at,
        };
    }));
}

export async function getApplication(authContext, rawRaceId, rawApplicationId) {
    const raceId = normalizeRaceId(rawRaceId);
    const applicationId = Number(rawApplicationId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const app = await repo.findApplicationById(access.operatorOrgId, applicationId);
    if (!app || app.race_id !== raceId) {
        throw notFound('Application not found');
    }

    const overrides = await repo.findApplicationZoneOverrides(applicationId);
    const credential = await repo.findCredentialByApplicationId(access.operatorOrgId, applicationId);

    return {
        id: Number(app.id),
        applicantUserId: app.applicant_user_id,
        applicantName: app.applicant_name || app.person_name,
        applicantUsername: app.applicant_username,
        personName: app.person_name,
        orgName: app.org_name,
        roleTemplateId: Number(app.role_template_id),
        roleName: app.role_name,
        defaultZoneCode: app.default_zone_code,
        status: app.status,
        reviewerUserId: app.reviewer_user_id,
        reviewerUsername: app.reviewer_username,
        reviewedAt: app.reviewed_at,
        reviewRemark: app.review_remark,
        rejectReason: app.reject_reason,
        remark: app.remark,
        customFields: app.custom_fields,
        zoneOverrides: overrides,
        credentialId: credential ? Number(credential.id) : null,
        credentialStatus: credential ? credential.status : null,
        createdAt: app.created_at,
        updatedAt: app.updated_at,
    };
}

export async function createApplication(authContext, rawRaceId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');

    // 检查用户是否已有申请
    const existing = await repo.findApplicationByUserAndRace(access.operatorOrgId, authContext.userId, raceId);
    if (existing) {
        throw badRequest('You already have an application for this race');
    }

    const template = await repo.findRoleTemplateById(access.operatorOrgId, data.roleTemplateId);
    if (!template || template.race_id !== raceId) {
        throw badRequest('Invalid role template');
    }

    const payload = {
        org_id: access.operatorOrgId,
        race_id: raceId,
        applicant_user_id: authContext.userId,
        person_name: data.personName,
        org_name: data.orgName || null,
        role_template_id: data.roleTemplateId,
        role_name: template.role_name,
        default_zone_code: template.role_code, // 使用岗位编码作为默认区域
        status: template.requires_review ? APPLICATION_STATUS.SUBMITTED : APPLICATION_STATUS.APPROVED,
        remark: data.remark || null,
        custom_fields: data.customFields ? JSON.stringify(data.customFields) : null,
    };

    const app = await repo.insertApplication(knex, payload);

    return {
        id: Number(app.id),
        applicantUserId: app.applicant_user_id,
        personName: app.person_name,
        orgName: app.org_name,
        roleTemplateId: Number(app.role_template_id),
        roleName: app.role_name,
        defaultZoneCode: app.default_zone_code,
        status: app.status,
        remark: app.remark,
        customFields: app.custom_fields,
        createdAt: app.created_at,
        updatedAt: app.updated_at,
    };
}

export async function submitApplication(authContext, rawRaceId, rawApplicationId) {
    const raceId = normalizeRaceId(rawRaceId);
    const applicationId = Number(rawApplicationId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');

    const app = await repo.findApplicationById(access.operatorOrgId, applicationId);
    if (!app || app.race_id !== raceId) {
        throw notFound('Application not found');
    }

    if (app.status !== APPLICATION_STATUS.DRAFT && app.status !== APPLICATION_STATUS.REJECTED) {
        throw badRequest('Application cannot be submitted in current status');
    }

    const template = await repo.findRoleTemplateById(access.operatorOrgId, app.role_template_id);

    const updated = await repo.updateApplicationById(knex, applicationId, {
        status: template.requires_review ? APPLICATION_STATUS.UNDER_REVIEW : APPLICATION_STATUS.APPROVED,
    });

    return {
        id: Number(updated.id),
        status: updated.status,
        updatedAt: updated.updated_at,
    };
}

// ============================================================================
// Credential Review (证件审核)
// ============================================================================

export async function reviewApplication(authContext, rawRaceId, rawApplicationId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const applicationId = Number(rawApplicationId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    await knex.transaction(async (trx) => {
        // 使用 FOR UPDATE 锁防止并发审核
        const app = await trx('credential_applications')
            .where({ id: applicationId })
            .forUpdate()
            .first();

        if (!app || app.race_id !== raceId) {
            throw notFound('Application not found');
        }

        // 检查状态是否已被变更
        if (app.status !== APPLICATION_STATUS.UNDER_REVIEW && app.status !== APPLICATION_STATUS.SUBMITTED) {
            throw badRequest('Application is not under review (may have been reviewed by another user)');
        }

        const isApproved = data.approved === true;

        const patch = {
            reviewer_user_id: authContext.userId,
            reviewed_at: trx.fn.now(),
            review_remark: data.remark || null,
            status: isApproved ? APPLICATION_STATUS.APPROVED : APPLICATION_STATUS.REJECTED,
        };

        if (!isApproved && data.rejectReason) {
            patch.reject_reason = data.rejectReason;
        }

        await repo.updateApplicationById(trx, applicationId, patch);

        // 处理区域调整
        if (isApproved && data.zoneOverrides && Array.isArray(data.zoneOverrides)) {
            await repo.deleteApplicationZoneOverrides(trx, applicationId);
            for (const override of data.zoneOverrides) {
                await repo.insertApplicationZoneOverride(trx, {
                    application_id: applicationId,
                    org_id: access.operatorOrgId,
                    race_id: raceId,
                    zone_code: override.zoneCode,
                    override_type: override.overrideType || OVERRIDE_TYPE.ADD,
                    remark: override.remark || null,
                    operator_user_id: authContext.userId,
                });
            }
        }
    });

    const updated = await repo.findApplicationById(access.operatorOrgId, applicationId);

    return {
        id: Number(updated.id),
        status: updated.status,
        reviewerUserId: updated.reviewer_user_id,
        reviewedAt: updated.reviewed_at,
        reviewRemark: updated.review_remark,
        rejectReason: updated.reject_reason,
        updatedAt: updated.updated_at,
    };
}

// ============================================================================
// Credential Credentials (证件实例)
// ============================================================================

export async function getCredentials(authContext, rawRaceId, options = {}) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const credentials = await repo.findCredentialsByRaceId(access.operatorOrgId, raceId, options);

    return Promise.all(credentials.map(async (cred) => {
        const zones = await repo.findCredentialZones(cred.id);
        return {
            id: Number(cred.id),
            credentialNo: cred.credential_no,
            applicationId: Number(cred.application_id),
            roleName: cred.role_name,
            personName: cred.person_name,
            orgName: cred.org_name,
            defaultZoneCode: cred.default_zone_code,
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
            voidedAt: cred.voided_at,
            voidReason: cred.void_reason,
            zones: zones.map(z => ({
                zoneCode: z.zone_code,
                zoneName: z.zone_name,
                zoneColor: z.zone_color,
            })),
            createdAt: cred.created_at,
            updatedAt: cred.updated_at,
        };
    }));
}

export async function getCredential(authContext, rawRaceId, rawCredentialId) {
    const raceId = normalizeRaceId(rawRaceId);
    const credentialId = Number(rawCredentialId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const cred = await repo.findCredentialById(access.operatorOrgId, credentialId);
    if (!cred || cred.race_id !== raceId) {
        throw notFound('Credential not found');
    }

    const zones = await repo.findCredentialZones(credentialId);
    const scanLogs = await repo.findScanLogsByCredentialId(credentialId, 10);
    const issueLogs = await repo.findIssueLogsByCredentialId(credentialId, 10);

    return {
        id: Number(cred.id),
        credentialNo: cred.credential_no,
        applicationId: Number(cred.application_id),
        roleName: cred.role_name,
        personName: cred.person_name,
        orgName: cred.org_name,
        defaultZoneCode: cred.default_zone_code,
        templateSnapshotJson: cred.template_snapshot_json,
        mapSnapshotJson: cred.map_snapshot_json,
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
        zones: zones.map(z => ({
            zoneCode: z.zone_code,
            zoneName: z.zone_name,
            zoneColor: z.zone_color,
            geometry: z.geometry,
            zoneDescription: z.zone_description,
        })),
        recentScanLogs: scanLogs.map(log => ({
            id: Number(log.id),
            scanResult: log.scan_result,
            scannedAt: log.scanned_at,
            scanDevice: log.scan_device,
            scanLocation: log.scan_location,
        })),
        recentIssueLogs: issueLogs.map(log => ({
            id: Number(log.id),
            issuedToPersonName: log.issued_to_person_name,
            issuedAt: log.issued_at,
            issueSource: log.issue_source,
        })),
        createdAt: cred.created_at,
        updatedAt: cred.updated_at,
    };
}

export async function resolveCredentialByQrPayload(authContext, qrPayload) {
    const payloadObj = JSON.parse(qrPayload);
    const { credentialId, signature } = payloadObj;

    // 验证签名
    if (!verifyQrSignature(payloadObj, signature)) {
        return {
            valid: false,
            result: SCAN_RESULT.INVALID,
            message: 'Invalid signature',
        };
    }

    const cred = await repo.findCredentialById(null, credentialId);
    if (!cred) {
        return {
            valid: false,
            result: SCAN_RESULT.NOT_FOUND,
            message: 'Credential not found',
        };
    }

    if (cred.status === CREDENTIAL_STATUS.VOIDED) {
        return {
            valid: false,
            result: SCAN_RESULT.VOIDED,
            message: 'Credential has been voided',
            credential: {
                id: Number(cred.id),
                credentialNo: cred.credential_no,
                personName: cred.person_name,
                roleName: cred.role_name,
                status: cred.status,
            },
        };
    }

    const zones = await repo.findCredentialZones(cred.id);

    return {
        valid: true,
        result: SCAN_RESULT.VALID,
        credential: {
            id: Number(cred.id),
            credentialNo: cred.credential_no,
            personName: cred.person_name,
            roleName: cred.role_name,
            orgName: cred.org_name,
            status: cred.status,
            zones: zones.map(z => ({
                zoneCode: z.zone_code,
                zoneName: z.zone_name,
                zoneColor: z.zone_color,
            })),
        },
    };
}

export async function voidCredential(authContext, rawRaceId, rawCredentialId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const credentialId = Number(rawCredentialId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const cred = await repo.findCredentialById(access.operatorOrgId, credentialId);
    if (!cred || cred.race_id !== raceId) {
        throw notFound('Credential not found');
    }

    if (cred.status === CREDENTIAL_STATUS.VOIDED) {
        throw badRequest('Credential is already voided');
    }

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

export async function reissueCredential(authContext, rawRaceId, rawCredentialId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const credentialId = Number(rawCredentialId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const cred = await repo.findCredentialById(access.operatorOrgId, credentialId);
    if (!cred || cred.race_id !== raceId) {
        throw notFound('Credential not found');
    }

    await knex.transaction(async (trx) => {
        // 生成新证件编号
        const newCredentialNo = await generateCredentialNo(trx, raceId);

        // 生成新二维码 payload
        const newQrPayload = generateQrPayload({
            credentialId: null, // 将在插入后更新
            credentialNo: newCredentialNo,
            raceId,
            orgId: access.operatorOrgId,
            version: cred.qr_version + 1,
        });

        // 生成新证件
        const newCredential = await repo.insertCredential(trx, {
            org_id: access.operatorOrgId,
            race_id: raceId,
            application_id: cred.application_id,
            credential_no: newCredentialNo,
            role_name: cred.role_name,
            person_name: cred.person_name,
            org_name: cred.org_name,
            default_zone_code: cred.default_zone_code,
            template_snapshot_json: cred.template_snapshot_json,
            map_snapshot_json: cred.map_snapshot_json,
            qr_payload: newQrPayload,
            qr_version: cred.qr_version + 1,
            status: CREDENTIAL_STATUS.GENERATED,
            created_by: authContext.userId,
        });

        // 复制区域快照
        const oldZones = await repo.findCredentialZones(credentialId);
        for (const zone of oldZones) {
            await repo.insertCredentialZone(trx, {
                credential_id: newCredential.id,
                org_id: access.operatorOrgId,
                race_id: raceId,
                zone_code: zone.zone_code,
                zone_name: zone.zone_name,
                zone_color: zone.zone_color,
                geometry: zone.geometry,
                zone_description: zone.zone_description,
            });
        }

        // 记录补打日志
        await repo.insertReissueLog(trx, {
            credential_id: credentialId,
            org_id: access.operatorOrgId,
            race_id: raceId,
            reissue_reason: data.reissueReason || null,
            remark: data.remark || null,
            reissued_by_user_id: authContext.userId,
            new_credential_id: newCredential.id,
        });

        return newCredential;
    });

    return { success: true };
}

// ============================================================================
// Helper Functions (补打相关)
// ============================================================================

async function generateCredentialNo(trx, raceId) {
    // 获取当前最大编号
    const maxRow = await (trx || knex)('credential_credentials')
        .where({ race_id: raceId })
        .max('credential_no as max_no')
        .first();

    const maxNo = maxRow?.max_no || 'CRED-000000';
    const numPart = parseInt(maxNo.replace(/\D/g, ''), 10) || 0;
    const newNum = String(numPart + 1).padStart(6, '0');
    return `CRED-${newNum}`;
}

// ============================================================================
// Credential Issue (领取)
// ============================================================================

export async function issueCredential(authContext, rawRaceId, rawCredentialId, data) {
    const raceId = normalizeRaceId(rawRaceId);
    const credentialId = Number(rawCredentialId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');

    const cred = await repo.findCredentialById(access.operatorOrgId, credentialId);
    if (!cred || cred.race_id !== raceId) {
        throw notFound('Credential not found');
    }

    if (cred.status === CREDENTIAL_STATUS.VOIDED) {
        throw badRequest('Credential has been voided');
    }

    if (cred.status === CREDENTIAL_STATUS.ISSUED) {
        throw badRequest('Credential has already been issued');
    }

    await knex.transaction(async (trx) => {
        // 更新证件状态
        await repo.updateCredentialById(trx, credentialId, {
            status: CREDENTIAL_STATUS.ISSUED,
            issued_to_user_id: authContext.userId,
            issued_at: trx.fn.now(),
            issue_source: 'manual',
        });

        // 记录领取日志
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

// ============================================================================
// Credential Stats (统计)
// ============================================================================

export async function getCredentialStats(authContext, rawRaceId) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const stats = await knex('credential_credentials')
        .where({ org_id: access.operatorOrgId, race_id: raceId })
        .select('status')
        .count('* as count')
        .groupBy('status');

    const result = {
        total: 0,
        generated: 0,
        printed: 0,
        issued: 0,
        returned: 0,
        voided: 0,
    };

    for (const row of stats) {
        const count = Number(row.count || 0);
        result.total += count;
        if (row.status) {
            result[row.status] = count;
        }
    }

    return result;
}
