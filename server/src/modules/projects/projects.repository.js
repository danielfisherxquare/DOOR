import knex from '../../db/knex.js';

export const projectsRepository = {
  async listProjects({ orgId, raceId }) {
    const query = knex('projects').orderBy('created_at', 'desc');
    if (orgId) query.where('org_id', orgId);
    if (raceId) query.where('race_id', String(raceId));
    return query.limit(1_000);
  },

  findProjectById(projectId) {
    return knex('projects').where({ id: projectId }).first();
  },

  findRaceForOrg(raceId, orgId) {
    return knex('races').where({ id: raceId, org_id: orgId }).first('id');
  },

  async createProject(data) {
    const [project] = await knex('projects').insert(data).returning('*');
    return project;
  },

  async updateProject(projectId, data) {
    const [project] = await knex('projects')
      .where({ id: projectId })
      .update({ ...data, updated_at: knex.fn.now() })
      .returning('*');
    return project || null;
  },

  deleteProject(projectId) {
    return knex('projects').where({ id: projectId }).del();
  },

  listTasks(projectId) {
    return knex('project_tasks')
      .where({ project_id: projectId })
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .limit(10_000);
  },

  findTaskById(projectId, taskId) {
    return knex('project_tasks').where({ id: taskId, project_id: projectId }).first();
  },

  async createTask(data) {
    const [task] = await knex('project_tasks').insert(data).returning('*');
    return task;
  },

  async updateTask(projectId, taskId, data) {
    const [task] = await knex('project_tasks')
      .where({ id: taskId, project_id: projectId })
      .update({ ...data, updated_at: knex.fn.now() })
      .returning('*');
    return task || null;
  },

  deleteTask(projectId, taskId) {
    return knex('project_tasks').where({ id: taskId, project_id: projectId }).del();
  },

  listAssigneesForTasks(taskIds) {
    if (taskIds.length === 0) return [];
    return knex('project_task_assignees')
      .whereIn('task_id', taskIds)
      .orderBy([{ column: 'created_at', order: 'asc' }]);
  },

  listTaskAssignees(projectId, taskId) {
    return knex('project_task_assignees as assignee')
      .join('project_tasks as task', 'task.id', 'assignee.task_id')
      .where('task.project_id', projectId)
      .where('task.id', taskId)
      .select('assignee.*')
      .orderBy('assignee.created_at', 'asc');
  },

  findTeamMembers(orgId, memberIds) {
    if (memberIds.length === 0) return [];
    return knex('team_members')
      .where({ org_id: orgId })
      .whereIn('id', memberIds)
      .select('*');
  },

  listTeamCandidates(orgId, keyword) {
    return knex('team_members')
      .where({ org_id: orgId })
      .whereIn('status', ['active', 'inactive'])
      .modify((builder) => {
        if (!keyword) return;
        builder.andWhere(function searchCandidate() {
          this.where('employee_code', 'ilike', `%${keyword}%`)
            .orWhere('employee_name', 'ilike', `%${keyword}%`)
            .orWhere('position', 'ilike', `%${keyword}%`)
            .orWhere('department', 'ilike', `%${keyword}%`);
        });
      })
      .orderBy([
        { column: 'employee_code', order: 'asc' },
        { column: 'employee_name', order: 'asc' },
      ])
      .limit(200);
  },

  async replaceTaskAssignees({ projectId, taskId, orgId, assignees }) {
    return knex.transaction(async (trx) => {
      const scopedTask = await trx('project_tasks as task')
        .join('projects as project', 'project.id', 'task.project_id')
        .where('task.id', taskId)
        .where('task.project_id', projectId)
        .where('project.org_id', orgId)
        .select('task.id')
        .forUpdate()
        .first();
      if (!scopedTask) return null;

      await trx('project_task_assignees').where({ task_id: taskId }).del();
      if (assignees.length > 0) {
        await trx('project_task_assignees').insert(
          assignees.map((assignee) => ({ task_id: taskId, ...assignee })),
        );
      }
      return trx('project_task_assignees')
        .where({ task_id: taskId })
        .orderBy('created_at', 'asc');
    });
  },
};
