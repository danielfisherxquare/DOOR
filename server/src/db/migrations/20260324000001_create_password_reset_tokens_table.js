/**
 * Create password_reset_tokens table
 */
export function up(knex) {
    return knex.schema.createTable('password_reset_tokens', (table) => {
        table.increments('id').primary();
        table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('token_hash', 64).notNullable().unique();
        table.timestamp('expires_at').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index('user_id');
        table.index('token_hash');
    });
}

export function down(knex) {
    return knex.schema.dropTableIfExists('password_reset_tokens');
}