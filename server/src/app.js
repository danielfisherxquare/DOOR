import express from 'express';
import cors from 'cors';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import healthRoutes from './modules/health/health.routes.js';
import jobRoutes from './modules/jobs/job.routes.js';

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

// ── 路由 ──────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/jobs', jobRoutes);

// ── 统一错误处理 ────────────────────────────────────────
app.use(errorHandler);

export default app;
