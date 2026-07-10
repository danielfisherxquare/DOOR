import { projectsRepository } from './projects.repository.js';

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  return error;
}

function badRequest(message, code = 'PROJECT_INPUT_INVALID') {
  return httpError(400, message, code);
}

function forbidden() {
  return httpError(403, 'You do not have access to this project', 'PROJECT_ACCESS_DENIED');
}

function notFound(entity = 'Project') {
  return httpError(404, `${entity} not found`, `${entity.toUpperCase()}_NOT_FOUND`);
}

function isSuperAdmin(auth) {
  return auth?.role === 'super_admin';
}

function mapAssignee(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    teamMemberId: row.team_member_id,
    employeeCode: row.employee_code,
    employeeName: row.employee_name,
    position: row.position,
    memberType: row.member_type,
    externalEngagementType: row.external_engagement_type || null,
  };
}

function mapProjectData(payload) {
  return {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.raceId !== undefined ? { race_id: payload.raceId === null ? null : String(payload.raceId) } : {}),
  };
}

function mapTaskData(payload) {
  return {
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.parentId !== undefined ? { parent_id: payload.parentId } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.startDate !== undefined ? { start_date: payload.startDate } : {}),
    ...(payload.endDate !== undefined ? { end_date: payload.endDate } : {}),
    ...(payload.isMilestone !== undefined ? { is_milestone: payload.isMilestone } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    ...(payload.sortOrder !== undefined ? { sort_order: payload.sortOrder } : {}),
    ...(payload.responsibleGroup !== undefined ? { responsible_group: payload.responsibleGroup } : {}),
  };
}

export function createProjectsService(repository = projectsRepository) {
  async function requireProject(auth, projectId) {
    const project = await repository.findProjectById(projectId);
    if (!project) throw notFound('Project');
    if (!isSuperAdmin(auth) && (!auth?.orgId || project.org_id !== auth.orgId)) throw forbidden();
    return project;
  }

  async function requireTask(projectId, taskId) {
    const task = await repository.findTaskById(projectId, taskId);
    if (!task) throw notFound('Task');
    return task;
  }

  async function validateRace(raceId, orgId) {
    if (raceId === null || raceId === undefined) return;
    if (!await repository.findRaceForOrg(raceId, orgId)) {
      throw badRequest('race_id 不属于当前组织', 'PROJECT_RACE_SCOPE_INVALID');
    }
  }

  async function appendAssignees(tasks) {
    if (!tasks.length) return [];
    const rows = await repository.listAssigneesForTasks(tasks.map((task) => task.id));
    const grouped = new Map();
    for (const row of rows) {
      const assignees = grouped.get(row.task_id) || [];
      assignees.push(mapAssignee(row));
      grouped.set(row.task_id, assignees);
    }
    return tasks.map((task) => {
      const assignees = grouped.get(task.id) || [];
      return {
        ...task,
        assignees,
        assignee_summary: assignees
          .map((assignee) => `${assignee.employeeCode} ${assignee.employeeName}`)
          .join(' / '),
      };
    });
  }

  async function validateParent(projectId, taskId, parentId) {
    if (!parentId) return;
    if (parentId === taskId) throw badRequest('任务不能成为自己的父任务');
    let current = await requireTask(projectId, parentId);
    const visited = new Set();
    for (let depth = 0; current; depth += 1) {
      if (depth > 1_000 || visited.has(current.id)) throw badRequest('任务层级存在循环');
      if (current.id === taskId) throw badRequest('父任务不能是当前任务的子任务');
      visited.add(current.id);
      if (!current.parent_id) return;
      current = await requireTask(projectId, current.parent_id);
    }
  }

  function validateDateRange(task) {
    if (task.start_date && task.end_date && new Date(task.start_date) > new Date(task.end_date)) {
      throw badRequest('开始日期不能晚于结束日期');
    }
  }

  return {
    async listProjects(auth, filters) {
      const orgId = isSuperAdmin(auth) ? filters.orgId : auth?.orgId;
      if (!isSuperAdmin(auth) && !orgId) throw forbidden();
      return repository.listProjects({ orgId: orgId || null, raceId: filters.raceId || null });
    },

    getProject(auth, projectId) {
      return requireProject(auth, projectId);
    },

    async createProject(auth, payload) {
      const orgId = isSuperAdmin(auth) ? payload.orgId : auth?.orgId;
      if (!orgId) throw badRequest('org_id is required');
      await validateRace(payload.raceId, orgId);
      return repository.createProject({
        ...mapProjectData(payload),
        org_id: orgId,
        created_by: auth?.userId || null,
      });
    },

    async updateProject(auth, projectId, payload) {
      const project = await requireProject(auth, projectId);
      if (payload.orgId !== undefined && payload.orgId !== project.org_id) {
        throw badRequest('项目组织归属不能通过该接口变更', 'PROJECT_ORG_TRANSFER_UNSUPPORTED');
      }
      await validateRace(payload.raceId, project.org_id);
      const updateData = mapProjectData(payload);
      if (Object.keys(updateData).length === 0) throw badRequest('至少提供一个可更新字段');
      const updated = await repository.updateProject(projectId, updateData);
      if (!updated) throw notFound('Project');
      return updated;
    },

    async deleteProject(auth, projectId) {
      await requireProject(auth, projectId);
      if (!await repository.deleteProject(projectId)) throw notFound('Project');
    },

    async listTasks(auth, projectId) {
      await requireProject(auth, projectId);
      return appendAssignees(await repository.listTasks(projectId));
    },

    async createTask(auth, projectId, payload) {
      await requireProject(auth, projectId);
      await validateParent(projectId, null, payload.parentId);
      validateDateRange({ start_date: payload.startDate, end_date: payload.endDate });
      const task = await repository.createTask({ project_id: projectId, ...mapTaskData(payload) });
      return (await appendAssignees([task]))[0];
    },

    async updateTask(auth, projectId, taskId, payload) {
      await requireProject(auth, projectId);
      const current = await requireTask(projectId, taskId);
      if (payload.parentId !== undefined) await validateParent(projectId, taskId, payload.parentId);
      validateDateRange({
        start_date: payload.startDate !== undefined ? payload.startDate : current.start_date,
        end_date: payload.endDate !== undefined ? payload.endDate : current.end_date,
      });
      const task = await repository.updateTask(projectId, taskId, mapTaskData(payload));
      if (!task) throw notFound('Task');
      return (await appendAssignees([task]))[0];
    },

    async deleteTask(auth, projectId, taskId) {
      await requireProject(auth, projectId);
      if (!await repository.deleteTask(projectId, taskId)) throw notFound('Task');
    },

    async listTeamCandidates(auth, projectId, keyword) {
      const project = await requireProject(auth, projectId);
      const rows = await repository.listTeamCandidates(project.org_id, keyword);
      return rows.map((row) => ({
        id: row.id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        position: row.position,
        department: row.department,
        memberType: row.member_type,
        externalEngagementType: row.external_engagement_type,
        status: row.status,
      }));
    },

    async getTaskAssignees(auth, projectId, taskId) {
      await requireProject(auth, projectId);
      await requireTask(projectId, taskId);
      return (await repository.listTaskAssignees(projectId, taskId)).map(mapAssignee);
    },

    async setTaskAssignees(auth, projectId, taskId, assignees) {
      const project = await requireProject(auth, projectId);
      await requireTask(projectId, taskId);
      const memberIds = assignees.map((assignee) => assignee.teamMemberId);
      const members = await repository.findTeamMembers(project.org_id, memberIds);
      const memberMap = new Map(members.map((member) => [member.id, member]));
      const normalized = assignees.map((assignee, index) => {
        const member = memberMap.get(assignee.teamMemberId);
        if (!member) throw badRequest(`assignees[${index}] team member not found`);
        return {
          source_type: 'team_member',
          team_member_id: member.id,
          employee_code: member.employee_code,
          employee_name: member.employee_name,
          position: assignee.position || member.position || null,
          member_type: member.member_type,
          external_engagement_type: member.external_engagement_type,
        };
      });
      const rows = await repository.replaceTaskAssignees({
        projectId,
        taskId,
        orgId: project.org_id,
        assignees: normalized,
      });
      if (!rows) throw notFound('Task');
      return rows.map(mapAssignee);
    },
  };
}

export const projectsService = createProjectsService();
