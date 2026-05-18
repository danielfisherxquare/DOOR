/**
 * Migration: Create operation_log table for Phase 2 DOOR optimization.
 * Tracks all write operations (INSERT, UPDATE, DELETE, EXPORT, IMPORT, GRANT).
 */
export async function up(knex) {
  await knex.schema.createTable('operation_log', (t) => {
    t.bigIncrements('id');
    t.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    t.uuid('org_id').references('id').inTable('organizations').onDelete('SET NULL');
    t.string('module', 64).notNullable();
    t.string('business_type', 32).notNullable();
    t.string('title', 255).notNullable();
    t.string('operation_ip', 45);
    t.string('request_method', 10);
    t.string('request_url', 512);
    t.jsonb('request_params');
    t.integer('response_code');
    t.text('error_msg');
    t.integer('duration_ms');
    t.string('status', 16).defaultTo('success');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw('CREATE INDEX idx_operation_log_user_id ON operation_log(user_id)');
  await knex.schema.raw('CREATE INDEX idx_operation_log_module ON operation_log(module)');
  await knex.schema.raw('CREATE INDEX idx_operation_log_created_at ON operation_log(created_at DESC)');
  await knex.schema.raw('CREATE INDEX idx_operation_log_business_type ON operation_log(business_type)');
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('operation_log');
}
