import express from 'express';
import cors from 'cors';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { tenantContext } from './middleware/tenant-context.js';
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

const app = express();

// ── 中间件 ──────────────────────────────────────────────
app.use(requestId);
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.CORS_ORIGIN
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// ── 公开路由（无需认证）────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);

// ── 受保护路由（需要认证 + 租户隔离）──────────────────
app.use('/api/jobs', tenantContext, jobRoutes);
app.use('/api/races', raceRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/column-mappings', columnMappingRoutes);
app.use('/api/import-sessions', tenantContext, importSessionRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/clothing', clothingRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/bib', bibRoutes);

// ── 统一错误处理 ────────────────────────────────────────
app.use(errorHandler);

export default app;
