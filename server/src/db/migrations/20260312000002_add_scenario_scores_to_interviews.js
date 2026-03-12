export async function up(knex) {
    if (!(await knex.schema.hasTable('interviews'))) {
        return;
    }

    if (!(await knex.schema.hasColumn('interviews', 'scenario_scores'))) {
        await knex.schema.alterTable('interviews', (t) => {
            t.jsonb('scenario_scores').notNullable().defaultTo('[0,0,0,0]');
        });
    }

    await knex('interviews')
        .whereNull('scenario_scores')
        .update({ scenario_scores: JSON.stringify([0, 0, 0, 0]) });
}

export async function down(knex) {
    if (await knex.schema.hasTable('interviews') && await knex.schema.hasColumn('interviews', 'scenario_scores')) {
        await knex.schema.alterTable('interviews', (t) => {
            t.dropColumn('scenario_scores');
        });
    }
}
