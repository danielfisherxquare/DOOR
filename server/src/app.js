import express from 'express';
import cors from 'cors';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/require-auth.js';
import { requireSurfaceAccess } from './middleware/require-surface-access.js';
import { requireModuleAccess } from './middleware/require-module-access.js';
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
import adminReimbursementRoutes from './modules/admin/admin-reimbursement.routes.js';
import ocrRoutes from './modules/ocr/ocr.routes.js';
import credentialRoutes from './modules/credential/credential.routes.js';
import identityCenterRoutes from './modules/identity-center/identity-center.routes.js';
import profileRoutes from './modules/profile/profile.routes.js';
import colorSchemeRoutes from './modules/color-scheme/color-scheme.routes.js';

const app = express();
app.disable('x-powered-by');

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

app.use(requireAuth);

app.use('/api/app/reimbursements', requireSurfaceAccess('app'), requireModuleAccess('app', 'reimbursements'), appReimbursementRoutes);
app.use('/api/app/credentials', requireSurfaceAccess('app'), requireModuleAccess('app', 'credentials'), appCredentialRoutes);
app.use('/api/app/3d-studio', requireSurfaceAccess('app'), requireModuleAccess('app', '3d-studio'), appThreeStudioRoutes);
app.use('/api/app/interviews', requireSurfaceAccess('app'), requireModuleAccess('app', 'interview'), interviewRoutes);
app.use('/api/app/warehouse', requireSurfaceAccess('app'), requireModuleAccess('app', 'inventory'), inventoryRoutes);

app.use('/api/ops/warehouse', requireSurfaceAccess('ops'), requireModuleAccess('ops', 'warehouse'), inventoryRoutes);
app.use('/api/ops/credentials', requireSurfaceAccess('ops'), requireModuleAccess('ops', 'credentials'), credentialRoutes);

app.use('/api/admin/jobs', requireSurfaceAccess('admin'), jobRoutes);
app.use('/api/admin/races', requireSurfaceAccess('admin'), raceRoutes);
app.use('/api/admin/records', requireSurfaceAccess('admin'), recordRoutes);
app.use('/api/admin/column-mappings', requireSurfaceAccess('admin'), columnMappingRoutes);
app.use('/api/admin/import-sessions', requireSurfaceAccess('admin'), importSessionRoutes);
app.use('/api/admin/lottery', requireSurfaceAccess('admin'), lotteryRoutes);
app.use('/api/admin/lottery-v2', requireSurfaceAccess('admin'), lotteryV2Routes);
app.use('/api/admin/audit', requireSurfaceAccess('admin'), auditRoutes);
app.use('/api/admin/clothing', requireSurfaceAccess('admin'), clothingRoutes);
app.use('/api/admin/pipeline', requireSurfaceAccess('admin'), pipelineRoutes);
app.use('/api/admin/bib', requireSurfaceAccess('admin'), bibRoutes);
app.use('/api/admin/assessment', assessmentAdminRoutes);
app.use('/api/admin/system', systemBackupRoutes);
app.use('/api/admin/reimbursements', adminReimbursementRoutes);
app.use('/api/admin/org', requireSurfaceAccess('admin'), orgRoutes);
app.use('/api/admin/org', requireSurfaceAccess('admin'), teamRoutes);
app.use('/api/admin/projects', requireSurfaceAccess('admin'), projectsRoutes);
app.use('/api/admin/calendar', requireSurfaceAccess('admin'), calendarRoutes);
app.use('/api/admin/interviews', requireSurfaceAccess('admin'), interviewRoutes);
app.use('/api/admin/warehouse', requireSurfaceAccess('admin'), requireModuleAccess('admin', 'inventory'), inventoryRoutes);
app.use('/api/admin/ocr', requireSurfaceAccess('admin'), requireModuleAccess('admin', 'finance'), ocrRoutes);
app.use('/api/admin/credentials', requireSurfaceAccess('admin'), requireModuleAccess('admin', 'credentials'), credentialRoutes);
app.use('/api/admin/identity-center', requireSurfaceAccess('admin'), identityCenterRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin/color-schemes', requireSurfaceAccess('admin'), colorSchemeRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

export default app;
