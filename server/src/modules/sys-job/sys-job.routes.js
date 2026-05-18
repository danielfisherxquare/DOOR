import express from 'express';
import knex from '../../db/knex.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { scheduler } from '../../services/scheduler.js';

const router = express.Router();

router.use(requirePermission({ surface: 'admin', roles: ['super_admin'] }));

// GET /api/admin/sys-job/list — list all jobs
router.get('/list', async (req, res, next) => {
  try {
    const jobs = await knex('sys_job').orderBy('job_group').orderBy('job_name');
    res.json({ success: true, data: jobs });
  } catch (err) { next(err); }
});

// POST /api/admin/sys-job — create a job
router.post('/', async (req, res, next) => {
  try {
    const { jobName, jobGroup, cronExpression, invokeTarget, concurrent, misfirePolicy, remark } = req.body;
    const [job] = await knex('sys_job')
      .insert({
        job_name: jobName, job_group: jobGroup || 'default',
        cron_expression: cronExpression, invoke_target: invokeTarget,
        concurrent: concurrent || '1', misfire_policy: misfirePolicy || 'skip',
        remark,
      })
      .returning('*');
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
});

// PUT /api/admin/sys-job/:id — update a job
router.put('/:id', async (req, res, next) => {
  try {
    const { jobName, cronExpression, invokeTarget, concurrent, misfirePolicy, remark } = req.body;
    const [job] = await knex('sys_job')
      .where('id', req.params.id)
      .update({
        job_name: jobName, cron_expression: cronExpression,
        invoke_target: invokeTarget, concurrent, misfire_policy: misfirePolicy,
        remark, updated_at: knex.fn.now(),
      })
      .returning('*');
    if (!job) return res.status(404).json({ success: false, message: '任务不存在' });
    // If running, reschedule with new cron
    if (job.status === 'running') scheduler.scheduleJob(job);
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
});

// DELETE /api/admin/sys-job/:id — delete a job
router.delete('/:id', async (req, res, next) => {
  try {
    scheduler.stopJob(parseInt(req.params.id));
    const deleted = await knex('sys_job').where('id', req.params.id).del();
    if (!deleted) return res.status(404).json({ success: false, message: '任务不存在' });
    res.json({ success: true, message: '删除成功' });
  } catch (err) { next(err); }
});

// POST /api/admin/sys-job/:id/start — start a job
router.post('/:id/start', async (req, res, next) => {
  try {
    const job = await knex('sys_job').where('id', req.params.id).first();
    if (!job) return res.status(404).json({ success: false, message: '任务不存在' });
    await knex('sys_job').where('id', req.params.id).update({ status: 'running', updated_at: knex.fn.now() });
    job.status = 'running';
    scheduler.scheduleJob(job);
    res.json({ success: true, message: '任务已启动' });
  } catch (err) { next(err); }
});

// POST /api/admin/sys-job/:id/pause — pause a job
router.post('/:id/pause', async (req, res, next) => {
  try {
    const job = await knex('sys_job').where('id', req.params.id).first();
    if (!job) return res.status(404).json({ success: false, message: '任务不存在' });
    scheduler.stopJob(parseInt(req.params.id));
    await knex('sys_job').where('id', req.params.id).update({ status: 'paused', updated_at: knex.fn.now() });
    res.json({ success: true, message: '任务已暂停' });
  } catch (err) { next(err); }
});

// POST /api/admin/sys-job/:id/run-once — trigger a job manually
router.post('/:id/run-once', async (req, res, next) => {
  try {
    await scheduler.triggerOnce(parseInt(req.params.id));
    res.json({ success: true, message: '任务执行完成' });
  } catch (err) {
    res.status(500).json({ success: false, message: '任务执行失败: ' + err.message });
  }
});

// GET /api/admin/sys-job/:id/logs — get job execution logs
router.get('/:id/logs', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const [countResult] = await knex('sys_job_log').where('job_id', req.params.id).count('id as total');
    const logs = await knex('sys_job_log')
      .where('job_id', req.params.id)
      .orderBy('created_at', 'desc')
      .offset(offset).limit(parseInt(pageSize));
    res.json({ success: true, data: { logs, total: parseInt(countResult.total), page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) { next(err); }
});

// GET /api/admin/sys-job/targets/list — list registered executor targets
router.get('/targets/list', async (req, res, next) => {
  try {
    const { listTargets } = await import('../../services/job-executor.js');
    res.json({ success: true, data: listTargets() });
  } catch (err) { next(err); }
});

export default router;
