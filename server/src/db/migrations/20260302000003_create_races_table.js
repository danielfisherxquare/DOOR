/**
 * Phase 2 — 赛事表
 * 字段与前端 Race 接口 1:1 对齐
 */

export async function up(knex) {
    await knex.schema.createTable('races', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.text('name').notNullable();
        t.text('date').notNullable();                         // 保留 text 兼容模糊日期
        t.text('location').notNullable().defaultTo('');
        t.jsonb('events').nullable();                          // RaceEvent[] JSON
        t.text('conflict_rule').defaultTo('strict');
        t.float('location_lat').nullable();
        t.float('location_lng').nullable();
        t.text('route_data').nullable();                       // GeoJSON
        t.text('map_features_data').nullable();                // 地图要素 JSON
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index('org_id');
    });

    await knex.raw(`
    ALTER TABLE races
    ADD CONSTRAINT races_conflict_rule_check
    CHECK (conflict_rule IN ('strict', 'permissive'))
  `);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('races');
}
