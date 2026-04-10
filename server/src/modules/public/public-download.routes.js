import { Router } from 'express';
import { downloadApp, getAppInfo } from '../tools/tools.controller.js';

const router = Router();

router.get('/app', downloadApp);
router.get('/app-info', getAppInfo);

export default router;
