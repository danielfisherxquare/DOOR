import knex from '../../db/knex.js';

function dbOrKnex(db) {
    return db || knex;
}

function toJsonb(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return JSON.stringify(value);
}

function applyDefined(target, source, mappings) {
    mappings.forEach(([fromKey, toKey]) => {
        if (source[fromKey] !== undefined) {
            target[toKey] = source[fromKey];
        }
    });
    return target;
}

export async function getTwinWarehouses(orgId, db) {
    return dbOrKnex(db)('warehouses')
        .where({ org_id: orgId })
        .orderBy('is_default', 'desc')
        .orderBy('created_at', 'desc');
}

export async function getTwinWarehouseById(orgId, warehouseId, db) {
    return dbOrKnex(db)('warehouses')
        .where({ org_id: orgId, id: warehouseId })
        .first();
}

export async function createTwinWarehouse(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        code: data.code,
        name: data.name,
        address: data.address || null,
        contact: data.contact || null,
        is_default: data.isDefault || false,
        status: data.status || 'active',
        floor_count: data.floorCount ?? 1,
        scene_version: data.sceneVersion ?? 1,
    }, data, [
    ]);
    payload.dimensions_mm = toJsonb(data.dimensionsMm);
    payload.origin = toJsonb(data.origin);
    payload.layout_json = toJsonb(data.layoutJson);

    const [result] = await dbOrKnex(db)('warehouses').insert(payload).returning('*');
    return result;
}

export async function updateTwinWarehouse(orgId, warehouseId, data, db) {
    const payload = applyDefined({
        updated_at: dbOrKnex(db).fn.now(),
    }, data, [
        ['code', 'code'],
        ['name', 'name'],
        ['address', 'address'],
        ['contact', 'contact'],
        ['isDefault', 'is_default'],
        ['status', 'status'],
        ['floorCount', 'floor_count'],
        ['sceneVersion', 'scene_version'],
    ]);
    if (data.dimensionsMm !== undefined) payload.dimensions_mm = toJsonb(data.dimensionsMm);
    if (data.origin !== undefined) payload.origin = toJsonb(data.origin);
    if (data.layoutJson !== undefined) payload.layout_json = toJsonb(data.layoutJson);

    const [result] = await dbOrKnex(db)('warehouses')
        .where({ org_id: orgId, id: warehouseId })
        .update(payload)
        .returning('*');

    return result;
}

export async function getTwinWarehouseLayout(orgId, warehouseId, db) {
    return dbOrKnex(db)('warehouses')
        .where({ org_id: orgId, id: warehouseId })
        .select('id', 'layout_json', 'scene_version')
        .first();
}

export async function saveTwinWarehouseLayout(orgId, warehouseId, layoutJson, sceneVersion, db) {
    const [result] = await dbOrKnex(db)('warehouses')
        .where({ org_id: orgId, id: warehouseId })
        .update({
            layout_json: toJsonb(layoutJson),
            scene_version: sceneVersion,
            updated_at: dbOrKnex(db).fn.now(),
        })
        .returning(['id', 'layout_json', 'scene_version', 'updated_at']);

    return result;
}

export async function getWarehouseZones(orgId, filters = {}, db) {
    const query = dbOrKnex(db)('warehouse_zones')
        .where({ org_id: orgId })
        .orderBy('code', 'asc');

    if (filters.warehouseId) {
        query.andWhere('warehouse_id', filters.warehouseId);
    }

    return query;
}

export async function createWarehouseZone(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        warehouse_id: data.warehouseId,
        code: data.code,
        name: data.name,
        zone_type: data.zoneType || 'storage',
        bounds_mm: toJsonb(data.boundsMm),
        status: data.status || 'active',
        created_by: data.createdBy || null,
    }, data, []);
    payload.metadata = toJsonb(data.metadata);

    const [result] = await dbOrKnex(db)('warehouse_zones').insert(payload).returning('*');
    return result;
}

export async function updateWarehouseZone(orgId, zoneId, data, db) {
    const payload = applyDefined({
        updated_at: dbOrKnex(db).fn.now(),
    }, data, [
        ['warehouseId', 'warehouse_id'],
        ['code', 'code'],
        ['name', 'name'],
        ['zoneType', 'zone_type'],
        ['status', 'status'],
    ]);
    if (data.boundsMm !== undefined) payload.bounds_mm = toJsonb(data.boundsMm);
    if (data.metadata !== undefined) payload.metadata = toJsonb(data.metadata);

    const [result] = await dbOrKnex(db)('warehouse_zones')
        .where({ org_id: orgId, id: zoneId })
        .update(payload)
        .returning('*');

    return result;
}

export async function getRackTemplates(orgId, db) {
    return dbOrKnex(db)('rack_templates')
        .where({ org_id: orgId })
        .orderBy('code', 'asc');
}

export async function getRackTemplateById(orgId, rackTemplateId, db) {
    return dbOrKnex(db)('rack_templates')
        .where({ org_id: orgId, id: rackTemplateId })
        .first();
}

export async function createRackTemplate(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        code: data.code,
        name: data.name,
        shape_type: data.shapeType || 'standard',
        outer_dimensions_mm: toJsonb(data.outerDimensionsMm),
        levels: data.levels ?? 1,
        bays: data.bays ?? 1,
        status: data.status || 'active',
        created_by: data.createdBy || null,
    }, data, [['maxLoadKg', 'max_load_kg']]);
    payload.slot_rule = toJsonb(data.slotRule);
    payload.allowed_shape_types = toJsonb(data.allowedShapeTypes);

    const [result] = await dbOrKnex(db)('rack_templates').insert(payload).returning('*');
    return result;
}

export async function updateRackTemplate(orgId, rackTemplateId, data, db) {
    const payload = applyDefined({
        updated_at: dbOrKnex(db).fn.now(),
    }, data, [
        ['code', 'code'],
        ['name', 'name'],
        ['shapeType', 'shape_type'],
        ['levels', 'levels'],
        ['bays', 'bays'],
        ['maxLoadKg', 'max_load_kg'],
        ['status', 'status'],
    ]);
    if (data.outerDimensionsMm !== undefined) payload.outer_dimensions_mm = toJsonb(data.outerDimensionsMm);
    if (data.slotRule !== undefined) payload.slot_rule = toJsonb(data.slotRule);
    if (data.allowedShapeTypes !== undefined) payload.allowed_shape_types = toJsonb(data.allowedShapeTypes);

    const [result] = await dbOrKnex(db)('rack_templates')
        .where({ org_id: orgId, id: rackTemplateId })
        .update(payload)
        .returning('*');

    return result;
}

export async function getRackInstances(orgId, filters = {}, db) {
    const query = dbOrKnex(db)('rack_instances as r')
        .leftJoin('rack_templates as t', 'r.rack_template_id', 't.id')
        .where('r.org_id', orgId)
        .select(
            'r.*',
            't.code as rack_template_code',
            't.name as rack_template_name',
            't.shape_type as rack_template_shape_type'
        )
        .orderBy('r.code', 'asc');

    if (filters.warehouseId) {
        query.andWhere('r.warehouse_id', filters.warehouseId);
    }

    return query;
}

export async function getRackInstanceById(orgId, rackInstanceId, db) {
    return dbOrKnex(db)('rack_instances')
        .where({ org_id: orgId, id: rackInstanceId })
        .first();
}

export async function createRackInstance(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        warehouse_id: data.warehouseId,
        rack_template_id: data.rackTemplateId,
        code: data.code,
        name: data.name,
        position_mm: toJsonb(data.positionMm),
        status: data.status || 'active',
        created_by: data.createdBy || null,
    }, data, []);
    payload.rotation_deg = toJsonb(data.rotationDeg);
    payload.scale = toJsonb(data.scale);
    payload.metadata = toJsonb(data.metadata);

    const [result] = await dbOrKnex(db)('rack_instances').insert(payload).returning('*');
    return result;
}

export async function updateRackInstance(orgId, rackInstanceId, data, db) {
    const payload = applyDefined({
        updated_at: dbOrKnex(db).fn.now(),
    }, data, [
        ['warehouseId', 'warehouse_id'],
        ['rackTemplateId', 'rack_template_id'],
        ['code', 'code'],
        ['name', 'name'],
        ['status', 'status'],
    ]);
    if (data.positionMm !== undefined) payload.position_mm = toJsonb(data.positionMm);
    if (data.rotationDeg !== undefined) payload.rotation_deg = toJsonb(data.rotationDeg);
    if (data.scale !== undefined) payload.scale = toJsonb(data.scale);
    if (data.metadata !== undefined) payload.metadata = toJsonb(data.metadata);

    const [result] = await dbOrKnex(db)('rack_instances')
        .where({ org_id: orgId, id: rackInstanceId })
        .update(payload)
        .returning('*');

    return result;
}

export async function getTwinLocations(orgId, filters = {}, db) {
    const query = dbOrKnex(db)('warehouse_locations')
        .where({ org_id: orgId })
        .orderBy('code', 'asc');

    if (filters.warehouseId) {
        query.andWhere('warehouse_id', filters.warehouseId);
    }

    if (filters.rackInstanceCode) {
        query.andWhere('rack_instance_code', filters.rackInstanceCode);
    }

    if (filters.status) {
        query.andWhere('status', filters.status);
    }

    return query;
}

export async function getTwinLocationById(orgId, locationId, db) {
    return dbOrKnex(db)('warehouse_locations')
        .where({ org_id: orgId, id: locationId })
        .first();
}

export async function createTwinLocation(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        warehouse_id: data.warehouseId,
        code: data.code,
        zone: data.zone || null,
        aisle: data.aisle || null,
        shelf: data.shelf || null,
        position: data.position || null,
        qr_code: data.qrCode || null,
        capacity: data.capacity ?? 1,
        used_capacity: data.usedCapacity ?? 0,
        status: data.status || 'empty',
        occupancy_mode: data.occupancyMode || 'count',
    }, data, [
        ['maxWeightKg', 'max_weight_kg'],
        ['rackInstanceCode', 'rack_instance_code'],
        ['slotPath', 'slot_path'],
    ]);
    payload.item_types = toJsonb(data.itemTypes);
    payload.transform = toJsonb(data.transform);
    payload.dimensions_mm = toJsonb(data.dimensionsMm);

    const [result] = await dbOrKnex(db)('warehouse_locations').insert(payload).returning('*');
    return result;
}

export async function batchCreateTwinLocations(orgId, rows, db) {
    if (!rows.length) return [];

    const payload = rows.map((row) => {
        const nextRow = applyDefined({
            org_id: orgId,
            warehouse_id: row.warehouseId,
            code: row.code,
            zone: row.zone || null,
            aisle: row.aisle || null,
            shelf: row.shelf || null,
            position: row.position || null,
            qr_code: row.qrCode || null,
            capacity: row.capacity ?? 1,
            used_capacity: row.usedCapacity ?? 0,
            status: row.status || 'empty',
            occupancy_mode: row.occupancyMode || 'count',
        }, row, [
            ['maxWeightKg', 'max_weight_kg'],
            ['rackInstanceCode', 'rack_instance_code'],
            ['slotPath', 'slot_path'],
        ]);
        nextRow.item_types = toJsonb(row.itemTypes);
        nextRow.transform = toJsonb(row.transform);
        nextRow.dimensions_mm = toJsonb(row.dimensionsMm);
        return nextRow;
    });

    return dbOrKnex(db)('warehouse_locations').insert(payload).returning('*');
}

export async function updateTwinLocation(orgId, locationId, data, db) {
    const payload = applyDefined({
        updated_at: dbOrKnex(db).fn.now(),
    }, data, [
        ['warehouseId', 'warehouse_id'],
        ['code', 'code'],
        ['zone', 'zone'],
        ['aisle', 'aisle'],
        ['shelf', 'shelf'],
        ['position', 'position'],
        ['qrCode', 'qr_code'],
        ['capacity', 'capacity'],
        ['usedCapacity', 'used_capacity'],
        ['status', 'status'],
        ['maxWeightKg', 'max_weight_kg'],
        ['occupancyMode', 'occupancy_mode'],
        ['rackInstanceCode', 'rack_instance_code'],
        ['slotPath', 'slot_path'],
    ]);
    if (data.itemTypes !== undefined) payload.item_types = toJsonb(data.itemTypes);
    if (data.transform !== undefined) payload.transform = toJsonb(data.transform);
    if (data.dimensionsMm !== undefined) payload.dimensions_mm = toJsonb(data.dimensionsMm);

    const [result] = await dbOrKnex(db)('warehouse_locations')
        .where({ org_id: orgId, id: locationId })
        .update(payload)
        .returning('*');

    return result;
}

export async function getItemShapeTemplates(orgId, db) {
    return dbOrKnex(db)('item_shape_templates')
        .where({ org_id: orgId })
        .orderBy('code', 'asc');
}

export async function getItemShapeTemplateById(orgId, templateId, db) {
    return dbOrKnex(db)('item_shape_templates')
        .where({ org_id: orgId, id: templateId })
        .first();
}

export async function createItemShapeTemplate(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        code: data.code,
        name: data.name,
        shape_type: data.shapeType,
        dimensions_mm: toJsonb(data.dimensionsMm),
        stackable: data.stackable ?? true,
        status: data.status || 'active',
        created_by: data.createdBy || null,
    }, data, [['defaultWeightKg', 'default_weight_kg']]);
    payload.geometry_profile = toJsonb(data.geometryProfile);
    payload.orientation_rules = toJsonb(data.orientationRules);

    const [result] = await dbOrKnex(db)('item_shape_templates').insert(payload).returning('*');
    return result;
}

export async function updateItemShapeTemplate(orgId, templateId, data, db) {
    const payload = applyDefined({
        updated_at: dbOrKnex(db).fn.now(),
    }, data, [
        ['code', 'code'],
        ['name', 'name'],
        ['shapeType', 'shape_type'],
        ['defaultWeightKg', 'default_weight_kg'],
        ['stackable', 'stackable'],
        ['status', 'status'],
    ]);
    if (data.dimensionsMm !== undefined) payload.dimensions_mm = toJsonb(data.dimensionsMm);
    if (data.geometryProfile !== undefined) payload.geometry_profile = toJsonb(data.geometryProfile);
    if (data.orientationRules !== undefined) payload.orientation_rules = toJsonb(data.orientationRules);

    const [result] = await dbOrKnex(db)('item_shape_templates')
        .where({ org_id: orgId, id: templateId })
        .update(payload)
        .returning('*');

    return result;
}

export async function getInventoryObjects(orgId, filters = {}, db) {
    const query = dbOrKnex(db)('inventory_objects as o')
        .leftJoin('item_shape_templates as s', 'o.shape_template_id', 's.id')
        .where('o.org_id', orgId)
        .select(
            'o.*',
            's.code as shape_template_code',
            's.name as shape_template_name'
        )
        .orderBy('o.object_code', 'asc');

    if (filters.warehouseId) {
        query.andWhere('o.current_warehouse_id', filters.warehouseId);
    }

    if (filters.locationId) {
        query.andWhere('o.current_location_id', filters.locationId);
    }

    if (filters.batchId) {
        query.andWhere('o.batch_id', filters.batchId);
    }

    if (filters.objectLevel) {
        query.andWhere('o.object_level', filters.objectLevel);
    }

    if (filters.status) {
        query.andWhere('o.status', filters.status);
    }

    return query;
}

export async function getInventoryObjectById(orgId, objectId, db) {
    return dbOrKnex(db)('inventory_objects')
        .where({ org_id: orgId, id: objectId })
        .first();
}

export async function getInventoryObjectByCode(orgId, objectCode, db) {
    return dbOrKnex(db)('inventory_objects')
        .where({ org_id: orgId, object_code: objectCode })
        .first();
}

export async function getInventoryObjectByLegacyUnitId(orgId, legacyUnitId, db) {
    return dbOrKnex(db)('inventory_objects')
        .where({ org_id: orgId, legacy_unit_id: legacyUnitId })
        .first();
}

export async function createInventoryObject(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        object_code: data.objectCode,
        object_level: data.objectLevel || 'unit',
        shape_type: data.shapeType,
        stackable: data.stackable ?? true,
        status: data.status || 'in_stock',
        created_by: data.createdBy || null,
    }, data, [
        ['legacyUnitId', 'legacy_unit_id'],
        ['batchId', 'batch_id'],
        ['shapeTemplateId', 'shape_template_id'],
        ['weightKg', 'weight_kg'],
        ['parentObjectId', 'parent_object_id'],
        ['currentWarehouseId', 'current_warehouse_id'],
        ['currentLocationId', 'current_location_id'],
    ]);
    payload.dimensions_mm = toJsonb(data.dimensionsMm);
    payload.orientation_rules = toJsonb(data.orientationRules);

    const [result] = await dbOrKnex(db)('inventory_objects').insert(payload).returning('*');
    return result;
}

export async function updateInventoryObject(orgId, objectId, data, db) {
    const payload = applyDefined({
        updated_at: dbOrKnex(db).fn.now(),
    }, data, [
        ['legacyUnitId', 'legacy_unit_id'],
        ['batchId', 'batch_id'],
        ['shapeTemplateId', 'shape_template_id'],
        ['objectCode', 'object_code'],
        ['objectLevel', 'object_level'],
        ['shapeType', 'shape_type'],
        ['weightKg', 'weight_kg'],
        ['stackable', 'stackable'],
        ['parentObjectId', 'parent_object_id'],
        ['currentWarehouseId', 'current_warehouse_id'],
        ['currentLocationId', 'current_location_id'],
        ['status', 'status'],
    ]);
    if (data.dimensionsMm !== undefined) payload.dimensions_mm = toJsonb(data.dimensionsMm);
    if (data.orientationRules !== undefined) payload.orientation_rules = toJsonb(data.orientationRules);

    const [result] = await dbOrKnex(db)('inventory_objects')
        .where({ org_id: orgId, id: objectId })
        .update(payload)
        .returning('*');

    return result;
}

export async function createQrEntity(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        entity_type: data.entityType,
        entity_id: String(data.entityId),
        qr_code: data.qrCode,
        payload_version: data.payloadVersion ?? 1,
        status: data.status || 'active',
        created_by: data.createdBy || null,
    }, data, []);
    payload.payload = toJsonb(data.payload);

    const [result] = await dbOrKnex(db)('qr_entities').insert(payload).returning('*');
    return result;
}

export async function updateQrEntity(orgId, qrEntityId, data, db) {
    const payload = applyDefined({
        updated_at: dbOrKnex(db).fn.now(),
    }, data, [
        ['entityType', 'entity_type'],
        ['entityId', 'entity_id'],
        ['qrCode', 'qr_code'],
        ['payloadVersion', 'payload_version'],
        ['status', 'status'],
        ['createdBy', 'created_by'],
    ]);

    if (data.payload !== undefined) {
        payload.payload = toJsonb(data.payload);
    }

    const [result] = await dbOrKnex(db)('qr_entities')
        .where({ org_id: orgId, id: qrEntityId })
        .update(payload)
        .returning('*');

    return result;
}

export async function findQrEntityByCode(orgId, qrCode, db) {
    return dbOrKnex(db)('qr_entities')
        .where({ org_id: orgId, qr_code: qrCode })
        .first();
}

export async function findQrEntity(orgId, entityType, entityId, db) {
    return dbOrKnex(db)('qr_entities')
        .where({
            org_id: orgId,
            entity_type: entityType,
            entity_id: String(entityId),
        })
        .first();
}

export async function getActiveLocationBindingByObjectId(orgId, objectId, db) {
    return dbOrKnex(db)('location_bindings')
        .where({
            org_id: orgId,
            object_id: objectId,
        })
        .whereNull('unbound_at')
        .orderBy('bound_at', 'desc')
        .first();
}

export async function createLocationBinding(orgId, data, db) {
    const [result] = await dbOrKnex(db)('location_bindings')
        .insert({
            org_id: orgId,
            object_id: data.objectId,
            warehouse_id: data.warehouseId,
            location_id: data.locationId,
            operator_id: data.operatorId || null,
            binding_mode: data.bindingMode || 'scan',
            bound_at: data.boundAt || dbOrKnex(db).fn.now(),
            metadata: toJsonb(data.metadata),
        })
        .returning('*');

    return result;
}

export async function closeActiveLocationBinding(orgId, objectId, data = {}, db) {
    const [result] = await dbOrKnex(db)('location_bindings')
        .where({
            org_id: orgId,
            object_id: objectId,
        })
        .whereNull('unbound_at')
        .update({
            unbound_at: data.unboundAt || dbOrKnex(db).fn.now(),
            released_by: data.releasedBy || null,
            release_reason: data.releaseReason || null,
            metadata: data.metadata !== undefined ? toJsonb(data.metadata) : undefined,
        })
        .returning('*');

    return result;
}

export async function createTwinEvent(orgId, data, db) {
    const payload = applyDefined({
        org_id: orgId,
        event_type: data.eventType,
        event_status: data.eventStatus || 'committed',
        source: data.source || 'system',
    }, data, [
        ['warehouseId', 'warehouse_id'],
        ['locationId', 'location_id'],
        ['objectId', 'object_id'],
        ['actorUserId', 'actor_user_id'],
    ]);
    payload.event_payload = toJsonb(data.eventPayload);

    const [result] = await dbOrKnex(db)('twin_events').insert(payload).returning('*');
    return result;
}

export async function getTwinEvents(orgId, filters = {}, db) {
    const query = dbOrKnex(db)('twin_events')
        .where({ org_id: orgId })
        .orderBy('created_at', 'desc');

    if (filters.warehouseId) {
        query.andWhere('warehouse_id', filters.warehouseId);
    }

    if (filters.objectId) {
        query.andWhere('object_id', filters.objectId);
    }

    if (filters.limit) {
        query.limit(filters.limit);
    } else {
        query.limit(100);
    }

    return query;
}
