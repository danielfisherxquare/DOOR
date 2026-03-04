import { Router } from 'express';
import * as jobRepo from './job.repository.js';
import { toJobStatusResponse } from './job.mapper.js';

const router = Router();

/**
 * GET /api/jobs/:jobId
 * 返回 JobStatus 结构（租户隔离）
 */
router.get('/:jobId', async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const job = await jobRepo.findByOrgAndId(req.authContext.orgId, jobId);

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
