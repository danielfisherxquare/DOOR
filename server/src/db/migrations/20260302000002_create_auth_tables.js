/**
 * Phase 2 — 认证与多租户基础表
 * organizations / users / refresh_tokens
 */

export async function up(knex) {
    // ── organizations ──────────────────────────────────────
    await knex.schema.createTable('organizations', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.text('name').notNullable();
        t.text('slug').unique().notNullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    // ── users ──────────────────────────────────────────────
    await knex.schema.createTable('users', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.text('username').notNullable();
        t.text('email').notNullable();
        t.text('password_hash').notNullable();
        t.text('role').notNullable().defaultTo('admin');
        t.text('avatar').nullable();
        t.boolean('email_verified').notNullable().defaultTo(false);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'username']);
        t.unique(['org_id', 'email']);
        t.index('org_id');
    });

    // ── 约束：role 枚举 ──────────────────────────────────
    await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'admin', 'member'))
  `);

    // ── refresh_tokens ─────────────────────────────────────
    await knex.schema.createTable('refresh_tokens', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.text('token_hash').unique().notNullable();
        t.timestamp('expires_at', { useTz: true }).notNullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index('user_id');
        t.index('expires_at');
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('refresh_tokens');
    await knex.schema.dropTableIfExists('users');
    await knex.schema.dropTableIfExists('organizations');
}
