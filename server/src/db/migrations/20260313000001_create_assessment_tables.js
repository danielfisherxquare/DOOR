export async function up(knex) {
    await knex.schema.createTable('assessment_campaigns', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().unique().references('id').inTable('races').onDelete('CASCADE');
        t.text('name').notNullable();
        t.integer('year').notNullable();
        t.text('status').notNullable().defaultTo('draft');
        t.timestamp('published_at', { useTz: true }).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.index(['org_id', 'year']);
    });

    await knex.raw(`
        ALTER TABLE assessment_campaigns
        ADD CONSTRAINT assessment_campaigns_status_check
        CHECK (status IN ('draft', 'published', 'closed', 'archived'))
    `);

    await knex.schema.createTable('assessment_template_snapshots', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('campaign_id').notNullable().references('id').inTable('assessment_campaigns').onDelete('CASCADE');
        t.integer('version_no').notNullable();
        t.text('title').notNullable();
        t.text('instructions').notNullable().defaultTo('');
        t.jsonb('items_json').notNullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.unique(['campaign_id', 'version_no']);
    });

    await knex.schema.createTable('assessment_members', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('campaign_id').notNullable().references('id').inTable('assessment_campaigns').onDelete('CASCADE');
        t.text('employee_code').notNullable();
        t.text('employee_name').notNullable();
        t.text('position').notNullable();
        t.text('team_name').nullable();
        t.text('department').nullable();
        t.integer('sort_order').notNullable().defaultTo(0);
        t.text('status').notNullable().defaultTo('active');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.unique(['campaign_id', 'employee_code']);
        t.index(['campaign_id', 'sort_order']);
    });

    await knex.raw(`
        ALTER TABLE assessment_members
        ADD CONSTRAINT assessment_members_status_check
        CHECK (status IN ('pending', 'active', 'archived'))
    `);

    await knex.schema.createTable('assessment_invite_codes', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('campaign_id').notNullable().references('id').inTable('assessment_campaigns').onDelete('CASCADE');
        t.text('code_hash').notNullable().unique();
        t.text('status').notNullable().defaultTo('unused');
        t.timestamp('activated_at', { useTz: true }).nullable();
        t.timestamp('last_login_at', { useTz: true }).nullable();
        t.timestamp('completed_at', { useTz: true }).nullable();
        t.text('device_fingerprint_hash').nullable();
        t.uuid('last_member_id').nullable().references('id').inTable('assessment_members').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.index(['campaign_id', 'status']);
    });

    await knex.raw(`
        ALTER TABLE assessment_invite_codes
        ADD CONSTRAINT assessment_invite_codes_status_check
        CHECK (status IN ('unused', 'active', 'completed', 'revoked', 'expired'))
    `);

    await knex.schema.createTable('assessment_sessions', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('campaign_id').notNullable().references('id').inTable('assessment_campaigns').onDelete('CASCADE');
        t.uuid('invite_code_id').notNullable().references('id').inTable('assessment_invite_codes').onDelete('CASCADE');
        t.text('device_fingerprint_hash').nullable();
        t.text('ip_hash').nullable();
        t.text('user_agent_hash').nullable();
        t.text('status').notNullable().defaultTo('active');
        t.timestamp('expires_at', { useTz: true }).notNullable();
        t.timestamp('last_seen_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.index(['invite_code_id', 'status']);
    });

    await knex.raw(`
        ALTER TABLE assessment_sessions
        ADD CONSTRAINT assessment_sessions_status_check
        CHECK (status IN ('active', 'expired', 'revoked'))
    `);

    await knex.schema.createTable('assessment_drafts', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('campaign_id').notNullable().references('id').inTable('assessment_campaigns').onDelete('CASCADE');
        t.uuid('member_id').notNullable().references('id').inTable('assessment_members').onDelete('CASCADE');
        t.uuid('invite_code_id').notNullable().references('id').inTable('assessment_invite_codes').onDelete('CASCADE');
        t.uuid('session_id').notNullable().references('id').inTable('assessment_sessions').onDelete('CASCADE');
        t.binary('payload_ciphertext').notNullable();
        t.text('payload_iv').notNullable();
        t.text('payload_auth_tag').notNullable();
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.unique(['campaign_id', 'member_id', 'invite_code_id']);
        t.index(['campaign_id', 'invite_code_id']);
    });

    await knex.schema.createTable('assessment_submissions', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('campaign_id').notNullable().references('id').inTable('assessment_campaigns').onDelete('CASCADE');
        t.uuid('member_id').notNullable().references('id').inTable('assessment_members').onDelete('CASCADE');
        t.uuid('invite_code_id').notNullable().references('id').inTable('assessment_invite_codes').onDelete('CASCADE');
        t.uuid('session_id').notNullable().references('id').inTable('assessment_sessions').onDelete('CASCADE');
        t.binary('payload_ciphertext').notNullable();
        t.text('payload_iv').notNullable();
        t.text('payload_auth_tag').notNullable();
        t.timestamp('submitted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.unique(['campaign_id', 'member_id', 'invite_code_id']);
        t.index(['campaign_id', 'member_id']);
    });

    await knex.schema.createTable('assessment_member_report_snapshots', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('campaign_id').notNullable().references('id').inTable('assessment_campaigns').onDelete('CASCADE');
        t.uuid('member_id').notNullable().references('id').inTable('assessment_members').onDelete('CASCADE');
        t.integer('submission_count').notNullable().defaultTo(0);
        t.binary('report_ciphertext').notNullable();
        t.text('report_iv').notNullable();
        t.text('report_auth_tag').notNullable();
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.unique(['campaign_id', 'member_id']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('assessment_member_report_snapshots');
    await knex.schema.dropTableIfExists('assessment_submissions');
    await knex.schema.dropTableIfExists('assessment_drafts');
    await knex.schema.dropTableIfExists('assessment_sessions');
    await knex.schema.dropTableIfExists('assessment_invite_codes');
    await knex.schema.dropTableIfExists('assessment_members');
    await knex.schema.dropTableIfExists('assessment_template_snapshots');
    await knex.schema.dropTableIfExists('assessment_campaigns');
}
