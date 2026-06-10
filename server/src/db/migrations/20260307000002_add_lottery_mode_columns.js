/**
 * 新增 lottery_mode 相关列
 * - races.lottery_mode_default: 赛事级别的默认模式 ('lottery' | 'direct')
 * - race_capacity.lottery_mode_override: 项目级别的模式覆盖 ('inherit' | 'lottery' | 'direct')
 */
export function up(knex) {
    return knex.schema
        .alterTable('races', (table) => {
            table.string('lottery_mode_default', 10).defaultTo('lottery');
        })
        .alterTable('race_capacity', (table) => {
            table.string('lottery_mode_override', 10).defaultTo('inherit');
        });
}

export function down(knex) {
    return knex.schema
        .alterTable('races', (table) => {
            table.dropColumn('lottery_mode_default');
        })
        .alterTable('race_capacity', (table) => {
            table.dropColumn('lottery_mode_override');
        });
}
