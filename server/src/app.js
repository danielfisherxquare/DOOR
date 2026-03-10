import express from 'express';
import cors from 'cors';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/require-auth.js';
import healthRoutes from './modules/health/health.routes.js';
import jobRoutes from './modules/jobs/job.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import raceRoutes from './modules/races/race.routes.js';
import recordRoutes from './modules/records/record.routes.js';
import columnMappingRoutes from './modules/column-mappings/column-mapping.routes.js';
import importSessionRoutes from './modules/import-sessions/import-session.routes.js';
import lotteryRoutes from './modules/lottery/lottery.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import clothingRoutes from './modules/clothing/clothing.routes.js';
import pipelineRoutes from './modules/pipeline/pipeline-config.routes.js';
import bibRoutes from './modules/bib/bib.routes.js';
import bibTrackingRoutes from './modules/bib-tracking/bib-tracking.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import orgRoutes from './modules/org/org.routes.js';
import toolsRoutes from './modules/tools/tools.routes.js';
import projectsRoutes from './modules/projects/projects.routes.js';
import calendarRoutes from './modules/calendar/calendar.routes.js';
import llmRoutes from './modules/llm/llm.routes.js';

const app = express();

function getCorsOrigin() {
    const cloudOrigins = ['http://47.251.107.41', 'http://www.xquareliu.com', 'http://xquareliu.com'];

    if (process.env.NODE_ENV !== 'production') {
        // Keep local dev origins and allow cloud endpoints for remote testing.
        return ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', ...cloudOrigins];
    }

    // Production supports comma-separated origins: "https://a.com,https://b.com"
    const raw = process.env.CORS_ORIGIN;
    if (!raw) return cloudOrigins;

    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return cloudOrigins;
    return list.length === 1 ? list[0] : list;
}

app.use(requestId);
app.use(cors({
    origin: getCorsOrigin(),
    credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolsRoutes);

app.use(requireAuth);

app.use('/api/jobs', jobRoutes);
app.use('/api/races', raceRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/column-mappings', columnMappingRoutes);
app.use('/api/import-sessions', importSessionRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/clothing', clothingRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/bib', bibRoutes);
app.use('/api/bib-tracking', bibTrackingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/llm', llmRoutes);

app.use(errorHandler);

export default app;
