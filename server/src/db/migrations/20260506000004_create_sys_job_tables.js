/**
 * Migration: Create sys_job and sys_job_log tables for Phase 4 DOOR optimization.
 * Provides scheduled task management (cron-based job scheduling).
 */
export async function up(knex) {
  await knex.schema.createTable('sys_job', (t) => {
    t.bigIncrements('id');
    t.string('job_name', 200).notNullable();
    t.string('job_group', 100).defaultTo('default');
    t.string('cron_expression', 100).notNullable();
    t.string('invoke_target', 500).notNullable();
    t.string('status', 10).defaultTo('paused');
    t.string('concurrent', 1).defaultTo('1');
    t.string('misfire_policy', 20).defaultTo('skip');
    t.string('remark', 500);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('sys_job_log', (t) => {
    t.bigIncrements('id');
    t.bigInteger('job_id').references('id').inTable('sys_job').onDelete('CASCADE');
    t.string('status', 10).notNullable();
    t.timestamp('start_time', { useTz: true }).notNullable();
    t.timestamp('end_time', { useTz: true });
    t.integer('duration_ms');
    t.text('error_msg');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw('CREATE INDEX idx_job_log_job_id ON sys_job_log(job_id)');
  await knex.schema.raw('CREATE INDEX idx_job_log_created_at ON sys_job_log(created_at DESC)');
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('sys_job_log');
  await knex.schema.dropTableIfExists('sys_job');
}
