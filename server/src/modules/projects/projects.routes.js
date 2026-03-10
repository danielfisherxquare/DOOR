import { Router } from 'express';
import * as ProjectsController from './projects.controller.js';

const router = Router();

// Project routes
router.get('/', ProjectsController.getProjects);
router.get('/:id', ProjectsController.getProjectById);
router.post('/', ProjectsController.createProject);
router.put('/:id', ProjectsController.updateProject);
router.delete('/:id', ProjectsController.deleteProject);

// Project Task routes
router.get('/:projectId/tasks', ProjectsController.getTasksByProjectId);
router.post('/:projectId/tasks', ProjectsController.createTask);
router.put('/:projectId/tasks/:taskId', ProjectsController.updateTask);
router.delete('/:projectId/tasks/:taskId', ProjectsController.deleteTask);

export default router;
