import express from 'express';
import cors from 'cors';
import knex from './db/knex.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/require-auth.js';
import { requirePermission } from './middleware/require-permission.js';
import healthRoutes from './modules/health/health.routes.js';
import jobRoutes from './modules/jobs/job.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import raceRoutes from './modules/races/race.routes.js';
import recordRoutes from './modules/records/record.routes.js';
import columnMappingRoutes from './modules/column-mappings/column-mapping.routes.js';
import importSessionRoutes from './modules/import-sessions/import-session.routes.js';
import lotteryRoutes from './modules/lottery/lottery.routes.js';
import lotteryV2Routes from './modules/lottery-v2/lottery-v2.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import clothingRoutes from './modules/clothing/clothing.routes.js';
import pipelineRoutes from './modules/pipeline/pipeline-config.routes.js';
import bibRoutes from './modules/bib/bib.routes.js';
import bibTrackingRoutes from './modules/races/bib-tracking/bib-tracking.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import orgRoutes from './modules/org/org.routes.js';
import teamRoutes from './modules/team/team.routes.js';
import toolsRoutes from './modules/tools/tools.routes.js';
import projectsRoutes from './modules/projects/projects.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import interviewRoutes from './modules/interview/interview.routes.js';
import assessmentPublicRoutes from './modules/assessment/assessment-public.routes.js';
import assessmentAdminRoutes from './modules/assessment/assessment-admin.routes.js';
import systemBackupRoutes from './modules/system-backups/system-backup.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import publicDownloadRoutes from './modules/public/public-download.routes.js';
import appReimbursementRoutes from './modules/app/app-reimbursement.routes.js';
import appCredentialRoutes from './modules/app/app-credential.routes.js';
import appThreeStudioRoutes from './modules/app/app-3d-studio.routes.js';
import { createDesignRequestRoutes } from './modules/design-requests/design-request.routes.js';
import adminReimbursementRoutes from './modules/admin/admin-reimbursement.routes.js';
import ocrRoutes from './modules/ocr/ocr.routes.js';
import credentialRoutes from './modules/credential/credential.routes.js';
import identityCenterRoutes from './modules/identity-center/identity-center.routes.js';
import approvalRoutes from './modules/approvals/approval.routes.js';
import profileRoutes from './modules/profile/profile.routes.js';
import colorSchemeRoutes from './modules/color-scheme/color-scheme.routes.js';
import operationLogRoutes from './modules/operation-log/operation-log.routes.js';
import sysJobRoutes from './modules/sys-job/sys-job.routes.js';
import { publicRoutes as dictPublicRoutes, adminRoutes as dictAdminRoutes } from './modules/dictionary/dictionary.routes.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './docs/swagger.js';

const app = express();
app.disable('x-powered-by');
app.locals.knex = knex;

function getCorsOrigin() {
    const cloudOrigins = ['http://47.251.107.41', 'http://www.xquareliu.com', 'http://xquareliu.com'];

    if (process.env.NODE_ENV !== 'production') {
        // Keep local dev origins and allow cloud endpoints for remote testing.
        // Note: localhost and 127.0.0.1 are different origins in CORS
        return [
            'http://localhost:5173', 'http://127.0.0.1:5173',
            'http://localhost:5174', 'http://127.0.0.1:5174',
            'http://localhost:3000', 'http://127.0.0.1:3000',
            'http://localhost', 'http://127.0.0.1',
            /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
            /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
            /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/,
            ...cloudOrigins
        ];
    }

    // Production supports comma-separated origins: "https://a.com,https://b.com"
    const raw = process.env.CORS_ORIGIN;
    if (!raw) return false;

    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return false;
    return list.length === 1 ? list[0] : list;
}

app.use(requestId);
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // 扫码仅需同源摄像头权限，其余高风险能力保持关闭。
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
});
app.use(cors({
    origin: getCorsOrigin(),
    credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/public/tools', toolsRoutes);
app.use('/api/public/downloads', publicDownloadRoutes);
app.use('/api/public/assessment', assessmentPublicRoutes);
app.use('/api/public/dict', dictPublicRoutes);

// API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ArcSpro API Documentation',
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.use(requireAuth);

const appEventsPermission = requirePermission({ surface: 'app', module: { surface: 'app', moduleId: 'events' } });

app.use('/api/app/jobs', requirePermission({ surface: 'app' }), jobRoutes);
app.use('/api/app/records', appEventsPermission, recordRoutes);
app.use('/api/app/column-mappings', appEventsPermission, columnMappingRoutes);
app.use('/api/app/import-sessions', appEventsPermission, importSessionRoutes);
app.use('/api/app/lottery', appEventsPermission, lotteryRoutes);
app.use('/api/app/lottery-v2', appEventsPermission, lotteryV2Routes);
app.use('/api/app/clothing', appEventsPermission, clothingRoutes);
app.use('/api/app/pipeline', appEventsPermission, pipelineRoutes);
app.use('/api/app/bib', appEventsPermission, bibRoutes);
app.use('/api/app/bibs', appEventsPermission, bibTrackingRoutes);
app.use('/api/app/reimbursements', requirePermission({ surface: 'app', module: { surface: 'app', moduleId: 'reimbursements' } }), appReimbursementRoutes);
app.use('/api/app/credentials', requirePermission({ surface: 'app', module: { surface: 'app', moduleId: 'credentials' } }), appCredentialRoutes);
app.use('/api/app/3d-studio', requirePermission({ surface: 'app', module: { surface: 'app', moduleId: '3d-studio' } }), appThreeStudioRoutes);
app.use('/api/app/interviews', requirePermission({ surface: 'app', module: { surface: 'app', moduleId: 'interview' } }), interviewRoutes);
app.use('/api/app/warehouse', requirePermission({ surface: 'app', module: { surface: 'app', moduleId: 'inventory' } }), inventoryRoutes);
app.use('/api/app/design-requests', requirePermission({ surface: 'app', module: { surface: 'app', moduleId: 'design-requests' } }), createDesignRequestRoutes('app'));
app.use('/api/app/approvals', requirePermission({ surface: 'app' }), approvalRoutes);

app.use('/api/ops/warehouse', requirePermission({ surface: 'ops', module: { surface: 'ops', moduleId: 'warehouse' } }), inventoryRoutes);
app.use('/api/ops/credentials', requirePermission({ surface: 'ops', module: { surface: 'ops', moduleId: 'credentials' } }), credentialRoutes);
app.use('/api/ops/bibs', requirePermission({ surface: 'ops' }), bibTrackingRoutes);
app.use('/api/ops/design-requests', requirePermission({ surface: 'ops', module: { surface: 'ops', moduleId: 'design-requests' } }), createDesignRequestRoutes('ops'));

app.use('/api/admin/jobs', requirePermission({ surface: 'admin' }), jobRoutes);
app.use('/api/admin/design-requests', requirePermission({ surface: 'admin' }), createDesignRequestRoutes('admin'));
app.use('/api/admin/approvals', requirePermission({ surface: 'admin' }), approvalRoutes);
app.use('/api/admin/races', requirePermission({ surface: 'admin' }), raceRoutes);
app.use('/api/admin/records', requirePermission({ surface: 'admin' }), recordRoutes);
app.use('/api/admin/column-mappings', requirePermission({ surface: 'admin' }), columnMappingRoutes);
app.use('/api/admin/import-sessions', requirePermission({ surface: 'admin' }), importSessionRoutes);
app.use('/api/admin/lottery', requirePermission({ surface: 'admin' }), lotteryRoutes);
app.use('/api/admin/lottery-v2', requirePermission({ surface: 'admin' }), lotteryV2Routes);
app.use('/api/admin/audit', requirePermission({ surface: 'admin' }), auditRoutes);
app.use('/api/admin/clothing', requirePermission({ surface: 'admin' }), clothingRoutes);
app.use('/api/admin/pipeline', requirePermission({ surface: 'admin' }), pipelineRoutes);
app.use('/api/admin/bib', requirePermission({ surface: 'admin' }), bibRoutes);
app.use('/api/admin/bibs', requirePermission({ surface: 'admin' }), bibTrackingRoutes);
app.use('/api/admin/assessment', requirePermission({ surface: 'admin' }), assessmentAdminRoutes);
app.use('/api/admin/system', requirePermission({ surface: 'admin' }), systemBackupRoutes);
app.use('/api/admin/reimbursements', requirePermission({ surface: 'admin' }), adminReimbursementRoutes);
app.use('/api/admin/org', requirePermission({ surface: 'admin' }), orgRoutes);
// Team routes are also accessible under /api/admin/org for frontend compatibility
app.use('/api/admin/org', requirePermission({ surface: 'admin' }), teamRoutes);
app.use('/api/admin/team', requirePermission({ surface: 'admin' }), teamRoutes);
app.use('/api/admin/projects', requirePermission({ surface: 'admin' }), projectsRoutes);
app.use('/api/admin/calendar', requirePermission({ surface: 'admin' }), calendarRoutes);
app.use('/api/admin/interviews', requirePermission({ surface: 'admin' }), interviewRoutes);
app.use('/api/admin/warehouse', requirePermission({ surface: 'admin', module: { surface: 'admin', moduleId: 'inventory' } }), inventoryRoutes);
app.use('/api/admin/ocr', requirePermission({ surface: 'admin', module: { surface: 'admin', moduleId: 'finance' } }), ocrRoutes);
app.use('/api/admin/credentials', requirePermission({ surface: 'admin', module: { surface: 'admin', moduleId: 'credentials' } }), credentialRoutes);
app.use('/api/admin/identity-center', requirePermission({ surface: 'admin' }), identityCenterRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin/color-schemes', requirePermission({ surface: 'admin' }), colorSchemeRoutes);
app.use('/api/admin/dict', requirePermission({ surface: 'admin' }), dictAdminRoutes);
app.use('/api/admin/operation-logs', requirePermission({ surface: 'admin' }), operationLogRoutes);
app.use('/api/admin/sys-job', requirePermission({ surface: 'admin' }), sysJobRoutes);
app.use('/api/admin', adminRoutes);

// Deny-by-default: any /api/* route not explicitly mounted returns 404
app.use('/api/*', (_req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

app.use(errorHandler);

export default app;
