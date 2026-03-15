/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = function(knex) {
    return knex.schema.alterTable('assessment_invite_codes', (table) => {
        table.text('plain_code_ciphertext').nullable().comment('邀请码明文（加密存储）');
        table.text('plain_code_iv').nullable().comment('加密 IV');
        table.text('plain_code_auth_tag').nullable().comment('加密认证标签');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = function(knex) {
    return knex.schema.alterTable('assessment_invite_codes', (table) => {
        table.dropColumn('plain_code_ciphertext');
        table.dropColumn('plain_code_iv');
        table.dropColumn('plain_code_auth_tag');
    });
};
