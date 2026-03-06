/**
 * Admin Routes — Super Admin 平台管理 API
 * 所有端点限 super_admin 角色
 */
import { Router } from 'express';
import { requireRoles } from '../../middleware/require-roles.js';
import * as adminService from './admin.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads/apps');

// 确保上传目录存在
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// multer 配置：保存为固定文件名 管理器.exe
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, _file, cb) => cb(null, '管理器.exe'),
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

const router = Router();

// 全部端点限制 super_admin
router.use(requireRoles('super_admin'));

// ── 机构管理 ─────────────────────────────────────────

// GET /api/admin/orgs
router.get('/orgs', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, keyword = '' } = req.query;
        const result = await adminService.listOrgs({ page: Number(page), limit: Number(limit), keyword });
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// POST /api/admin/orgs
router.post('/orgs', async (req, res, next) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: '缺少机构名称' });
        const org = await adminService.createOrg({ name });
        res.status(201).json({ success: true, data: org });
    } catch (err) {
        if (err.code === '23505') {
            err.status = 409; err.message = '机构名称已存在'; err.expose = true;
        }
        next(err);
    }
});

// GET /api/admin/orgs/:orgId
router.get('/orgs/:orgId', async (req, res, next) => {
    try {
        const result = await adminService.getOrgDetail(req.params.orgId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// PATCH /api/admin/orgs/:orgId
router.patch('/orgs/:orgId', async (req, res, next) => {
    try {
        const result = await adminService.updateOrg(req.params.orgId, req.body);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// DELETE /api/admin/orgs/:orgId
router.delete('/orgs/:orgId', async (req, res, next) => {
    try {
        const result = await adminService.deleteOrg(req.params.orgId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// POST /api/admin/orgs/:orgId/admins — 为机构创建管理员
router.post('/orgs/:orgId/admins', async (req, res, next) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: '缺少必填字段' });
        }
        const user = await adminService.createOrgAdmin(req.params.orgId, { username, email, password });
        res.status(201).json({ success: true, data: user });
    } catch (err) {
        if (err.code === '23505') {
            err.status = 409; err.message = '用户名或邮箱已存在'; err.expose = true;
        }
        next(err);
    }
});

// GET /api/admin/orgs/:orgId/race-permissions
router.get('/orgs/:orgId/race-permissions', async (req, res, next) => {
    try {
        const result = await adminService.getOrgRacePermissions(req.params.orgId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// PUT /api/admin/orgs/:orgId/race-permissions
router.put('/orgs/:orgId/race-permissions', async (req, res, next) => {
    try {
        const { permissions } = req.body;
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, message: 'permissions must be an array' });
        }
        const result = await adminService.setOrgRacePermissions(
            req.params.orgId,
            req.authContext.userId,
            permissions,
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// ── 全平台用户管理 ────────────────────────────────────

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, keyword = '', role = '' } = req.query;
        const result = await adminService.listAllUsers({ page: Number(page), limit: Number(limit), keyword, role });
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// PATCH /api/admin/users/:userId
router.patch('/users/:userId', async (req, res, next) => {
    try {
        const result = await adminService.updateUserByAdmin(req.params.userId, req.body);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', async (req, res, next) => {
    try {
        const result = await adminService.deleteUserByAdmin(req.params.userId, req.authContext.userId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// POST /api/admin/users/:userId/reset-password
router.post('/users/:userId/reset-password', async (req, res, next) => {
    try {
        const result = await adminService.resetUserPassword(req.params.userId, req.authContext.userId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// ── 仪表板统计 ───────────────────────────────────────

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res, next) => {
    try {
        const stats = await adminService.getDashboardStats();
        res.json({ success: true, data: stats });
    } catch (err) { next(err); }
});

// ── 应用/客户端管理 ──────────────────────────────────

// POST /api/admin/tools/upload-app — 上传客户端安装包
router.post('/tools/upload-app', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '请选择要上传的文件' });
        }
        const stat = fs.statSync(req.file.path);
        res.json({
            success: true,
            data: {
                filename: req.file.filename,
                size: stat.size,
                updatedAt: stat.mtime.toISOString(),
            },
            message: '安装包上传成功',
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/tools/app-info — 获取当前安装包信息
router.get('/tools/app-info', async (req, res, next) => {
    try {
        const filePath = path.join(UPLOADS_DIR, '管理器.exe');
        if (!fs.existsSync(filePath)) {
            return res.json({
                success: true,
                data: { available: false, filename: '管理器.exe', size: 0, updatedAt: null },
            });
        }
        const stat = fs.statSync(filePath);
        res.json({
            success: true,
            data: {
                available: true,
                filename: '管理器.exe',
                size: stat.size,
                updatedAt: stat.mtime.toISOString(),
            },
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/tools/delete-app — 删除客户端安装包
router.delete('/tools/delete-app', async (req, res, next) => {
    try {
        const filePath = path.join(UPLOADS_DIR, '管理器.exe');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true, message: '安装包已删除' });
    } catch (err) {
        next(err);
    }
});

export default router;
