import { Cron } from 'croner';
import knex from '../db/knex.js';
import { executeJob } from './job-executor.js';

export class Scheduler {
  constructor({
    database = knex,
    CronClass = Cron,
    executeJobFn = executeJob,
    getJob,
    writeLog,
  } = {}) {
    this.database = database;
    this.CronClass = CronClass;
    this.executeJobFn = executeJobFn;
    this.getJob = getJob || ((jobId) => database('sys_job').where('id', jobId).first());
    this.writeLog = writeLog || ((entry) => database('sys_job_log').insert(entry));
    this.jobs = new Map(); // jobId -> Cron instance
    this.runningJobs = new Set();
  }

  async loadFromDatabase() {
    const activeJobs = await this.database('sys_job').where('status', 'running');
    for (const job of activeJobs) {
      this.scheduleJob(job);
    }
    console.log(`[Scheduler] Loaded ${activeJobs.length} active jobs`);
  }

  scheduleJob(job) {
    this.stopJob(job.id);

    try {
      const cron = new this.CronClass(job.cron_expression, { timezone: 'Asia/Shanghai' }, () => {
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
    const concurrencyKey = String(jobDef.id);
    const preventOverlap = String(jobDef.concurrent ?? '1') !== '0';
    const logEntry = {
      job_id: jobDef.id,
      status: 'success',
      start_time: startTime,
    };

    if (preventOverlap && this.runningJobs.has(concurrencyKey)) {
      logEntry.end_time = new Date();
      logEntry.duration_ms = 0;
      logEntry.status = 'fail';
      logEntry.error_msg = 'Skipped because a previous execution is still running';
      try {
        await this.writeLog(logEntry);
      } catch (error) {
        console.error('[Scheduler] Failed to write job log:', error.message);
      }
      return { success: false, skipped: true, error: logEntry.error_msg };
    }

    if (preventOverlap) this.runningJobs.add(concurrencyKey);

    try {
      const result = await this.executeJobFn(jobDef.invoke_target);
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
      await this.writeLog(logEntry);
    } catch (err) {
      console.error('[Scheduler] Failed to write job log:', err.message);
    } finally {
      if (preventOverlap) this.runningJobs.delete(concurrencyKey);
    }

    return {
      success: logEntry.status === 'success',
      ...(logEntry.error_msg ? { error: logEntry.error_msg } : {}),
    };
  }

  async triggerOnce(jobId) {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');
    return this.execute(job);
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
