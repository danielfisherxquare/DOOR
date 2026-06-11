import knex from '../../db/knex.js';
import { resolveApprovers } from './approval-resolver.service.js';

const DEFAULT_DESIGN_STEPS = [
    {
        step_order: 1,
        step_key: 'department_owner_review',
        step_name: '部门负责人审批',
        task_type: 'approval',
        resolver_type: 'race_staff_department_role',
        resolver_config_json: {
            roleKey: 'department_owner',
            departmentField: 'requester_department',
        },
        decision_mode: 'single',
        min_approvals: 1,
        reject_behavior: 'reject_instance',
        exclude_requester: true,
    },
    {
        step_order: 2,
        step_key: 'race_director_review',
        step_name: '赛事总监终审',
        task_type: 'approval',
        resolver_type: 'race_staff_role',
        resolver_config_json: {
            roleKey: 'race_director',
        },
        decision_mode: 'single',
        min_approvals: 1,
        reject_behavior: 'reject_instance',
        exclude_requester: true,
    },
    {
        step_order: 3,
        step_key: 'design_lead_assignment',
        step_name: '设计负责人分派',
        task_type: 'assignment',
        resolver_type: 'race_staff_role',
        resolver_config_json: {
            roleKey: 'design_lead',
            moduleKey: 'design_requests',
        },
        decision_mode: 'single',
        min_approvals: 1,
        reject_behavior: 'reject_instance',
        exclude_requester: false,
    },
];

function httpError(status, message) {
    return Object.assign(new Error(message), { status, expose: true });
}

function normalizeActionKey(value) {
    return String(value || 'submit').trim() || 'submit';
}

function normalizeBusinessType(value) {
    return String(value || '').trim();
}

function parseJson(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_err) {
        return fallback;
    }
}

function normalizeRaceIds(value) {
    let raw;
    if (Array.isArray(value)) raw = value;
    else if (typeof value === 'string' && value.includes(',')) raw = value.split(',');
    else if (value === null || value === undefined || value === '') raw = [];
    else raw = [value];
    return [...new Set(raw.map(Number).filter(Boolean))];
}

function looksLikeUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function mapStep(row) {
    if (!row) return null;
    return {
        id: row.id,
        stepOrder: Number(row.step_order),
        stepKey: row.step_key,
        stepName: row.step_name,
        taskType: row.task_type,
        resolverType: row.resolver_type,
        resolverConfig: parseJson(row.resolver_config_json, {}),
        decisionMode: row.decision_mode,
        excludeRequester: row.exclude_requester === true,
    };
}

function mapTask(row) {
    return {
        id: row.id,
        instanceId: row.instance_id,
        stepId: row.step_id,
        assignedUserId: row.assigned_user_id,
        candidateRoleKey: row.candidate_role_key,
        candidateDepartmentScope: row.candidate_department_scope,
        status: row.status,
        decision: row.decision,
        comment: row.comment,
        result: parseJson(row.result_json, {}),
        actedBy: row.acted_by,
        actedAt: row.acted_at,
        createdAt: row.created_at,
        businessType: row.business_type,
        businessId: row.business_id,
        raceId: row.primary_race_id || row.race_id ? Number(row.primary_race_id || row.race_id) : null,
        step: row.step_key
            ? {
                stepKey: row.step_key,
                stepName: row.step_name,
                taskType: row.task_type,
                stepOrder: Number(row.step_order),
            }
            : null,
    };
}

function mapInstance(row, currentStep = null, pendingTasks = []) {
    const businessContext = parseJson(row.business_context_json, {});
    return {
        id: row.id,
        definitionId: row.definition_id,
        orgId: row.org_id,
        raceId: row.primary_race_id || row.race_id ? Number(row.primary_race_id || row.race_id) : null,
        primaryRaceId: row.primary_race_id || row.race_id ? Number(row.primary_race_id || row.race_id) : null,
        raceIds: Array.isArray(businessContext.raceIds) ? businessContext.raceIds.map(Number).filter(Boolean) : [],
        scopeType: row.scope_type || null,
        scopeId: row.scope_id || null,
        businessType: row.business_type,
        businessId: row.business_id,
        actionKey: row.action_key,
        requesterUserId: row.requester_user_id,
        status: row.status,
        currentStepOrder: row.current_step_order === null ? null : Number(row.current_step_order),
        currentStep,
        pendingTasks,
        result: parseJson(row.result_json, {}),
        businessContext,
        blockedReason: row.blocked_reason || null,
        startedAt: row.started_at,
        completedAt: row.completed_at,
    };
}

function resolveAssignedDesignerId(payload = {}) {
    return payload.assignment?.assignedDesignerId
        || payload.assignedDesignerId
        || payload.assignedUserId
        || null;
}

async function withTransaction(trx, fn) {
    if (trx) return fn(trx);
    return knex.transaction(fn);
}

async function writeEvent(trx, instanceId, eventType, actorUserId = null, payload = {}, taskId = null) {
    await trx('approval_events').insert({
        instance_id: instanceId,
        task_id: taskId,
        event_type: eventType,
        actor_user_id: actorUserId,
        payload_json: payload,
    });
}

async function writeDesignHistory(trx, requestId, action, fromStatus, toStatus, comment, actorId) {
    await trx('design_request_reviews').insert({
        request_id: requestId,
        action,
        from_status: fromStatus || null,
        to_status: toStatus,
        comment: comment || null,
        actor_id: actorId || null,
    });
}

function designProgressStageFromStatus(status) {
    if (status === 'approved') return 'assigned';
    if (status === 'in_design') return 'designing';
    if (status === 'design_uploaded') return 'internal_review';
    if (status === 'delivered') return 'delivered';
    return 'intake_review';
}

async function writeDesignProgressEvent(trx, requestId, event) {
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

async function applyDesignRequestOutcome(trx, instanceId, outcome, payload = {}) {
    const instance = await trx('approval_instances').where({ id: instanceId }).first();
    if (!instance || instance.business_type !== 'design_request') return;
    if (!looksLikeUuid(instance.business_id)) return;

    const request = await trx('design_requests').where({ id: instance.business_id }).first();
    if (!request) return;

    const actorId = payload.actorUserId || null;
    const comment = payload.comment || null;
    const updatePayload = {
        updated_by: actorId,
        updated_at: trx.fn.now(),
    };
    let action = outcome;
    let nextStatus = request.status;

    if (outcome === 'needs_info') {
        nextStatus = 'needs_info';
        action = 'needs_info';
        updatePayload.status = nextStatus;
        updatePayload.progress_stage = 'intake_review';
        updatePayload.reviewer_id = actorId;
        updatePayload.review_comment = comment;
    } else if (outcome === 'rejected') {
        nextStatus = 'rejected';
        action = 'reject';
        updatePayload.status = nextStatus;
        updatePayload.progress_stage = 'intake_review';
        updatePayload.reviewer_id = actorId;
        updatePayload.review_comment = comment;
    } else if (outcome === 'approved') {
        nextStatus = 'approved';
        action = 'approve';
        updatePayload.status = nextStatus;
        updatePayload.progress_stage = 'assigned';
        updatePayload.reviewer_id = actorId;
        updatePayload.review_comment = comment;
        updatePayload.approved_at = request.approved_at || trx.fn.now();
    } else if (outcome === 'assigned') {
        nextStatus = 'approved';
        action = 'assign_designer';
        updatePayload.status = nextStatus;
        updatePayload.progress_stage = 'assigned';
        updatePayload.assigned_designer_id = payload.assignedDesignerId || null;
        if (!request.approved_at) updatePayload.approved_at = trx.fn.now();
    } else {
        return;
    }

    await trx('design_requests').where({ id: request.id }).update(updatePayload);
    await writeDesignHistory(trx, request.id, action, request.status, nextStatus, comment, actorId);
    await writeDesignProgressEvent(trx, request.id, {
        eventType: action,
        fromStage: request.progress_stage || designProgressStageFromStatus(request.status),
        toStage: updatePayload.progress_stage,
        revisionNo: Number(request.current_revision_no || 0),
        orderStatus: request.order_status || 'not_ready',
        comment,
        actorId,
        metadata: payload.assignedDesignerId ? { assignedDesignerId: payload.assignedDesignerId } : {},
    });
}

async function ensureDefaultDefinition(trx, businessType, actionKey) {
    if (businessType !== 'design_request' || actionKey !== 'submit') return null;

    let definition = await trx('approval_definitions')
        .where({
            business_type: businessType,
            action_key: actionKey,
            status: 'active',
        })
        .whereNull('org_id')
        .whereNull('race_id')
        .orderBy('version', 'desc')
        .first();
    if (definition) return definition;

    [definition] = await trx('approval_definitions')
        .insert({
            business_type: businessType,
            action_key: actionKey,
            name: '设计需求默认审批流',
            version: 1,
            status: 'active',
            published_at: trx.fn.now(),
        })
        .returning('*');

    await trx('approval_steps').insert(
        DEFAULT_DESIGN_STEPS.map((step) => ({
            definition_id: definition.id,
            ...step,
        })),
    );

    return definition;
}

async function findDefinition(trx, businessType, actionKey) {
    const definition = await trx('approval_definitions')
        .where({
            business_type: businessType,
            action_key: actionKey,
            status: 'active',
        })
        .orderBy([{ column: 'race_id', order: 'desc', nulls: 'last' }, { column: 'version', order: 'desc' }])
        .first();

    return definition || ensureDefaultDefinition(trx, businessType, actionKey);
}

async function getStepByOrder(trx, definitionId, stepOrder) {
    return trx('approval_steps')
        .where({ definition_id: definitionId, step_order: stepOrder })
        .first();
}

async function getNextStep(trx, definitionId, currentStepOrder = 0) {
    return trx('approval_steps')
        .where({ definition_id: definitionId })
        .where('step_order', '>', currentStepOrder || 0)
        .orderBy('step_order', 'asc')
        .first();
}

async function loadPendingTasks(trx, instanceId) {
    const rows = await trx('approval_tasks as at')
        .join('approval_steps as s', 's.id', 'at.step_id')
        .join('approval_instances as ai', 'ai.id', 'at.instance_id')
        .where('at.instance_id', instanceId)
        .where('at.status', 'pending')
        .select(
            'at.*',
            's.step_key',
            's.step_name',
            's.task_type',
            's.step_order',
            'ai.business_type',
            'ai.business_id',
            'ai.race_id',
            'ai.primary_race_id',
        )
        .orderBy('at.created_at', 'asc');
    return rows.map(mapTask);
}

async function loadInstance(trx, instanceId) {
    const row = await trx('approval_instances').where({ id: instanceId }).first();
    if (!row) return null;
    const currentStep = row.current_step_order
        ? mapStep(await getStepByOrder(trx, row.definition_id, row.current_step_order))
        : null;
    return mapInstance(row, currentStep, await loadPendingTasks(trx, instanceId));
}

async function blockInstance(trx, instance, step, blockedReason, actorUserId = null) {
    const [updated] = await trx('approval_instances')
        .where({ id: instance.id })
        .update({
            status: 'blocked',
            current_step_order: step.step_order,
            blocked_reason: blockedReason,
            updated_at: trx.fn.now(),
        })
        .returning('*');
    await writeEvent(trx, instance.id, 'blocked', actorUserId, {
        stepKey: step.step_key,
        reason: blockedReason,
    });
    return loadInstance(trx, updated.id);
}

async function createTasksForStep(trx, instance, step, actorUserId = null) {
    const stepConfig = parseJson(step.resolver_config_json, {});
    const instanceRaceId = instance.primary_race_id || instance.race_id || null;
    if (!instanceRaceId && stepConfig.roleKey === 'race_director') {
        await writeEvent(trx, instance.id, 'step_skipped', actorUserId, {
            stepKey: step.step_key,
            reason: 'organization_scope_without_primary_race',
        });
        const nextStep = await getNextStep(trx, instance.definition_id, step.step_order);
        if (!nextStep) {
            const [updated] = await trx('approval_instances')
                .where({ id: instance.id })
                .update({
                    status: 'approved',
                    completed_at: trx.fn.now(),
                    updated_at: trx.fn.now(),
                })
                .returning('*');
            await writeEvent(trx, instance.id, 'completed', actorUserId, { status: 'approved' });
            return mapInstance(updated);
        }
        return createTasksForStep(trx, instance, nextStep, actorUserId);
    }

    const resolverResult = await resolveApprovers(
        {
            orgId: instance.org_id,
            raceId: instanceRaceId,
            requesterUserId: instance.requester_user_id,
        },
        {
            resolverType: step.resolver_type,
            resolverConfig: parseJson(step.resolver_config_json, {}),
            excludeRequester: step.exclude_requester,
        },
        parseJson(instance.business_snapshot_json, {}),
        trx,
    );

    if (resolverResult.status !== 'ready') {
        return blockInstance(trx, instance, step, resolverResult.reason, actorUserId);
    }

    const taskRows = resolverResult.approvers.map((approver) => ({
        instance_id: instance.id,
        step_id: step.id,
        assigned_user_id: approver.userId,
        candidate_role_key: approver.roleKey,
        candidate_department_scope: approver.departmentScope,
        status: 'pending',
    }));
    const tasks = await trx('approval_tasks').insert(taskRows).returning('*');

    await trx('approval_instances')
        .where({ id: instance.id })
        .update({
            status: 'pending',
            current_step_order: step.step_order,
            blocked_reason: null,
            updated_at: trx.fn.now(),
        });

    for (const task of tasks) {
        await writeEvent(trx, instance.id, 'task_created', actorUserId, {
            stepKey: step.step_key,
            assignedUserId: task.assigned_user_id,
        }, task.id);
    }

    return loadInstance(trx, instance.id);
}

export async function startApproval(context = {}, input = {}, trx = null) {
    return withTransaction(trx, async (db) => {
        const businessType = normalizeBusinessType(input.businessType);
        const actionKey = normalizeActionKey(input.actionKey);
        const rawRaceIds = Array.isArray(input.raceIds)
            ? input.raceIds
            : Array.isArray(context.raceIds)
                ? context.raceIds
                : Array.isArray(input.businessRecord?.raceIds)
                    ? input.businessRecord.raceIds
                    : [];
        const raceIds = rawRaceIds.map(Number).filter(Boolean);
        const rawPrimaryRaceId = input.primaryRaceId
            || input.raceId
            || context.primaryRaceId
            || context.raceId
            || input.businessRecord?.primary_race_id
            || input.businessRecord?.primaryRaceId
            || input.businessRecord?.race_id
            || input.businessRecord?.raceId
            || raceIds[0]
            || null;
        const primaryRaceId = rawPrimaryRaceId ? Number(rawPrimaryRaceId) : null;
        const contextRaceIds = raceIds.length ? raceIds : (primaryRaceId ? [primaryRaceId] : []);
        const orgId = context.orgId || input.businessRecord?.org_id || input.businessRecord?.orgId;
        const requesterUserId = input.requesterUserId || context.requesterUserId || context.userId || null;

        if (!businessType || !input.businessId || !orgId) {
            throw httpError(400, '审批发起参数不完整');
        }

        const existing = await db('approval_instances')
            .where({
                business_type: businessType,
                business_id: String(input.businessId),
                action_key: actionKey,
            })
            .whereIn('status', ['pending', 'blocked'])
            .orderBy('started_at', 'desc')
            .first();
        if (existing) return loadInstance(db, existing.id);

        const definition = await findDefinition(db, businessType, actionKey);
        if (!definition) throw httpError(400, '未配置审批流程');

        const [instance] = await db('approval_instances')
            .insert({
                definition_id: definition.id,
                definition_version: definition.version,
                org_id: orgId,
                race_id: primaryRaceId,
                primary_race_id: primaryRaceId,
                scope_type: primaryRaceId ? 'race' : 'org',
                scope_id: primaryRaceId ? String(primaryRaceId) : null,
                business_type: businessType,
                business_id: String(input.businessId),
                action_key: actionKey,
                requester_user_id: requesterUserId,
                status: 'pending',
                business_snapshot_json: input.businessRecord || {},
                business_context_json: {
                    raceIds: contextRaceIds,
                    primaryRaceId,
                    scopeType: primaryRaceId ? 'race' : 'org',
                },
            })
            .returning('*');

        await writeEvent(db, instance.id, 'started', context.userId || requesterUserId, {
            businessType,
            businessId: String(input.businessId),
            actionKey,
        });

        const firstStep = await getNextStep(db, definition.id, 0);
        if (!firstStep) {
            const [updated] = await db('approval_instances')
                .where({ id: instance.id })
                .update({
                    status: 'approved',
                    completed_at: db.fn.now(),
                    updated_at: db.fn.now(),
                })
                .returning('*');
            await writeEvent(db, instance.id, 'completed', context.userId || requesterUserId, { status: 'approved' });
            return mapInstance(updated);
        }

        return createTasksForStep(db, instance, firstStep, context.userId || requesterUserId);
    });
}

export async function actOnTask(context = {}, taskId, payload = {}, trx = null) {
    return withTransaction(trx, async (db) => {
        const task = await db('approval_tasks as at')
            .join('approval_instances as ai', 'ai.id', 'at.instance_id')
            .join('approval_steps as s', 's.id', 'at.step_id')
            .where('at.id', taskId)
            .select(
                'at.*',
                'ai.id as instance_id',
                'ai.definition_id',
                'ai.org_id',
                'ai.race_id',
                'ai.primary_race_id',
                'ai.business_type',
                'ai.business_id',
                'ai.status as instance_status',
                's.step_order',
                's.step_key',
                's.step_name',
                's.task_type',
            )
            .first();
        if (!task) throw httpError(404, '审批任务不存在');
        if (task.status !== 'pending') throw httpError(409, '审批任务已处理');
        if (task.assigned_user_id && String(task.assigned_user_id) !== String(context.userId || '')) {
            throw httpError(403, '当前用户不是该审批任务处理人');
        }

        const action = String(payload.action || '').trim();
        if (!['approve', 'reject', 'request_changes', 'assign'].includes(action)) {
            throw httpError(400, '审批动作不正确');
        }
        if (task.task_type === 'assignment' && action !== 'assign') {
            throw httpError(400, '分派任务只能执行分派动作');
        }
        if (task.task_type === 'approval' && action === 'assign') {
            throw httpError(400, '审批任务不能执行分派动作');
        }

        const decision = action === 'approve'
            ? 'approved'
            : action === 'assign'
                ? 'assigned'
                : action === 'request_changes'
                    ? 'needs_info'
                    : 'rejected';
        const assignedDesignerId = action === 'assign' ? resolveAssignedDesignerId(payload) : null;
        if (action === 'assign' && !assignedDesignerId) {
            throw httpError(400, '分派任务必须指定设计师');
        }
        const result = action === 'assign'
            ? { assignedDesignerId }
            : {};

        await db('approval_tasks')
            .where({ id: task.id })
            .update({
                status: 'completed',
                decision,
                comment: payload.comment || null,
                result_json: result,
                acted_by: context.userId || null,
                acted_at: db.fn.now(),
                updated_at: db.fn.now(),
            });
        await writeEvent(db, task.instance_id, decision, context.userId || null, {
            stepKey: task.step_key,
            comment: payload.comment || null,
            result,
        }, task.id);

        if (action === 'reject' || action === 'request_changes') {
            const nextStatus = action === 'reject' ? 'rejected' : 'needs_info';
            await db('approval_tasks')
                .where({ instance_id: task.instance_id, step_id: task.step_id, status: 'pending' })
                .update({ status: 'cancelled', updated_at: db.fn.now() });
            await db('approval_instances')
                .where({ id: task.instance_id })
                .update({
                    status: nextStatus,
                    result_json: { comment: payload.comment || null },
                    completed_at: db.fn.now(),
                    updated_at: db.fn.now(),
                });
            await writeEvent(db, task.instance_id, 'completed', context.userId || null, { status: nextStatus });
            await applyDesignRequestOutcome(db, task.instance_id, nextStatus, {
                actorUserId: context.userId || null,
                comment: payload.comment || null,
            });
            return loadInstance(db, task.instance_id);
        }

        await db('approval_tasks')
            .where({ instance_id: task.instance_id, step_id: task.step_id, status: 'pending' })
            .update({ status: 'cancelled', updated_at: db.fn.now() });

        if (action === 'assign') {
            await db('approval_instances')
                .where({ id: task.instance_id })
                .update({
                    status: 'approved',
                    result_json: result,
                    completed_at: db.fn.now(),
                    updated_at: db.fn.now(),
                });
            await writeEvent(db, task.instance_id, 'completed', context.userId || null, { status: 'approved', result });
            await applyDesignRequestOutcome(db, task.instance_id, 'assigned', {
                actorUserId: context.userId || null,
                comment: payload.comment || null,
                assignedDesignerId: result.assignedDesignerId,
            });
            return loadInstance(db, task.instance_id);
        }

        const nextStep = await getNextStep(db, task.definition_id, task.step_order);
        if (!nextStep) {
            await db('approval_instances')
                .where({ id: task.instance_id })
                .update({
                    status: 'approved',
                    completed_at: db.fn.now(),
                    updated_at: db.fn.now(),
                });
            await writeEvent(db, task.instance_id, 'completed', context.userId || null, { status: 'approved' });
            await applyDesignRequestOutcome(db, task.instance_id, 'approved', {
                actorUserId: context.userId || null,
                comment: payload.comment || null,
            });
            return loadInstance(db, task.instance_id);
        }

        const instance = await db('approval_instances').where({ id: task.instance_id }).first();
        if (nextStep.task_type === 'assignment') {
            await applyDesignRequestOutcome(db, task.instance_id, 'approved', {
                actorUserId: context.userId || null,
                comment: payload.comment || null,
            });
        }
        return createTasksForStep(db, instance, nextStep, context.userId || null);
    });
}

export async function getCurrentApprovalForBusiness(_context = {}, input = {}, trx = knex) {
    const row = await trx('approval_instances')
        .where({
            business_type: normalizeBusinessType(input.businessType),
            business_id: String(input.businessId),
        })
        .orderBy('started_at', 'desc')
        .first();
    if (!row) return null;
    return loadInstance(trx, row.id);
}

export async function listMyApprovalTasks(context = {}, filters = {}, trx = knex) {
    const query = trx('approval_tasks as at')
        .join('approval_instances as ai', 'ai.id', 'at.instance_id')
        .join('approval_steps as s', 's.id', 'at.step_id')
        .where('at.assigned_user_id', context.userId)
        .select(
            'at.*',
            'ai.business_type',
            'ai.business_id',
            'ai.race_id',
            'ai.primary_race_id',
            's.step_key',
            's.step_name',
            's.task_type',
            's.step_order',
        )
        .orderBy('at.created_at', 'desc');

    if (filters.status) query.where('at.status', filters.status);
    if (filters.raceId) {
        const raceId = Number(filters.raceId);
        query.where((builder) => {
            builder
                .where('ai.primary_race_id', raceId)
                .orWhere('ai.race_id', raceId)
                .orWhereRaw("ai.business_context_json -> 'raceIds' @> ?::jsonb", [JSON.stringify([raceId])]);
        });
    }
    const raceIds = normalizeRaceIds(filters.raceIds);
    if (!filters.raceId && raceIds.length > 0) {
        query.where((builder) => {
            builder
                .whereIn('ai.primary_race_id', raceIds)
                .orWhereIn('ai.race_id', raceIds)
                .orWhereRaw("ai.business_context_json -> 'raceIds' @> ?::jsonb", [JSON.stringify(raceIds)]);
        });
    }

    const rows = await query;
    return {
        items: rows.map(mapTask),
        total: rows.length,
    };
}
