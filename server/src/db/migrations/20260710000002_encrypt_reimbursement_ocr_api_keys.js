import {
  decryptReimbursementLlmConfig,
  encryptReimbursementLlmConfig,
} from '../../modules/reimbursement/reimbursement-llm-secret.js'

const TABLE = 'reimbursement_user_settings'

export async function up(knex) {
  if (!(await knex.schema.hasTable(TABLE))) return

  const rows = await knex(TABLE).whereNotNull('llm_config').select('user_id', 'llm_config')
  for (const row of rows) {
    await knex(TABLE)
      .where({ user_id: row.user_id })
      .update({ llm_config: encryptReimbursementLlmConfig(row.llm_config, row.user_id) })
  }
}

export async function down(knex) {
  if (!(await knex.schema.hasTable(TABLE))) return

  const rows = await knex(TABLE).whereNotNull('llm_config').select('user_id', 'llm_config')
  for (const row of rows) {
    await knex(TABLE)
      .where({ user_id: row.user_id })
      .update({ llm_config: decryptReimbursementLlmConfig(row.llm_config, row.user_id) })
  }
}
