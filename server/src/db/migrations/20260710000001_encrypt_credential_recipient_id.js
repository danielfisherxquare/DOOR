import {
  decryptCredentialRecipientId,
  encryptCredentialRecipientId,
} from '../../modules/credential/credential-pii.js'

const TABLE = 'credential_issue_logs'
const COLUMN = 'issued_to_id_number'

export async function up(knex) {
  if (!(await knex.schema.hasColumn(TABLE, COLUMN))) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.text(COLUMN).nullable()
    })
  }

  const legacyRows = await knex(TABLE)
    .whereNull(COLUMN)
    .whereNotNull('issued_to_org_name')
    .select('id', 'org_id', 'race_id', 'issued_to_org_name')

  for (const row of legacyRows) {
    await knex(TABLE)
      .where({ id: row.id })
      .update({
        [COLUMN]: encryptCredentialRecipientId(row.issued_to_org_name, {
          orgId: row.org_id,
          raceId: row.race_id,
        }),
        issued_to_org_name: null,
      })
  }
}

export async function down(knex) {
  if (!(await knex.schema.hasColumn(TABLE, COLUMN))) return

  const rows = await knex(TABLE)
    .whereNotNull(COLUMN)
    .select('id', 'org_id', 'race_id', COLUMN)

  for (const row of rows) {
    await knex(TABLE)
      .where({ id: row.id })
      .update({
        issued_to_org_name: decryptCredentialRecipientId(row[COLUMN], {
          orgId: row.org_id,
          raceId: row.race_id,
        }),
      })
  }

  await knex.schema.alterTable(TABLE, (table) => {
    table.dropColumn(COLUMN)
  })
}
