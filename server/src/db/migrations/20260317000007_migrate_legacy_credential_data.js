function buildNumericAccessCodeMaps(zones) {
    const orderedZones = [...zones].sort((left, right) => {
        const leftSort = Number(left.sort_order || 0);
        const rightSort = Number(right.sort_order || 0);
        if (leftSort !== rightSort) return leftSort - rightSort;
        return Number(left.id) - Number(right.id);
    });

    let nextNumericCode = orderedZones.reduce((maxValue, zone) => {
        if (/^[0-9]+$/.test(String(zone.zone_code || ''))) {
            return Math.max(maxValue, Number(zone.zone_code));
        }
        return maxValue;
    }, 0) + 1;

    const zoneCodeToAccessCode = new Map();
    for (const zone of orderedZones) {
        const accessCode = /^[0-9]+$/.test(String(zone.zone_code || ''))
            ? String(zone.zone_code)
            : String(nextNumericCode++);
        zoneCodeToAccessCode.set(zone.zone_code, accessCode);
    }
    return { zoneCodeToAccessCode };
}

function parseMaybeJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

export async function up(knex) {
    const hasRequestId = await knex.schema.hasColumn('credential_credentials', 'request_id');
    if (!hasRequestId) {
        await knex.schema.alterTable('credential_credentials', (t) => {
            t.bigInteger('request_id').nullable();
        });
    }
    const hasCategoryName = await knex.schema.hasColumn('credential_credentials', 'category_name');
    if (!hasCategoryName) {
        await knex.schema.alterTable('credential_credentials', (t) => {
            t.text('category_name').nullable();
        });
    }
    const hasCategoryColor = await knex.schema.hasColumn('credential_credentials', 'category_color');
    if (!hasCategoryColor) {
        await knex.schema.alterTable('credential_credentials', (t) => {
            t.text('category_color').nullable();
        });
    }
    const hasJobTitle = await knex.schema.hasColumn('credential_credentials', 'job_title');
    if (!hasJobTitle) {
        await knex.schema.alterTable('credential_credentials', (t) => {
            t.text('job_title').nullable();
        });
    }

    const zones = await knex('credential_zones').select('*');
    if (zones.length === 0) return;

    const { zoneCodeToAccessCode } = buildNumericAccessCodeMaps(zones);
    const accessAreaIdsByRaceAndCode = new Map();

    for (const zone of zones) {
        const accessCode = zoneCodeToAccessCode.get(zone.zone_code);
        const [row] = await knex('credential_access_areas')
            .insert({
                org_id: zone.org_id,
                race_id: zone.race_id,
                access_code: accessCode,
                access_name: zone.zone_name,
                access_color: zone.zone_color,
                sort_order: zone.sort_order || 0,
                geometry: parseMaybeJson(zone.geometry),
                description: zone.description || null,
                is_active: zone.is_active !== false,
                created_at: zone.created_at || knex.fn.now(),
                updated_at: zone.updated_at || knex.fn.now(),
            })
            .onConflict(['org_id', 'race_id', 'access_code'])
            .merge()
            .returning('*');

        accessAreaIdsByRaceAndCode.set(`${zone.race_id}:${accessCode}`, Number(row.id));
    }

    const templates = await knex('credential_role_templates').select('*');
    const categoryIdByTemplateId = new Map();

    for (const template of templates) {
        const [row] = await knex('credential_categories')
            .insert({
                org_id: template.org_id,
                race_id: template.race_id,
                category_name: template.role_name,
                category_code: template.role_code,
                card_color: template.default_color || '#6B7280',
                requires_review: template.requires_review !== false,
                is_active: template.is_active !== false,
                default_style_template_id: template.default_style_template_id || null,
                description: template.description || null,
                sort_order: template.sort_order || 0,
                created_at: template.created_at || knex.fn.now(),
                updated_at: template.updated_at || knex.fn.now(),
            })
            .onConflict(['org_id', 'race_id', 'category_code'])
            .merge()
            .returning('*');

        categoryIdByTemplateId.set(Number(template.id), Number(row.id));
    }

    const templateZones = await knex('credential_role_template_zones').select('*');
    for (const relation of templateZones) {
        const categoryId = categoryIdByTemplateId.get(Number(relation.role_template_id));
        const accessCode = zoneCodeToAccessCode.get(relation.zone_code);
        const accessAreaId = accessAreaIdsByRaceAndCode.get(`${relation.race_id}:${accessCode}`);
        if (!categoryId || !accessAreaId) continue;

        await knex('credential_category_access_areas')
            .insert({
                category_id: categoryId,
                access_area_id: accessAreaId,
                sort_order: 0,
            })
            .onConflict(['category_id', 'access_area_id'])
            .ignore();
    }

    const accessAreas = await knex('credential_access_areas').select('*');
    const accessAreaByRaceAndCode = new Map(
        accessAreas.map((item) => [`${item.race_id}:${item.access_code}`, item]),
    );
    const requestIdByApplicationId = new Map();

    const applications = await knex('credential_applications').select('*');
    for (const application of applications) {
        const categoryId = categoryIdByTemplateId.get(Number(application.role_template_id));
        if (!categoryId) continue;

        const category = await knex('credential_categories').where({ id: categoryId }).first();
        const [request] = await knex('credential_requests')
            .insert({
                org_id: application.org_id,
                race_id: application.race_id,
                applicant_user_id: application.applicant_user_id,
                source_mode: 'self_service',
                category_id: categoryId,
                category_name: category.category_name,
                category_color: category.card_color,
                person_name: application.person_name,
                org_name: application.org_name || null,
                job_title: application.role_name || null,
                status: application.status,
                reviewer_user_id: application.reviewer_user_id || null,
                reviewed_at: application.reviewed_at || null,
                review_remark: application.review_remark || null,
                reject_reason: application.reject_reason || null,
                remark: application.remark || null,
                custom_fields: parseMaybeJson(application.custom_fields),
                created_by: application.created_by || null,
                updated_by: application.updated_by || null,
                created_at: application.created_at || knex.fn.now(),
                updated_at: application.updated_at || knex.fn.now(),
            })
            .returning('*');

        requestIdByApplicationId.set(Number(application.id), Number(request.id));

        const defaultRelations = await knex('credential_category_access_areas')
            .where({ category_id: categoryId })
            .orderBy('sort_order', 'asc')
            .select('access_area_id');
        const overrideRows = await knex('credential_application_zone_overrides')
            .where({ application_id: application.id })
            .select('*');

        const finalAccessCodes = new Set(
            defaultRelations
                .map((relation) => accessAreas.find((item) => Number(item.id) === Number(relation.access_area_id)))
                .filter(Boolean)
                .map((item) => item.access_code),
        );

        for (const override of overrideRows) {
            const accessCode = zoneCodeToAccessCode.get(override.zone_code);
            if (!accessCode) continue;
            if (override.override_type === 'remove') {
                finalAccessCodes.delete(accessCode);
            } else {
                finalAccessCodes.add(accessCode);
            }
        }

        const resolvedAreas = [...finalAccessCodes]
            .map((accessCode) => accessAreaByRaceAndCode.get(`${application.race_id}:${accessCode}`))
            .filter(Boolean)
            .sort((left, right) => {
                const leftSort = Number(left.sort_order || 0);
                const rightSort = Number(right.sort_order || 0);
                if (leftSort !== rightSort) return leftSort - rightSort;
                return String(left.access_code).localeCompare(String(right.access_code));
            });

        for (const [index, area] of resolvedAreas.entries()) {
            await knex('credential_request_access_areas').insert({
                request_id: request.id,
                access_area_id: area.id,
                access_code: area.access_code,
                access_name: area.access_name,
                access_color: area.access_color,
                geometry: parseMaybeJson(area.geometry),
                access_description: area.description || null,
                sort_order: index,
            });
        }
    }

    const credentials = await knex('credential_credentials').select('*');
    for (const credential of credentials) {
        const requestId = credential.application_id ? requestIdByApplicationId.get(Number(credential.application_id)) : null;
        const request = requestId ? await knex('credential_requests').where({ id: requestId }).first() : null;

        if (request) {
            await knex('credential_credentials').where({ id: credential.id }).update({
                request_id: request.id,
                category_name: request.category_name,
                category_color: request.category_color,
                job_title: request.job_title,
            });
        }

        const legacyZones = await knex('credential_credential_zones')
            .where({ credential_id: credential.id })
            .orderBy('zone_code', 'asc');

        for (const [index, zone] of legacyZones.entries()) {
            const accessCode = zoneCodeToAccessCode.get(zone.zone_code);
            const accessAreaId = accessAreaIdsByRaceAndCode.get(`${zone.race_id}:${accessCode}`) || null;
            await knex('credential_credential_access_areas').insert({
                credential_id: credential.id,
                access_area_id: accessAreaId,
                access_code: accessCode,
                access_name: zone.zone_name,
                access_color: zone.zone_color,
                geometry: parseMaybeJson(zone.geometry),
                access_description: zone.zone_description || null,
                sort_order: index,
            });
        }
    }
}

export async function down() {
    // Intentionally empty. This migration backfills data only.
}
