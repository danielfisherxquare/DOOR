import { Router } from 'express';
import * as CalendarController from './calendar.controller.js';

const router = Router();

router.get('/events', CalendarController.getCalendarEvents);

export default router;
