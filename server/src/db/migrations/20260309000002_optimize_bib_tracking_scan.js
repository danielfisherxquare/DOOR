export async function up(knex) {
    if (await knex.schema.hasTable('bib_tracking_items')) {
        if (!(await knex.schema.hasColumn('bib_tracking_items', 'latest_status_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('latest_status_at', { useTz: true }).nullable();
            });
        }

        await knex.raw(`
            UPDATE bib_tracking_items
            SET latest_status_at = GREATEST(
                COALESCE(receipt_printed_at, created_at),
                COALESCE(picked_up_at, created_at),
                COALESCE(checked_in_at, created_at),
                COALESCE(finished_at, created_at),
                COALESCE(last_scan_at, created_at),
                created_at
            )
            WHERE latest_status_at IS NULL
        `);

        await knex.raw(`
            CREATE INDEX IF NOT EXISTS bti_scan_lookup_idx
            ON bib_tracking_items (race_id, invalidated_at, qr_token)
        `);
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS bti_status_listing_idx
            ON bib_tracking_items (org_id, race_id, status, id DESC)
        `);
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS bti_latest_status_listing_idx
            ON bib_tracking_items (org_id, race_id, latest_status_at DESC, id DESC)
        `);
    }

    if (await knex.schema.hasTable('bib_tracking_events')) {
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS bte_tracking_item_created_desc_idx
            ON bib_tracking_events (tracking_item_id, created_at DESC)
        `);
        await knex.raw(`
            CREATE INDEX IF NOT EXISTS bte_org_race_created_desc_idx
            ON bib_tracking_events (org_id, race_id, created_at DESC)
        `);
    }

    if (await knex.schema.hasTable('records')) {
        await knex.raw('DROP INDEX IF EXISTS records_search_idx');

        const hasSearchDocument = await knex.schema.hasColumn('records', 'search_document');
        if (!hasSearchDocument) {
            await knex.raw(`
                ALTER TABLE records
                ADD COLUMN search_document tsvector
                GENERATED ALWAYS AS (
                    to_tsvector(
                        'simple',
                        coalesce(name, '') || ' ' || coalesce(id_number, '') || ' ' || coalesce(phone, '')
                    )
                ) STORED
            `);
        }

        await knex.raw(`
            CREATE INDEX IF NOT EXISTS records_search_document_idx
            ON records
            USING gin (search_document)
        `);
    }
}

export async function down(knex) {
    await knex.raw('DROP INDEX IF EXISTS records_search_document_idx');
    await knex.raw('DROP INDEX IF EXISTS bte_org_race_created_desc_idx');
    await knex.raw('DROP INDEX IF EXISTS bte_tracking_item_created_desc_idx');
    await knex.raw('DROP INDEX IF EXISTS bti_latest_status_listing_idx');
    await knex.raw('DROP INDEX IF EXISTS bti_status_listing_idx');
    await knex.raw('DROP INDEX IF EXISTS bti_scan_lookup_idx');
}
