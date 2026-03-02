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

const app = express();

// ── 中间件 ──────────────────────────────────────────────
app.use(requestId);
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.CORS_ORIGIN
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}));
app.use(express.json());

// ── 公开路由（无需认证）────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);

// ── 受保护路由（需要认证 + 租户隔离）──────────────────
app.use('/api/jobs', tenantContext, jobRoutes);
app.use('/api/races', raceRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/column-mappings', columnMappingRoutes);

// ── 统一错误处理 ────────────────────────────────────────
app.use(errorHandler);

export default app;
