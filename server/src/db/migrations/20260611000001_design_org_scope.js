async function addColumnIfMissing(knex, tableName, columnName, addColumn) {
    const exists = await knex.schema.hasColumn(tableName, columnName);
    if (!exists) {
        await knex.schema.alterTable(tableName, (table) => addColumn(table));
    }
}

async function dropNotNullIfExists(knex, tableName, columnName) {
    const exists = await knex.schema.hasColumn(tableName, columnName);
    if (exists) {
        await knex.raw('ALTER TABLE ?? ALTER COLUMN ?? DROP NOT NULL', [tableName, columnName]);
    }
}

function sql(lines) {
    return lines.join('\n');
}

export async function up(knex) {
    const hasDesignRequests = await knex.schema.hasTable('design_requests');
    if (hasDesignRequests) {
        await addColumnIfMissing(knex, 'design_requests', 'primary_race_id', (table) => {
            table.bigInteger('primary_race_id').nullable().references('id').inTable('races').onDelete('SET NULL');
        });
        await knex.raw('UPDATE design_requests SET primary_race_id = race_id WHERE primary_race_id IS NULL AND race_id IS NOT NULL');
        await dropNotNullIfExists(knex, 'design_requests', 'race_id');
        await knex.raw('CREATE INDEX IF NOT EXISTS design_requests_org_primary_race_idx ON design_requests (org_id, primary_race_id)');
    }

    const linksExists = await knex.schema.hasTable('design_request_race_links');
    if (!linksExists) {
        await knex.schema.createTable('design_request_race_links', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.uuid('design_request_id').notNullable().references('id').inTable('design_requests').onDelete('CASCADE');
            table.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
            table.text('relation_type').notNullable().defaultTo('related');
            table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.unique(['design_request_id', 'race_id']);
            table.index(['org_id', 'race_id']);
            table.index(['design_request_id', 'relation_type']);
        });
        await knex.raw('ALTER TABLE design_request_race_links DROP CONSTRAINT IF EXISTS design_request_race_links_relation_type_check');
        await knex.raw(
            "ALTER TABLE design_request_race_links "
            + "ADD CONSTRAINT design_request_race_links_relation_type_check "
            + "CHECK (relation_type IN ('primary', 'related'))",
        );
    }

    if (hasDesignRequests) {
        await knex.raw(sql([
            'INSERT INTO design_request_race_links (org_id, design_request_id, race_id, relation_type, created_by, created_at)',
            "SELECT org_id, id, race_id, 'primary', created_by, created_at",
            'FROM design_requests',
            'WHERE race_id IS NOT NULL',
            'ON CONFLICT (design_request_id, race_id) DO NOTHING',
        ]));
    }

    const scopeAssignmentsExists = await knex.schema.hasTable('scope_role_assignments');
    if (!scopeAssignmentsExists) {
        await knex.schema.createTable('scope_role_assignments', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.text('scope_type').notNullable().defaultTo('org');
            table.text('scope_id').nullable();
            table.text('module_key').nullable();
            table.text('department_scope').nullable();
            table.uuid('team_member_id').notNullable().references('id').inTable('team_members').onDelete('CASCADE');
            table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.text('role_key').notNullable();
            table.text('role_name').notNullable();
            table.boolean('is_primary').notNullable().defaultTo(false);
            table.text('status').notNullable().defaultTo('active');
            table.timestamp('starts_at', { useTz: true }).nullable();
            table.timestamp('ends_at', { useTz: true }).nullable();
            table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['org_id', 'scope_type', 'scope_id']);
            table.index(['org_id', 'module_key', 'role_key', 'status']);
            table.index(['org_id', 'department_scope', 'role_key', 'status']);
            table.index(['user_id']);
        });
        await knex.raw('ALTER TABLE scope_role_assignments DROP CONSTRAINT IF EXISTS scope_role_assignments_scope_type_check');
        await knex.raw(
            "ALTER TABLE scope_role_assignments "
            + "ADD CONSTRAINT scope_role_assignments_scope_type_check "
            + "CHECK (scope_type IN ('org', 'department', 'module', 'race', 'project'))",
        );
        await knex.raw('ALTER TABLE scope_role_assignments DROP CONSTRAINT IF EXISTS scope_role_assignments_status_check');
        await knex.raw(
            "ALTER TABLE scope_role_assignments "
            + "ADD CONSTRAINT scope_role_assignments_status_check "
            + "CHECK (status IN ('active', 'inactive', 'archived'))",
        );
    }

    const raceStaffExists = await knex.schema.hasTable('race_staff_assignments');
    if (raceStaffExists) {
        await knex.raw(sql([
            'INSERT INTO scope_role_assignments (',
            '    org_id, scope_type, scope_id, module_key, department_scope,',
            '    team_member_id, user_id, role_key, role_name, is_primary, status,',
            '    starts_at, ends_at, created_by, created_at, updated_at',
            ')',
            'SELECT',
            "    org_id, 'race', race_id::text, module_scope, department_scope,",
            '    team_member_id, user_id, role_key, role_name, is_primary, status,',
            '    starts_at, ends_at, created_by, created_at, updated_at',
            'FROM race_staff_assignments rsa',
            'WHERE NOT EXISTS (',
            '    SELECT 1',
            '    FROM scope_role_assignments sra',
            '    WHERE sra.org_id = rsa.org_id',
            "      AND sra.scope_type = 'race'",
            '      AND sra.scope_id = rsa.race_id::text',
            '      AND sra.team_member_id = rsa.team_member_id',
            '      AND sra.role_key = rsa.role_key',
            "      AND COALESCE(sra.department_scope, '') = COALESCE(rsa.department_scope, '')",
            ')',
        ]));
    }

    const hasApprovalInstances = await knex.schema.hasTable('approval_instances');
    if (hasApprovalInstances) {
        await addColumnIfMissing(knex, 'approval_instances', 'primary_race_id', (table) => {
            table.bigInteger('primary_race_id').nullable().references('id').inTable('races').onDelete('SET NULL');
        });
        await addColumnIfMissing(knex, 'approval_instances', 'scope_type', (table) => {
            table.text('scope_type').nullable();
        });
        await addColumnIfMissing(knex, 'approval_instances', 'scope_id', (table) => {
            table.text('scope_id').nullable();
        });
        await addColumnIfMissing(knex, 'approval_instances', 'business_context_json', (table) => {
            table.jsonb('business_context_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
        });
        await knex.raw('UPDATE approval_instances SET primary_race_id = race_id WHERE primary_race_id IS NULL AND race_id IS NOT NULL');
        await knex.raw(sql([
            'UPDATE approval_instances',
            'SET business_context_json = jsonb_set(',
            "    COALESCE(business_context_json, '{}'::jsonb),",
            "    '{raceIds}',",
            '    CASE',
            "        WHEN race_id IS NULL THEN '[]'::jsonb",
            '        ELSE jsonb_build_array(race_id)',
            '    END,',
            '    true',
            ')',
        ]));
        await dropNotNullIfExists(knex, 'approval_instances', 'race_id');
        await knex.raw('CREATE INDEX IF NOT EXISTS approval_instances_org_primary_race_status_idx ON approval_instances (org_id, primary_race_id, status)');
    }

    for (const tableName of [
        'design_collaboration_imports',
        'design_collaboration_items',
        'design_collaboration_item_snapshots',
        'design_collaboration_exports',
    ]) {
        const exists = await knex.schema.hasTable(tableName);
        if (!exists) continue;
        await addColumnIfMissing(knex, tableName, 'scope_key', (table) => {
            table.text('scope_key').notNullable().defaultTo('org');
        });
        await knex.raw(sql([
            'UPDATE ??',
            'SET scope_key = CASE',
            "    WHEN race_id IS NULL THEN 'org'",
            "    ELSE 'race:' || race_id::text",
            'END',
            "WHERE scope_key IS NULL OR scope_key = 'org'",
        ]), [tableName]);
        await dropNotNullIfExists(knex, tableName, 'race_id');
        await knex.raw('CREATE INDEX IF NOT EXISTS ?? ON ?? (org_id, scope_key)', [
            tableName + '_org_scope_key_idx',
            tableName,
        ]);
    }
}

export async function down(knex) {
    for (const tableName of [
        'design_collaboration_exports',
        'design_collaboration_item_snapshots',
        'design_collaboration_items',
        'design_collaboration_imports',
    ]) {
        const exists = await knex.schema.hasTable(tableName);
        if (!exists) continue;
        const hasScopeKey = await knex.schema.hasColumn(tableName, 'scope_key');
        if (hasScopeKey) {
            await knex.schema.alterTable(tableName, (table) => {
                table.dropColumn('scope_key');
            });
            await knex.raw('DROP INDEX IF EXISTS ??', [tableName + '_org_scope_key_idx']);
        }
    }

    const hasApprovalInstances = await knex.schema.hasTable('approval_instances');
    if (hasApprovalInstances) {
        await knex.raw('DROP INDEX IF EXISTS approval_instances_org_primary_race_status_idx');
        for (const columnName of ['business_context_json', 'scope_id', 'scope_type', 'primary_race_id']) {
            const exists = await knex.schema.hasColumn('approval_instances', columnName);
            if (exists) {
                await knex.schema.alterTable('approval_instances', (table) => table.dropColumn(columnName));
            }
        }
    }

    await knex.schema.dropTableIfExists('scope_role_assignments');
    await knex.schema.dropTableIfExists('design_request_race_links');

    const hasDesignRequests = await knex.schema.hasTable('design_requests');
    if (hasDesignRequests) {
        const hasPrimaryRace = await knex.schema.hasColumn('design_requests', 'primary_race_id');
        if (hasPrimaryRace) {
            await knex.raw('DROP INDEX IF EXISTS design_requests_org_primary_race_idx');
            await knex.schema.alterTable('design_requests', (table) => {
                table.dropColumn('primary_race_id');
            });
        }
    }
}
