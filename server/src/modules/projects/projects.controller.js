import knex from '../../db/knex.js';

function badRequest(message) {
    const error = new Error(message);
    error.status = 400;
    error.expose = true;
    return error;
}

function forbidden(message) {
    const error = new Error(message);
    error.status = 403;
    error.expose = true;
    return error;
}

async function resolveScopedOrgId(req, explicitOrgId) {
    if (req.authContext?.role === 'super_admin') {
        return explicitOrgId || req.query.orgId || null;
    }
    return req.authContext?.orgId || null;
}

async function ensureProjectAccess(req, projectId) {
    const project = await knex('projects').where({ id: projectId }).first();
    if (!project) {
        const error = new Error('Project not found');
        error.status = 404;
        error.expose = true;
        throw error;
    }
    if (req.authContext?.role !== 'super_admin' && project.org_id && project.org_id !== req.authContext?.orgId) {
        throw forbidden('You do not have access to this project');
    }
    return project;
}

async function appendAssignees(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return [];
    const taskIds = tasks.map((task) => task.id);
    const assignees = await knex('project_task_assignees')
        .whereIn('task_id', taskIds)
        .orderBy([{ column: 'created_at', order: 'asc' }]);
    const grouped = new Map();
    for (const row of assignees) {
        const list = grouped.get(row.task_id) || [];
        list.push({
            id: row.id,
            taskId: row.task_id,
            teamMemberId: row.team_member_id,
            employeeCode: row.employee_code,
            employeeName: row.employee_name,
            position: row.position,
            memberType: row.member_type,
            externalEngagementType: row.external_engagement_type || null,
        });
        grouped.set(row.task_id, list);
    }

    return tasks.map((task) => {
        const taskAssignees = grouped.get(task.id) || [];
        return {
            ...task,
            assignees: taskAssignees,
            assignee_summary: taskAssignees.map((item) => `${item.employeeCode} ${item.employeeName}`).join(' / '),
        };
    });
}

async function normalizeAssignees(projectId, assignees) {
    if (!Array.isArray(assignees)) throw badRequest('assignees must be an array');
    const project = await knex('projects').where({ id: projectId }).first('id', 'org_id');
    if (!project) throw badRequest('Project not found');

    const teamMemberIds = assignees.map((item) => item.teamMemberId).filter(Boolean);
    const memberMap = new Map();
    if (teamMemberIds.length > 0) {
        const members = await knex('team_members')
            .where({ org_id: project.org_id })
            .whereIn('id', teamMemberIds)
            .select('*');
        members.forEach((row) => memberMap.set(row.id, row));
    }

    return assignees.map((item, index) => {
        if (item.sourceType !== 'team_member') throw badRequest(`assignees[${index}].sourceType must be team_member`);
        if (!item.teamMemberId) throw badRequest(`assignees[${index}].teamMemberId is required`);
        const member = memberMap.get(item.teamMemberId);
        if (!member) throw badRequest(`assignees[${index}] team member not found`);
        return {
            source_type: 'team_member',
            team_member_id: member.id,
            employee_code: member.employee_code,
            employee_name: member.employee_name,
            position: member.position,
            member_type: member.member_type,
            external_engagement_type: member.external_engagement_type,
        };
    });
}

export async function getProjects(req, res, next) {
    try {
        const scopedOrgId = await resolveScopedOrgId(req, req.query.orgId);
        const { raceId } = req.query;
        let query = knex('projects').orderBy('created_at', 'desc');
        if (scopedOrgId) query = query.where('org_id', scopedOrgId);
        if (raceId) query = query.where('race_id', Number(raceId));
        const projects = await query;
        res.json({ success: true, data: projects });
    } catch (err) {
        next(err);
    }
}

export async function getProjectById(req, res, next) {
    try {
        const project = await ensureProjectAccess(req, req.params.id);
        res.json({ success: true, data: project });
    } catch (err) {
        next(err);
    }
}

export async function createProject(req, res, next) {
    try {
        const { name, description, race_id, org_id } = req.body;
        if (!name) throw badRequest('Project name is required');
        const scopedOrgId = await resolveScopedOrgId(req, org_id);
        if (!scopedOrgId) throw badRequest('org_id is required');

        const [project] = await knex('projects').insert({
            name,
            description: description || null,
            race_id: race_id ? Number(race_id) : null,
            org_id: scopedOrgId,
            created_by: req.authContext?.userId || null,
        }).returning('*');

        res.status(201).json({ success: true, data: project });
    } catch (err) {
        next(err);
    }
}

export async function updateProject(req, res, next) {
    try {
        await ensureProjectAccess(req, req.params.id);
        const { name, description, race_id } = req.body;
        const [project] = await knex('projects')
            .where({ id: req.params.id })
            .update({
                name,
                description: description || null,
                race_id: race_id ? Number(race_id) : null,
                updated_at: knex.fn.now(),
            })
            .returning('*');
        if (!project) {
            const error = new Error('Project not found');
            error.status = 404;
            error.expose = true;
            throw error;
        }
        res.json({ success: true, data: project });
    } catch (err) {
        next(err);
    }
}

export async function deleteProject(req, res, next) {
    try {
        await ensureProjectAccess(req, req.params.id);
        const deleted = await knex('projects').where({ id: req.params.id }).del();
        if (!deleted) {
            const error = new Error('Project not found');
            error.status = 404;
            error.expose = true;
            throw error;
        }
        res.json({ success: true, data: null });
    } catch (err) {
        next(err);
    }
}

export async function getTasksByProjectId(req, res, next) {
    try {
        await ensureProjectAccess(req, req.params.projectId);
        const tasks = await knex('project_tasks')
            .where({ project_id: req.params.projectId })
            .orderBy('sort_order', 'asc')
            .orderBy('created_at', 'asc');
        res.json({ success: true, data: await appendAssignees(tasks) });
    } catch (err) {
        next(err);
    }
}

export async function createTask(req, res, next) {
    try {
        await ensureProjectAccess(req, req.params.projectId);
        const { title, parent_id, status, start_date, end_date, is_milestone, notes, sort_order, responsible_group } = req.body;
        if (!title) throw badRequest('Task title is required');

        const [task] = await knex('project_tasks').insert({
            project_id: req.params.projectId,
            parent_id: parent_id || null,
            title,
            status: status || 'TODO',
            start_date,
            end_date,
            is_milestone: Boolean(is_milestone),
            notes: notes || null,
            sort_order: sort_order || 0,
            responsible_group: responsible_group || null,
        }).returning('*');

        res.status(201).json({ success: true, data: { ...(await appendAssignees([task]))[0] } });
    } catch (err) {
        next(err);
    }
}

export async function updateTask(req, res, next) {
    try {
        await ensureProjectAccess(req, req.params.projectId);
        const { title, parent_id, status, start_date, end_date, is_milestone, notes, sort_order, responsible_group } = req.body;
        const updateData = { updated_at: knex.fn.now() };

        if (title !== undefined) updateData.title = title;
        if (parent_id !== undefined) updateData.parent_id = parent_id || null;
        if (status !== undefined) updateData.status = status;
        if (start_date !== undefined) updateData.start_date = start_date;
        if (end_date !== undefined) updateData.end_date = end_date;
        if (is_milestone !== undefined) updateData.is_milestone = is_milestone;
        if (notes !== undefined) updateData.notes = notes;
        if (sort_order !== undefined) updateData.sort_order = sort_order;
        if (responsible_group !== undefined) updateData.responsible_group = responsible_group || null;

        const [task] = await knex('project_tasks')
            .where({ id: req.params.taskId, project_id: req.params.projectId })
            .update(updateData)
            .returning('*');

        if (!task) {
            const error = new Error('Task not found');
            error.status = 404;
            error.expose = true;
            throw error;
        }
        res.json({ success: true, data: { ...(await appendAssignees([task]))[0] } });
    } catch (err) {
        next(err);
    }
}

export async function deleteTask(req, res, next) {
    try {
        await ensureProjectAccess(req, req.params.projectId);
        const deleted = await knex('project_tasks')
            .where({ id: req.params.taskId, project_id: req.params.projectId })
            .del();
        if (!deleted) {
            const error = new Error('Task not found');
            error.status = 404;
            error.expose = true;
            throw error;
        }
        res.json({ success: true, data: null });
    } catch (err) {
        next(err);
    }
}

export async function getProjectTeamCandidates(req, res, next) {
    try {
        const project = await ensureProjectAccess(req, req.params.projectId);
        const keyword = String(req.query.keyword || '');
        const candidates = await knex('team_members')
            .where({ org_id: project.org_id })
            .whereIn('status', ['active', 'inactive'])
            .modify((builder) => {
                if (!keyword) return;
                builder.andWhere(function () {
                    this.where('employee_code', 'ilike', `%${keyword}%`)
                        .orWhere('employee_name', 'ilike', `%${keyword}%`)
                        .orWhere('position', 'ilike', `%${keyword}%`)
                        .orWhere('department', 'ilike', `%${keyword}%`);
                });
            })
            .orderBy([{ column: 'employee_code', order: 'asc' }, { column: 'employee_name', order: 'asc' }]);

        res.json({
            success: true,
            data: candidates.map((row) => ({
                id: row.id,
                employeeCode: row.employee_code,
                employeeName: row.employee_name,
                position: row.position,
                department: row.department,
                memberType: row.member_type,
                externalEngagementType: row.external_engagement_type,
                status: row.status,
            })),
        });
    } catch (err) {
        next(err);
    }
}

export async function getTaskAssignees(req, res, next) {
    try {
        await ensureProjectAccess(req, req.params.projectId);
        const assignees = await knex('project_task_assignees')
            .where({ task_id: req.params.taskId })
            .orderBy('created_at', 'asc');
        res.json({
            success: true,
            data: assignees.map((row) => ({
                id: row.id,
                taskId: row.task_id,
                teamMemberId: row.team_member_id,
                employeeCode: row.employee_code,
                employeeName: row.employee_name,
                position: row.position,
                memberType: row.member_type,
                externalEngagementType: row.external_engagement_type || null,
            })),
        });
    } catch (err) {
        next(err);
    }
}

export async function setTaskAssignees(req, res, next) {
    try {
        await ensureProjectAccess(req, req.params.projectId);
        const normalized = await normalizeAssignees(req.params.projectId, req.body?.assignees || []);

        await knex.transaction(async (trx) => {
            await trx('project_task_assignees').where({ task_id: req.params.taskId }).del();
            if (normalized.length > 0) {
                await trx('project_task_assignees').insert(
                    normalized.map((row) => ({
                        task_id: req.params.taskId,
                        ...row,
                    })),
                );
            }
        });

        const assignees = await knex('project_task_assignees')
            .where({ task_id: req.params.taskId })
            .orderBy('created_at', 'asc');
        res.json({
            success: true,
            data: assignees.map((row) => ({
                id: row.id,
                taskId: row.task_id,
                teamMemberId: row.team_member_id,
                employeeCode: row.employee_code,
                employeeName: row.employee_name,
                position: row.position,
                memberType: row.member_type,
                externalEngagementType: row.external_engagement_type || null,
            })),
        });
    } catch (err) {
        next(err);
    }
}
