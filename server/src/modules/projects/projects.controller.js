import knex from '../../db/knex.js';

// ---- Projects ----
export async function getProjects(req, res, next) {
    try {
        const { raceId } = req.query;
        let query = knex('projects').orderBy('created_at', 'desc');
        if (raceId) {
            query = query.where('race_id', raceId);
        }
        const projects = await query;
        res.json({ success: true, data: projects });
    } catch (err) {
        next(err);
    }
}

export async function getProjectById(req, res, next) {
    try {
        const project = await knex('projects').where({ id: req.params.id }).first();
        if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
        res.json({ success: true, data: project });
    } catch (err) {
        next(err);
    }
}

export async function createProject(req, res, next) {
    try {
        const { name, description, race_id } = req.body;
        if (!name) return res.status(400).json({ success: false, message: '名称是必填项' });

        const [project] = await knex('projects').insert({
            name,
            description,
            race_id: race_id || null
        }).returning('*');
        res.status(201).json({ success: true, data: project });
    } catch (err) {
        next(err);
    }
}

export async function updateProject(req, res, next) {
    try {
        const { name, description, race_id } = req.body;
        const [project] = await knex('projects')
            .where({ id: req.params.id })
            .update({ name, description, race_id: race_id || null, updated_at: knex.fn.now() })
            .returning('*');
        if (!project) return res.status(404).json({ success: false, message: '项目未找到' });
        res.json({ success: true, data: project });
    } catch (err) {
        next(err);
    }
}

export async function deleteProject(req, res, next) {
    try {
        const deleted = await knex('projects').where({ id: req.params.id }).del();
        if (!deleted) return res.status(404).json({ success: false, message: '项目未找到' });
        res.json({ success: true, data: null });
    } catch (err) {
        next(err);
    }
}

// ---- Project Tasks ----
export async function getTasksByProjectId(req, res, next) {
    try {
        const tasks = await knex('project_tasks')
            .where({ project_id: req.params.projectId })
            .orderBy('sort_order', 'asc')
            .orderBy('created_at', 'asc');
        res.json({ success: true, data: tasks });
    } catch (err) {
        next(err);
    }
}

export async function createTask(req, res, next) {
    try {
        const { title, parent_id, status, start_date, end_date, is_milestone, notes, sort_order } = req.body;
        const project_id = req.params.projectId;
        if (!title) return res.status(400).json({ success: false, message: '标题是必填项' });

        const [task] = await knex('project_tasks').insert({
            project_id,
            parent_id: parent_id || null,
            title,
            status: status || 'TODO',
            start_date,
            end_date,
            is_milestone: is_milestone || false,
            notes,
            sort_order: sort_order || 0
        }).returning('*');
        res.status(201).json({ success: true, data: task });
    } catch (err) {
        next(err);
    }
}

export async function updateTask(req, res, next) {
    try {
        const { title, parent_id, status, start_date, end_date, is_milestone, notes, sort_order } = req.body;
        const updateData = { updated_at: knex.fn.now() };

        if (title !== undefined) updateData.title = title;
        if (parent_id !== undefined) updateData.parent_id = parent_id || null;
        if (status !== undefined) updateData.status = status;
        if (start_date !== undefined) updateData.start_date = start_date;
        if (end_date !== undefined) updateData.end_date = end_date;
        if (is_milestone !== undefined) updateData.is_milestone = is_milestone;
        if (notes !== undefined) updateData.notes = notes;
        if (sort_order !== undefined) updateData.sort_order = sort_order;

        const [task] = await knex('project_tasks')
            .where({ id: req.params.taskId, project_id: req.params.projectId })
            .update(updateData)
            .returning('*');

        if (!task) return res.status(404).json({ success: false, message: '任务未找到' });
        res.json({ success: true, data: task });
    } catch (err) {
        next(err);
    }
}

export async function deleteTask(req, res, next) {
    try {
        const deleted = await knex('project_tasks')
            .where({ id: req.params.taskId, project_id: req.params.projectId })
            .del();
        if (!deleted) return res.status(404).json({ success: false, message: '任务未找到' });
        res.json({ success: true, data: null });
    } catch (err) {
        next(err);
    }
}
