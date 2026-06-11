import knex from '../../db/knex.js';
import { EVENT_TYPES, listDefaultTemplates } from './design-request.defaults.js';
import { getCurrentApprovalForBusiness, startApproval } from '../approvals/approval.service.js';

const REQUEST_STATUSES_VISIBLE_TO_DESIGNERS = ['approved', 'in_design', 'design_uploaded', 'delivered', 'archived'];
const PROGRESS_STAGES = [
    'intake_review',
    'assigned',
    'designing',
    'internal_review',
    'revision_requested',
    'ready_to_order',
    'ordered',
    'delivered',
];
const ORDER_STATUSES = ['not_ready', 'ready', 'ordered'];
const PROGRESS_ACTIONS = ['request_revision', 'approve_final', 'mark_ordered', 'mark_delivered'];

function httpError(status, message) {
    return Object.assign(new Error(message), { status, expose: true });
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableString(value) {
    const text = normalizeString(value);
    return text || null;
}

function normalizeEventType(value) {
    const eventType = normalizeString(value) || 'general';
    return EVENT_TYPES.includes(eventType) ? eventType : 'general';
}

function normalizePriority(value) {
    const priority = normalizeString(value) || 'normal';
    return ['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : 'normal';
}

function normalizeDate(value, fieldName) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
        throw httpError(400, fieldName + ' 格式不正确');
    }
    return date.toISOString();
}

function parseJson(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }
    return value;
}

async function findRace(raceId) {
    const race = await knex('races').where({ id: Number(raceId) }).first('id', 'org_id', 'name');
    if (!race) throw httpError(404, '赛事不存在');
    return race;
}

function normalizeRaceIds(value) {
    let raw;
    if (Array.isArray(value)) raw = value;
    else if (typeof value === 'string' && value.includes(',')) raw = value.split(',');
    else if (value === null || value === undefined || value === '') raw = [];
    else raw = [value];
    return [...new Set(raw.map(Number).filter(Boolean))];
}

async function resolveOrgAndRaceLinks(context, payload = {}, trx = knex) {
    const raceIds = normalizeRaceIds([
        ...normalizeRaceIds(payload.raceIds),
        ...normalizeRaceIds(payload.raceId),
        ...normalizeRaceIds(payload.primaryRaceId),
    ]);
    const primaryRaceId = payload.primaryRaceId
        ? Number(payload.primaryRaceId)
        : payload.raceId
            ? Number(payload.raceId)
            : (raceIds[0] || null);
    if (primaryRaceId && !raceIds.includes(primaryRaceId)) raceIds.unshift(primaryRaceId);

    let orgId = context.orgId || payload.orgId || null;
    let races = [];
    if (raceIds.length > 0) {
        races = await trx('races')
            .whereIn('id', raceIds)
            .select('id', 'org_id', 'name');
        if (races.length !== raceIds.length) throw httpError(404, '关联赛事不存在');
        const orgIds = new Set(races.map((race) => String(race.org_id)));
        if (orgIds.size > 1) throw httpError(400, '关联赛事必须属于同一组织');
        const raceOrgId = races[0].org_id;
        if (orgId && String(orgId) !== String(raceOrgId)) {
            if (context.role !== 'super_admin') throw httpError(403, '无权关联其他组织赛事');
            orgId = raceOrgId;
        }
        orgId = orgId || raceOrgId;
    }
    if (!orgId) throw httpError(400, '缺少组织上下文');

    return {
        orgId,
        primaryRaceId,
        raceIds,
        races,
    };
}

function applyOrgScope(query, context) {
    if (context.role === 'super_admin') {
        if (context.orgId) return query.where('dr.org_id', context.orgId);
        return query;
    }
    if (!context.orgId) return query.whereRaw('1 = 0');
    return query.where('dr.org_id', context.orgId);
}

function mapTemplate(row) {
    return {
        id: row.id,
        orgId: row.org_id || null,
        raceId: row.race_id ? Number(row.race_id) : null,
        eventType: row.event_type,
        name: row.name,
        description: row.description || '',
        fields: parseJson(row.fields_json, []),
        samplePayload: parseJson(row.sample_payload_json, {}),
        sourceRequestId: row.source_request_id || null,
        isDefault: Boolean(row.is_default),
        createdBy: row.created_by || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapDefaultTemplate(template) {
    return {
        ...template,
        orgId: null,
        raceId: null,
        sourceRequestId: null,
        createdBy: null,
        createdAt: null,
        updatedAt: null,
    };
}

function mapAsset(row) {
    return {
        id: row.id,
        requestId: row.request_id,
        assetType: row.asset_type,
        fileName: row.file_name,
        fileUrl: row.file_url,
        mimeType: row.mime_type || '',
        note: row.note || '',
        version: Number(row.version || 1),
        uploadedBy: row.uploaded_by || null,
        createdAt: row.created_at,
    };
}

function mapReview(row) {
    return {
        id: row.id,
        requestId: row.request_id,
        action: row.action,
        fromStatus: row.from_status || null,
        toStatus: row.to_status,
        comment: row.comment || '',
        actorId: row.actor_id || null,
        createdAt: row.created_at,
    };
}

function mapProgressEvent(row) {
    return {
        id: row.id,
        requestId: row.request_id,
        eventType: row.event_type,
        fromStage: row.from_stage || null,
        toStage: row.to_stage || null,
        revisionNo: row.revision_no === null || row.revision_no === undefined ? null : Number(row.revision_no),
        orderStatus: row.order_status || null,
        comment: row.comment || '',
        metadata: parseJson(row.metadata_json, {}),
        actorId: row.actor_id || null,
        createdAt: row.created_at,
    };
}

function progressStageFromStatus(status) {
    if (status === 'approved') return 'assigned';
    if (status === 'in_design') return 'designing';
    if (status === 'design_uploaded') return 'internal_review';
    if (status === 'delivered') return 'delivered';
    return 'intake_review';
}

function mapProgress(row, events = []) {
    return {
        stage: PROGRESS_STAGES.includes(row.progress_stage) ? row.progress_stage : progressStageFromStatus(row.status),
        revisionCount: Number(row.revision_count || 0),
        currentRevisionNo: Number(row.current_revision_no || 0),
        orderStatus: ORDER_STATUSES.includes(row.order_status) ? row.order_status : 'not_ready',
        orderReference: row.order_reference || '',
        orderNote: row.order_note || '',
        finalApprovedAt: row.final_approved_at || null,
        orderedAt: row.ordered_at || null,
        events: events.map(mapProgressEvent),
    };
}

function normalizeProgressAction(value) {
    const action = normalizeString(value);
    if (!PROGRESS_ACTIONS.includes(action)) {
        throw httpError(400, '进度动作不正确');
    }
    return action;
}

async function writeProgressEvent(trx, requestId, event) {
    await trx('design_request_progress_events').insert({
        request_id: requestId,
        event_type: event.eventType,
        from_stage: event.fromStage || null,
        to_stage: event.toStage || null,
        revision_no: event.revisionNo === undefined ? null : event.revisionNo,
        order_status: event.orderStatus || null,
        comment: event.comment || null,
        metadata_json: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
        actor_id: event.actorId || null,
    });
}

function hasDeliverable(row, deliverables) {
    return Number(row.current_revision_no || 0) > 0 || deliverables.length > 0;
}

function latestProgressStage(row) {
    return PROGRESS_STAGES.includes(row.progress_stage) ? row.progress_stage : progressStageFromStatus(row.status);
}

function mapRaceLink(row) {
    return {
        id: row.id,
        raceId: Number(row.race_id),
        raceName: row.race_name || '',
        relationType: row.relation_type || 'related',
        createdAt: row.created_at || null,
    };
}

function mapRequest(row, assets = [], reviews = [], currentApproval = null, progressEvents = [], raceLinks = []) {
    const mappedAssets = assets.map(mapAsset);
    const mappedRaceLinks = raceLinks.map(mapRaceLink);
    const primaryRaceId = row.primary_race_id || row.race_id ? Number(row.primary_race_id || row.race_id) : null;
    return {
        id: row.id,
        orgId: row.org_id,
        raceId: primaryRaceId,
        primaryRaceId,
        raceName: row.primary_race_name || row.race_name || '',
        raceIds: mappedRaceLinks.length > 0
            ? mappedRaceLinks.map((item) => item.raceId)
            : (primaryRaceId ? [primaryRaceId] : []),
        raceLinks: mappedRaceLinks,
        templateId: row.template_id || null,
        eventType: row.event_type,
        requesterDepartment: row.requester_department,
        requesterName: row.requester_name,
        title: row.title,
        requirementText: row.requirement_text,
        referenceNotes: row.reference_notes || '',
        sizeSpec: row.size_spec || '',
        materialSpec: row.material_spec || '',
        dueAt: row.due_at,
        priority: row.priority,
        status: row.status,
        source: row.source_type || 'manual',
        assignedDesignerId: row.assigned_designer_id || null,
        reviewerId: row.reviewer_id || null,
        reviewComment: row.review_comment || '',
        approvedAt: row.approved_at || null,
        createdBy: row.created_by || null,
        updatedBy: row.updated_by || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        referenceAssets: mappedAssets.filter((asset) => asset.assetType === 'reference'),
        deliverables: mappedAssets.filter((asset) => asset.assetType === 'deliverable'),
        reviews: reviews.map(mapReview),
        currentApproval,
        progress: mapProgress(row, progressEvents),
    };
}

async function loadAssets(requestIds) {
    if (requestIds.length === 0) return new Map();
    const rows = await knex('design_request_assets')
        .whereIn('request_id', requestIds)
        .orderBy('created_at', 'asc');
    const grouped = new Map();
    for (const row of rows) {
        const key = row.request_id;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }
    return grouped;
}

async function loadReviews(requestIds) {
    if (requestIds.length === 0) return new Map();
    const rows = await knex('design_request_reviews')
        .whereIn('request_id', requestIds)
        .orderBy('created_at', 'asc');
    const grouped = new Map();
    for (const row of rows) {
        const key = row.request_id;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }
    return grouped;
}

async function loadProgressEvents(requestIds) {
    if (requestIds.length === 0) return new Map();
    const rows = await knex('design_request_progress_events')
        .whereIn('request_id', requestIds)
        .orderBy('created_at', 'asc');
    const grouped = new Map();
    for (const row of rows) {
        const key = row.request_id;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }
    return grouped;
}

async function loadRaceLinks(requestIds, trx = knex) {
    if (requestIds.length === 0) return new Map();
    const rows = await trx('design_request_race_links as drl')
        .leftJoin('races as r', 'r.id', 'drl.race_id')
        .whereIn('drl.design_request_id', requestIds)
        .select('drl.*', 'r.name as race_name')
        .orderBy([{ column: 'drl.relation_type', order: 'asc' }, { column: 'drl.created_at', order: 'asc' }]);
    const grouped = new Map();
    for (const row of rows) {
        const key = row.design_request_id;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }
    return grouped;
}

async function replaceRaceLinks(trx, { requestId, orgId, raceIds, primaryRaceId, createdBy = null }) {
    await trx('design_request_race_links').where({ design_request_id: requestId }).del();
    if (!raceIds.length) return;
    await trx('design_request_race_links').insert(raceIds.map((raceId) => ({
        org_id: orgId,
        design_request_id: requestId,
        race_id: raceId,
        relation_type: primaryRaceId && Number(raceId) === Number(primaryRaceId) ? 'primary' : 'related',
        created_by: createdBy,
    })));
}

async function getRequestRow(context, requestId, trx = knex) {
    const query = trx('design_requests as dr')
        .leftJoin('races as r', 'r.id', trx.raw('COALESCE(dr.primary_race_id, dr.race_id)'))
        .select('dr.*', 'r.name as primary_race_name')
        .where('dr.id', requestId);
    applyOrgScope(query, context);
    const row = await query.first();
    if (!row) throw httpError(404, '设计需求不存在');
    return row;
}

async function writeHistory(trx, requestId, action, fromStatus, toStatus, comment, actorId) {
    await trx('design_request_reviews').insert({
        request_id: requestId,
        action,
        from_status: fromStatus || null,
        to_status: toStatus,
        comment: comment || null,
        actor_id: actorId || null,
    });
}

export async function listTemplates(context, filters = {}) {
    const eventType = filters.eventType ? normalizeEventType(filters.eventType) : null;
    const raceId = filters.raceId ? Number(filters.raceId) : null;

    const query = knex('design_request_templates').orderBy('created_at', 'desc');
    if (context.role !== 'super_admin') {
        query.where(function scopedTemplates() {
            this.whereNull('org_id');
            if (context.orgId) this.orWhere('org_id', context.orgId);
        });
    }
    if (raceId) {
        query.where(function scopedRaceTemplates() {
            this.whereNull('race_id').orWhere('race_id', raceId);
        });
    }
    if (eventType) query.where('event_type', eventType);

    const rows = await query;
    const customTemplates = rows.map(mapTemplate);
    const defaults = listDefaultTemplates(eventType).map(mapDefaultTemplate);
    const customKeys = new Set(customTemplates.map((item) => item.eventType + ':' + item.name));
    return [
        ...customTemplates,
        ...defaults.filter((item) => !customKeys.has(item.eventType + ':' + item.name)),
    ];
}

export async function createTemplate(context, payload = {}) {
    const eventType = normalizeEventType(payload.eventType);
    const name = normalizeString(payload.name);
    if (!name) throw httpError(400, '模板名称不能为空');

    let orgId = context.orgId || null;
    let raceId = payload.raceId ? Number(payload.raceId) : null;
    if (raceId) {
        const race = await findRace(raceId);
        if (orgId && String(orgId) !== String(race.org_id) && context.role !== 'super_admin') {
            throw httpError(403, '无权使用其他组织赛事模板');
        }
        orgId = race.org_id;
    }

    const [row] = await knex('design_request_templates')
        .insert({
            org_id: orgId,
            race_id: raceId,
            event_type: eventType,
            name,
            description: normalizeNullableString(payload.description),
            fields_json: JSON.stringify(Array.isArray(payload.fields) ? payload.fields : []),
            sample_payload_json: JSON.stringify(payload.samplePayload && typeof payload.samplePayload === 'object' ? payload.samplePayload : {}),
            is_default: Boolean(payload.isDefault),
            created_by: context.userId || null,
        })
        .returning('*');

    return mapTemplate(row);
}

export async function createTemplateFromRequest(context, requestId, payload = {}) {
    const request = await getRequest(context, requestId);
    return createTemplate(context, {
        raceId: request.raceId,
        eventType: request.eventType,
        name: normalizeString(payload.name) || request.title,
        description: normalizeString(payload.description) || '从设计需求沉淀的模板',
        fields: listDefaultTemplates(request.eventType)[0].fields,
        samplePayload: {
            title: request.title,
            requirementText: request.requirementText,
            referenceNotes: request.referenceNotes,
            sizeSpec: request.sizeSpec,
            materialSpec: request.materialSpec,
            dueAt: request.dueAt,
        },
    });
}

export async function listRequests(context, filters = {}) {
    const query = knex('design_requests as dr')
        .leftJoin('races as r', 'r.id', knex.raw('COALESCE(dr.primary_race_id, dr.race_id)'))
        .select('dr.*', 'r.name as primary_race_name')
        .orderBy('dr.updated_at', 'desc');

    applyOrgScope(query, context);
    if (filters.raceId) {
        const raceId = Number(filters.raceId);
        query.where(function linkedRaceFilter() {
            this.where('dr.race_id', raceId)
                .orWhere('dr.primary_race_id', raceId)
                .orWhereExists(function linkedRaceExists() {
                    this.select(1)
                        .from('design_request_race_links as drl')
                        .whereRaw('drl.design_request_id = dr.id')
                        .where('drl.race_id', raceId);
                });
        });
    }
    const raceIds = normalizeRaceIds(filters.raceIds);
    if (!filters.raceId && raceIds.length > 0) {
        query.where(function linkedRaceGroupFilter() {
            this.whereIn('dr.race_id', raceIds)
                .orWhereIn('dr.primary_race_id', raceIds)
                .orWhereExists(function linkedRaceExists() {
                    this.select(1)
                        .from('design_request_race_links as drl')
                        .whereRaw('drl.design_request_id = dr.id')
                        .whereIn('drl.race_id', raceIds);
                });
        });
    }
    if (filters.raceScope === 'unlinked') {
        query.whereNull('dr.race_id')
            .whereNull('dr.primary_race_id')
            .whereNotExists(function noLinkedRaceExists() {
                this.select(1)
                    .from('design_request_race_links as drl')
                    .whereRaw('drl.design_request_id = dr.id');
            });
    }
    if (filters.status) query.where('dr.status', normalizeString(filters.status));
    if (filters.eventType) query.where('dr.event_type', normalizeEventType(filters.eventType));
    if (filters.surface === 'app') query.whereIn('dr.status', REQUEST_STATUSES_VISIBLE_TO_DESIGNERS);

    const rows = await query;
    const ids = rows.map((row) => row.id);
    const assetsByRequest = await loadAssets(ids);
    const progressByRequest = await loadProgressEvents(ids);
    const raceLinksByRequest = await loadRaceLinks(ids);
    const approvals = new Map();
    for (const id of ids) {
        approvals.set(id, await getCurrentApprovalForBusiness(context, {
            businessType: 'design_request',
            businessId: id,
        }));
    }
    return {
        items: rows.map((row) => mapRequest(
            row,
            assetsByRequest.get(row.id) || [],
            [],
            approvals.get(row.id) || null,
            progressByRequest.get(row.id) || [],
            raceLinksByRequest.get(row.id) || [],
        )),
        total: rows.length,
    };
}

export async function getRequest(context, requestId) {
    const row = await getRequestRow(context, requestId);
    const assets = await loadAssets([row.id]);
    const reviews = await loadReviews([row.id]);
    const progressEvents = await loadProgressEvents([row.id]);
    const raceLinks = await loadRaceLinks([row.id]);
    const currentApproval = await getCurrentApprovalForBusiness(context, {
        businessType: 'design_request',
        businessId: row.id,
    });
    return mapRequest(
        row,
        assets.get(row.id) || [],
        reviews.get(row.id) || [],
        currentApproval,
        progressEvents.get(row.id) || [],
        raceLinks.get(row.id) || [],
    );
}

export async function createRequest(context, payload = {}) {
    const title = normalizeString(payload.title);
    const requirementText = normalizeString(payload.requirementText);
    const requesterDepartment = normalizeString(payload.requesterDepartment);
    const requesterName = normalizeString(payload.requesterName);
    if (!title) throw httpError(400, '需求标题不能为空');
    if (!requirementText) throw httpError(400, '具体需求不能为空');
    if (!requesterDepartment) throw httpError(400, '需求部门不能为空');
    if (!requesterName) throw httpError(400, '提交人不能为空');

    const referenceAssets = Array.isArray(payload.referenceAssets) ? payload.referenceAssets : [];

    const created = await knex.transaction(async (trx) => {
        const raceContext = await resolveOrgAndRaceLinks(context, payload, trx);
        const [row] = await trx('design_requests')
            .insert({
                org_id: raceContext.orgId,
                race_id: raceContext.primaryRaceId,
                primary_race_id: raceContext.primaryRaceId,
                template_id: payload.templateId || null,
                event_type: normalizeEventType(payload.eventType),
                requester_department: requesterDepartment,
                requester_name: requesterName,
                title,
                requirement_text: requirementText,
                reference_notes: normalizeNullableString(payload.referenceNotes),
                size_spec: normalizeNullableString(payload.sizeSpec),
                material_spec: normalizeNullableString(payload.materialSpec),
                due_at: normalizeDate(payload.dueAt, '需求时间'),
                priority: normalizePriority(payload.priority),
                status: 'pending_review',
                progress_stage: 'intake_review',
                order_status: 'not_ready',
                created_by: context.userId || null,
                updated_by: context.userId || null,
            })
            .returning('*');

        await replaceRaceLinks(trx, {
            requestId: row.id,
            orgId: raceContext.orgId,
            raceIds: raceContext.raceIds,
            primaryRaceId: raceContext.primaryRaceId,
            createdBy: context.userId || null,
        });

        for (const asset of referenceAssets) {
            const fileName = normalizeString(asset.fileName);
            const fileUrl = normalizeString(asset.fileUrl);
            if (!fileName || !fileUrl) continue;
            await trx('design_request_assets').insert({
                request_id: row.id,
                asset_type: 'reference',
                file_name: fileName,
                file_url: fileUrl,
                mime_type: normalizeNullableString(asset.mimeType),
                note: normalizeNullableString(asset.note),
                version: 1,
                uploaded_by: context.userId || null,
            });
        }

        await writeHistory(trx, row.id, 'submit', null, 'pending_review', '提交设计需求', context.userId);
        await writeProgressEvent(trx, row.id, {
            eventType: 'submitted',
            toStage: 'intake_review',
            revisionNo: 0,
            orderStatus: 'not_ready',
            comment: '提交设计需求',
            actorId: context.userId,
        });
        await startApproval({
            ...context,
            orgId: raceContext.orgId,
            primaryRaceId: raceContext.primaryRaceId,
            raceId: raceContext.primaryRaceId,
            raceIds: raceContext.raceIds,
            requesterUserId: context.userId || null,
        }, {
            businessType: 'design_request',
            businessId: row.id,
            actionKey: 'submit',
            primaryRaceId: raceContext.primaryRaceId,
            raceId: raceContext.primaryRaceId,
            raceIds: raceContext.raceIds,
            requesterUserId: context.userId || null,
            businessRecord: {
                ...row,
                primaryRaceId: raceContext.primaryRaceId,
                raceIds: raceContext.raceIds,
                moduleKey: 'design_requests',
            },
        }, trx);
        return row;
    });

    return getRequest(context, created.id);
}

export async function reviewRequest(context, requestId, payload = {}) {
    const action = normalizeString(payload.action);
    if (!['approve', 'reject', 'needs_info'].includes(action)) {
        throw httpError(400, '审核动作不正确');
    }

    await knex.transaction(async (trx) => {
        const row = await getRequestRow(context, requestId, trx);
        if (!['pending_review', 'needs_info'].includes(row.status)) {
            throw httpError(409, '当前状态不能审核');
        }

        const nextStatus = action === 'approve' ? 'approved' : action;
        const updatePayload = {
            status: nextStatus,
            progress_stage: action === 'approve' ? 'assigned' : 'intake_review',
            reviewer_id: context.userId || null,
            review_comment: normalizeNullableString(payload.comment),
            updated_by: context.userId || null,
            updated_at: trx.fn.now(),
        };
        if (action === 'approve') {
            updatePayload.approved_at = trx.fn.now();
            updatePayload.assigned_designer_id = payload.assignedDesignerId || null;
        }

        await trx('design_requests').where({ id: requestId }).update(updatePayload);
        await writeHistory(trx, requestId, action, row.status, nextStatus, normalizeNullableString(payload.comment), context.userId);
        await writeProgressEvent(trx, requestId, {
            eventType: action === 'approve' ? 'approved' : action,
            fromStage: latestProgressStage(row),
            toStage: updatePayload.progress_stage,
            revisionNo: Number(row.current_revision_no || 0),
            orderStatus: row.order_status || 'not_ready',
            comment: normalizeNullableString(payload.comment),
            actorId: context.userId,
        });
    });

    return getRequest(context, requestId);
}

export async function startDesign(context, requestId) {
    await knex.transaction(async (trx) => {
        const row = await getRequestRow(context, requestId, trx);
        if (row.status !== 'approved') {
            throw httpError(409, '设计需求尚未通过主管审批，不能开始设计');
        }
        await trx('design_requests')
            .where({ id: requestId })
            .update({
                status: 'in_design',
                progress_stage: 'designing',
                updated_by: context.userId || null,
                updated_at: trx.fn.now(),
            });
        await writeHistory(trx, requestId, 'start_design', row.status, 'in_design', '开始设计', context.userId);
        await writeProgressEvent(trx, requestId, {
            eventType: 'design_started',
            fromStage: latestProgressStage(row),
            toStage: 'designing',
            revisionNo: Number(row.current_revision_no || 0),
            orderStatus: row.order_status || 'not_ready',
            comment: '开始设计',
            actorId: context.userId,
        });
    });

    return getRequest(context, requestId);
}

export async function addAsset(context, requestId, payload = {}) {
    const assetType = normalizeString(payload.assetType) || 'deliverable';
    if (!['reference', 'deliverable'].includes(assetType)) {
        throw httpError(400, '附件类型不正确');
    }
    const fileName = normalizeString(payload.fileName);
    const fileUrl = normalizeString(payload.fileUrl);
    if (!fileName || !fileUrl) throw httpError(400, '文件名称和地址不能为空');

    await knex.transaction(async (trx) => {
        const row = await getRequestRow(context, requestId, trx);
        if (assetType === 'deliverable' && !['in_design', 'design_uploaded'].includes(row.status)) {
            throw httpError(409, '只有设计中的需求才能上传完成图示');
        }

        const latest = await trx('design_request_assets')
            .where({ request_id: requestId, asset_type: assetType })
            .max('version as version')
            .first();
        const version = Number(latest?.version || 0) + 1;
        await trx('design_request_assets').insert({
            request_id: requestId,
            asset_type: assetType,
            file_name: fileName,
            file_url: fileUrl,
            mime_type: normalizeNullableString(payload.mimeType),
            note: normalizeNullableString(payload.note),
            version,
            uploaded_by: context.userId || null,
        });

        const nextStatus = assetType === 'deliverable' ? 'design_uploaded' : row.status;
        const updatePayload = {
            status: nextStatus,
            updated_by: context.userId || null,
            updated_at: trx.fn.now(),
        };
        if (assetType === 'deliverable') {
            updatePayload.progress_stage = 'internal_review';
            updatePayload.current_revision_no = version;
            updatePayload.order_status = 'not_ready';
            updatePayload.order_reference = null;
            updatePayload.order_note = null;
            updatePayload.final_approved_at = null;
            updatePayload.ordered_at = null;
        }
        await trx('design_requests')
            .where({ id: requestId })
            .update(updatePayload);
        await writeHistory(trx, requestId, assetType === 'deliverable' ? 'upload_deliverable' : 'upload_reference', row.status, nextStatus, normalizeNullableString(payload.note), context.userId);
        await writeProgressEvent(trx, requestId, {
            eventType: assetType === 'deliverable' ? 'revision_uploaded' : 'reference_uploaded',
            fromStage: latestProgressStage(row),
            toStage: assetType === 'deliverable' ? 'internal_review' : latestProgressStage(row),
            revisionNo: assetType === 'deliverable' ? version : Number(row.current_revision_no || 0),
            orderStatus: assetType === 'deliverable' ? 'not_ready' : row.order_status || 'not_ready',
            comment: normalizeNullableString(payload.note),
            actorId: context.userId,
            metadata: {
                fileName,
                fileUrl,
                assetType,
            },
        });
    });

    return getRequest(context, requestId);
}

export async function updateProgress(context, requestId, payload = {}) {
    const action = normalizeProgressAction(payload.action);
    const comment = normalizeNullableString(payload.comment);
    const orderReference = normalizeNullableString(payload.orderReference);
    const orderNote = normalizeNullableString(payload.orderNote);

    await knex.transaction(async (trx) => {
        const row = await getRequestRow(context, requestId, trx);
        const deliverables = await trx('design_request_assets')
            .where({ request_id: requestId, asset_type: 'deliverable' })
            .orderBy('version', 'asc');
        const fromStage = latestProgressStage(row);
        const revisionNo = Number(row.current_revision_no || deliverables.at(-1)?.version || 0);
        const baseUpdate = {
            updated_by: context.userId || null,
            updated_at: trx.fn.now(),
        };
        let nextStatus = row.status;
        let nextStage = fromStage;
        let nextOrderStatus = row.order_status || 'not_ready';
        let eventType = action;
        let eventComment = comment;
        let metadata = {};

        if (action === 'request_revision') {
            if (!hasDeliverable(row, deliverables)) {
                throw httpError(409, '尚未上传设计稿，不能打回修改');
            }
            if (row.order_status === 'ordered') {
                throw httpError(409, '设计稿已下单，不能直接打回修改');
            }
            nextStatus = 'in_design';
            nextStage = 'revision_requested';
            nextOrderStatus = 'not_ready';
            await trx('design_requests')
                .where({ id: requestId })
                .update({
                    ...baseUpdate,
                    status: nextStatus,
                    progress_stage: nextStage,
                    revision_count: trx.raw('revision_count + 1'),
                    order_status: nextOrderStatus,
                    order_reference: null,
                    order_note: null,
                    final_approved_at: null,
                    ordered_at: null,
                });
        } else if (action === 'approve_final') {
            if (!hasDeliverable(row, deliverables) || row.status !== 'design_uploaded') {
                throw httpError(409, '只有已上传设计稿的需求才能定稿');
            }
            nextStage = 'ready_to_order';
            nextOrderStatus = 'ready';
            eventType = 'final_approved';
            await trx('design_requests')
                .where({ id: requestId })
                .update({
                    ...baseUpdate,
                    progress_stage: nextStage,
                    order_status: nextOrderStatus,
                    final_approved_at: trx.fn.now(),
                });
        } else if (action === 'mark_ordered') {
            if (!['ready', 'ordered'].includes(row.order_status) && fromStage !== 'ready_to_order') {
                throw httpError(409, '设计稿尚未定稿，不能标记下单');
            }
            nextStage = 'ordered';
            nextOrderStatus = 'ordered';
            eventType = 'ordered';
            eventComment = orderNote || comment;
            metadata = { orderReference };
            await trx('design_requests')
                .where({ id: requestId })
                .update({
                    ...baseUpdate,
                    progress_stage: nextStage,
                    order_status: nextOrderStatus,
                    order_reference: orderReference,
                    order_note: orderNote || comment,
                    ordered_at: row.ordered_at || trx.fn.now(),
                });
        } else if (action === 'mark_delivered') {
            if (row.order_status !== 'ordered') {
                throw httpError(409, '设计稿尚未下单，不能标记交付');
            }
            nextStatus = 'delivered';
            nextStage = 'delivered';
            nextOrderStatus = 'ordered';
            eventType = 'delivered';
            await trx('design_requests')
                .where({ id: requestId })
                .update({
                    ...baseUpdate,
                    status: nextStatus,
                    progress_stage: nextStage,
                });
        }

        await writeHistory(trx, requestId, action, row.status, nextStatus, eventComment, context.userId);
        await writeProgressEvent(trx, requestId, {
            eventType,
            fromStage,
            toStage: nextStage,
            revisionNo,
            orderStatus: nextOrderStatus,
            comment: eventComment,
            actorId: context.userId,
            metadata,
        });
    });

    return getRequest(context, requestId);
}

export async function getStats(context, filters = {}) {
    const list = await listRequests(context, { ...filters, surface: filters.surface });
    const today = new Date();
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);

    const stats = {
        total: list.total,
        pendingReview: 0,
        approved: 0,
        inDesign: 0,
        designUploaded: 0,
        delivered: 0,
        rejected: 0,
        needsInfo: 0,
        revisionRequested: 0,
        readyToOrder: 0,
        ordered: 0,
        dueToday: 0,
        dueThisWeek: 0,
    };

    for (const item of list.items) {
        if (item.status === 'pending_review') stats.pendingReview += 1;
        if (item.status === 'approved') stats.approved += 1;
        if (item.status === 'in_design') stats.inDesign += 1;
        if (item.status === 'design_uploaded') stats.designUploaded += 1;
        if (item.status === 'delivered') stats.delivered += 1;
        if (item.status === 'rejected') stats.rejected += 1;
        if (item.status === 'needs_info') stats.needsInfo += 1;
        if (item.progress?.stage === 'revision_requested') stats.revisionRequested += 1;
        if (item.progress?.orderStatus === 'ready') stats.readyToOrder += 1;
        if (item.progress?.orderStatus === 'ordered') stats.ordered += 1;

        const due = new Date(item.dueAt);
        if (!Number.isNaN(due.getTime())) {
            if (due.toDateString() === today.toDateString()) stats.dueToday += 1;
            if (due >= today && due <= weekEnd) stats.dueThisWeek += 1;
        }
    }

    return stats;
}
