import { registerExecutor } from '../../services/job-executor.js';
import knex from '../../db/knex.js';

export function registerBuiltinJobs() {
  // Token cleanup: remove expired refresh tokens
  registerExecutor('token:cleanup', async () => {
    const result = await knex('refresh_tokens')
      .where('expires_at', '<', knex.fn.now())
      .del();
    return { success: true, deleted: result };
  });

  // Log archival: archive operation logs older than 90 days (marks them)
  registerExecutor('log:archive', async () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await knex('operation_log')
      .where('created_at', '<', ninetyDaysAgo)
      .update({ status: 'archived' });
    return { success: true, archived: result };
  });

  console.log('[JobRegistry] Built-in jobs registered');
}
