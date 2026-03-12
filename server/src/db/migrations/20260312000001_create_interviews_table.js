/**
 * 面试记录表 - 存储平面设计师面试评分数据
 */

export async function up(knex) {
    await knex.schema.createTable('interviews', (t) => {
        t.bigIncrements('id').primary();
        t.text('candidate_name').notNullable();
        t.date('interview_date').notNullable();
        t.text('interviewer').nullable();
        t.jsonb('scores').notNullable().defaultTo('[]');
        t.integer('total_score').notNullable().defaultTo(0);
        t.text('tier').notNullable().defaultTo('?');
        t.text('notes').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    await knex.raw(`
        ALTER TABLE interviews
        ADD CONSTRAINT interviews_tier_check
        CHECK (tier IN ('?', 'S', 'A', 'B', 'C'))
    `);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('interviews');
}