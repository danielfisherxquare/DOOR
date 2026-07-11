const INDEX_NAME = 'credential_credentials_org_request_unique';

export async function up(knex) {
    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME}
        ON credential_credentials (org_id, request_id)
        WHERE request_id IS NOT NULL
    `);
}

export async function down(knex) {
    await knex.raw(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
}
