/**
 * Tools Routes — 公开的工具 API（无需认证）
 */
import { Router } from 'express';
import { downloadApp, getAppInfo } from './tools.controller.js';

const router = Router();

// GET /api/tools/download-app — 下载客户端安装包
router.get('/download-app', downloadApp);

// GET /api/tools/app-info — 获取安装包信息
router.get('/app-info', getAppInfo);

export default router;
