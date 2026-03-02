import { Router } from 'express';
import * as jobRepo from './job.repository.js';
import { toJobStatusResponse } from './job.mapper.js';

const router = Router();

/**
 * GET /api/jobs/:jobId
 * 返回 JobStatus 结构
 *
 * NOTE: Phase 1 不需要认证中间件。Phase 2 加上 auth 后需要补充 org_id 过滤。
 */
router.get('/:jobId', async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const job = await jobRepo.findById(jobId);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job 不存在',
            });
        }

        res.json({
            success: true,
            data: toJobStatusResponse(job),
        });
    } catch (err) {
        next(err);
    }
});

export default router;
