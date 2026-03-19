/**
 * 扩大 lottery_lists 加密字段的列类型
 * ==================================
 *
 * lottery_lists.id_number / phone 最初定义为 varchar(100/50)。
 * 在启用字段级加密后，写入的是密文字符串，长度会显著超过原始明文长度，
 * 导致导入黑白名单时报 `value too long for type character varying(...)`。
 *
 * 本迁移将这两列统一改为 text，兼容现有和后续的加密值。
 */
export async function up(knex) {
    await knex.raw(`
        ALTER TABLE lottery_lists
        ALTER COLUMN id_number TYPE text,
        ALTER COLUMN phone TYPE text;
    `);
}

export async function down(knex) {
    await knex.raw(`
        ALTER TABLE lottery_lists
        ALTER COLUMN id_number TYPE varchar(100),
        ALTER COLUMN phone TYPE varchar(50);
    `);
}
