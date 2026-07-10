import {
  parseAssigneePayload,
  parseCandidateFilters,
  parseProjectFilters,
  parseProjectId,
  parseProjectPayload,
  parseTaskPayload,
} from './projects.schema.js';
import { projectsService } from './projects.service.js';

export async function getProjects(req, res, next) {
  try {
    const data = await projectsService.listProjects(req.authContext, parseProjectFilters(req.query));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getProjectById(req, res, next) {
  try {
    const data = await projectsService.getProject(req.authContext, parseProjectId(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createProject(req, res, next) {
  try {
    const data = await projectsService.createProject(req.authContext, parseProjectPayload(req.body));
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateProject(req, res, next) {
  try {
    const data = await projectsService.updateProject(
      req.authContext,
      parseProjectId(req.params.id),
      parseProjectPayload(req.body, { partial: true }),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteProject(req, res, next) {
  try {
    await projectsService.deleteProject(req.authContext, parseProjectId(req.params.id));
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
}

export async function getTasksByProjectId(req, res, next) {
  try {
    const data = await projectsService.listTasks(
      req.authContext,
      parseProjectId(req.params.projectId),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createTask(req, res, next) {
  try {
    const data = await projectsService.createTask(
      req.authContext,
      parseProjectId(req.params.projectId),
      parseTaskPayload(req.body),
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateTask(req, res, next) {
  try {
    const data = await projectsService.updateTask(
      req.authContext,
      parseProjectId(req.params.projectId),
      parseProjectId(req.params.taskId, 'taskId'),
      parseTaskPayload(req.body, { partial: true }),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteTask(req, res, next) {
  try {
    await projectsService.deleteTask(
      req.authContext,
      parseProjectId(req.params.projectId),
      parseProjectId(req.params.taskId, 'taskId'),
    );
    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
}

export async function getProjectTeamCandidates(req, res, next) {
  try {
    const { keyword } = parseCandidateFilters(req.query);
    const data = await projectsService.listTeamCandidates(
      req.authContext,
      parseProjectId(req.params.projectId),
      keyword,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getTaskAssignees(req, res, next) {
  try {
    const data = await projectsService.getTaskAssignees(
      req.authContext,
      parseProjectId(req.params.projectId),
      parseProjectId(req.params.taskId, 'taskId'),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function setTaskAssignees(req, res, next) {
  try {
    const data = await projectsService.setTaskAssignees(
      req.authContext,
      parseProjectId(req.params.projectId),
      parseProjectId(req.params.taskId, 'taskId'),
      parseAssigneePayload(req.body),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
