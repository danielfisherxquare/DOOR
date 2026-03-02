/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
    await knex.schema.createTable('jobs', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('org_id').notNullable();
        t.bigInteger('race_id').nullable();
        t.text('type').notNullable();
        t.text('status').notNullable().defaultTo('queued')
            .checkIn(['queued', 'running', 'succeeded', 'failed']);
        t.integer('progress').notNullable().defaultTo(0)
            .checkBetween([0, 100]);
        t.text('message').nullable();
        t.jsonb('payload').notNullable().defaultTo('{}');
        t.jsonb('result').nullable();
        t.jsonb('error').nullable();
        t.text('idempotency_key').notNullable();
        t.integer('attempt_count').notNullable().defaultTo(0);
        t.integer('max_attempts').notNullable().defaultTo(1);
        t.text('lease_owner').nullable();
        t.timestamp('lease_expires_at', { useTz: true }).nullable();
        t.uuid('created_by').notNullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('started_at', { useTz: true }).nullable();
        t.timestamp('finished_at', { useTz: true }).nullable();

        // 唯一约束：同组织 + 同类型 + 同幂等键 不可重复
        t.unique(['org_id', 'type', 'idempotency_key']);
    });

    // 部分索引：加速 queued Job 查询
    await knex.raw(`
    CREATE INDEX idx_jobs_queued
      ON jobs (status, lease_expires_at)
      WHERE status = 'queued'
  `);

    // 部分索引：加速 running Job 过期检查
    await knex.raw(`
    CREATE INDEX idx_jobs_running
      ON jobs (status, lease_expires_at)
      WHERE status = 'running'
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
    await knex.schema.dropTableIfExists('jobs');
}
