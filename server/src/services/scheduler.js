import { Cron } from 'croner';
import knex from '../db/knex.js';
import { executeJob } from './job-executor.js';

class Scheduler {
  constructor() {
    this.jobs = new Map(); // jobId -> Cron instance
  }

  async loadFromDatabase() {
    const activeJobs = await knex('sys_job').where('status', 'running');
    for (const job of activeJobs) {
      this.scheduleJob(job);
    }
    console.log(`[Scheduler] Loaded ${activeJobs.length} active jobs`);
  }

  scheduleJob(job) {
    this.stopJob(job.id);

    try {
      const cron = new Cron(job.cron_expression, { timezone: 'Asia/Shanghai' }, () => {
        this.execute(job);
      });
      this.jobs.set(job.id, cron);
    } catch (err) {
      console.error(`[Scheduler] Invalid cron for job ${job.id}: ${err.message}`);
    }
  }

  stopJob(jobId) {
    const existing = this.jobs.get(jobId);
    if (existing) {
      existing.stop();
      this.jobs.delete(jobId);
    }
  }

  async execute(jobDef) {
    const startTime = new Date();
    const logEntry = {
      job_id: jobDef.id,
      status: 'success',
      start_time: startTime,
    };

    try {
      const result = await executeJob(jobDef.invoke_target);
      logEntry.end_time = new Date();
      logEntry.duration_ms = Date.now() - startTime.getTime();
      logEntry.status = result?.success === false ? 'fail' : 'success';
      logEntry.error_msg = result?.error || null;
    } catch (err) {
      logEntry.end_time = new Date();
      logEntry.duration_ms = Date.now() - startTime.getTime();
      logEntry.status = 'fail';
      logEntry.error_msg = err.message;
    }

    try {
      await knex('sys_job_log').insert(logEntry);
    } catch (err) {
      console.error('[Scheduler] Failed to write job log:', err.message);
    }
  }

  async triggerOnce(jobId) {
    const job = await knex('sys_job').where('id', jobId).first();
    if (!job) throw new Error('Job not found');
    await this.execute(job);
  }

  shutdown() {
    for (const [id, cron] of this.jobs) {
      cron.stop();
    }
    this.jobs.clear();
    console.log('[Scheduler] Shutdown complete');
  }
}

export const scheduler = new Scheduler();
