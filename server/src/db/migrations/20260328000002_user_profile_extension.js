/**
 * 用户扩展字段迁移 — 支持个人页面功能
 *
 * 变更清单:
 *   1. avatar_url: 头像URL
 *   2. avatar_for_credential: 证件专用照片URL
 *   3. phone: 联系电话
 *   4. bio: 个人简介
 *   5. skills: 技能标签数组
 *   6. user_preferences: 个人偏好设置（JSONB）
 */

export async function up(knex) {
    await knex.schema.alterTable('users', (t) => {
        // 头像相关
        t.text('avatar_url').nullable();
        t.text('avatar_for_credential').nullable();

        // 个人信息
        t.text('phone').nullable();
        t.text('bio').nullable();
        t.specificType('skills', 'TEXT[]').nullable();

        // 个人偏好设置
        t.jsonb('user_preferences').defaultTo('{}');
    });

    // 将旧的 avatar 字段数据迁移到 avatar_url
    await knex.raw(`
        UPDATE users SET avatar_url = avatar WHERE avatar IS NOT NULL AND avatar_url IS NULL
    `);
}

export async function down(knex) {
    await knex.schema.alterTable('users', (t) => {
        t.dropColumn('avatar_url');
        t.dropColumn('avatar_for_credential');
        t.dropColumn('phone');
        t.dropColumn('bio');
        t.dropColumn('skills');
        t.dropColumn('user_preferences');
    });
}