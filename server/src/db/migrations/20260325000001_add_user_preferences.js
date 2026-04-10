/**
 * 添加用户偏好字段
 * 用于存储超级管理员的机构/赛事选择等偏好设置
 */

export async function up(knex) {
    await knex.schema.alterTable('users', (t) => {
        t.jsonb('preferences').defaultTo('{}').comment('用户偏好设置，如最近选择的机构/赛事');
    });
}

export async function down(knex) {
    await knex.schema.alterTable('users', (t) => {
        t.dropColumn('preferences');
    });
}