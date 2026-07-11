import knex from '../../db/knex.js';
import * as twinRepo from './inventory.twin.repository.js';

const OBJECT_ENTITY_TYPES = new Set(['inventory_object', 'object']);
const LOCATION_ENTITY_TYPES = new Set(['location', 'storage_location', 'warehouse_location']);

function bindingError(message, code = 'INVENTORY_TWIN_BINDING_INVALID', status = 400) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.expose = true;
    return error;
}

function normalizeString(value, fieldName) {
    const nextValue = String(value || '').trim();
    if (!nextValue) {
        throw bindingError(`${fieldName} is required`);
    }
    return nextValue;
}

function normalizeInteger(value, fieldName) {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue) || nextValue <= 0) {
        throw bindingError(`${fieldName} is required`);
    }
    return Math.round(nextValue);
}

function toJsonb(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return JSON.stringify(value);
}

function parseJsonb(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }
    return value;
}

function deriveLocationStatus(currentStatus, usedCapacity, capacity) {
    if (currentStatus === 'locked') return 'locked';
    const normalizedUsed = Math.max(0, Number(usedCapacity || 0));
    const normalizedCapacity = Math.max(0, Number(capacity || 0));

    if (normalizedUsed <= 0) return 'empty';
    if (normalizedCapacity > 0 && normalizedUsed >= normalizedCapacity) return 'full';
    return 'partial';
}

function ensureBindingEntity(entity, expectedTypes, fieldName) {
    if (!entity) {
        throw bindingError(`${fieldName} not found`, 'INVENTORY_TWIN_BINDING_ENTITY_NOT_FOUND', 404);
    }

    if (!expectedTypes.has(entity.entity_type)) {
        throw bindingError(`${fieldName} has invalid entity type`);
    }

    return entity;
}

function ensureLocationAcceptsObject(location, object) {
    if (location.status === 'locked') {
        throw bindingError('Location is locked', 'INVENTORY_TWIN_LOCATION_LOCKED', 409);
    }

    const objectWarehouseId = Number(object.current_warehouse_id || object.currentWarehouseId || 0);
    const locationWarehouseId = Number(location.warehouse_id || location.warehouseId || 0);
    if (objectWarehouseId > 0 && locationWarehouseId > 0 && objectWarehouseId !== locationWarehouseId) {
        throw bindingError(
            'Cross-warehouse binding is not allowed in phase 1',
            'INVENTORY_TWIN_CROSS_WAREHOUSE_FORBIDDEN',
            409
        );
    }

    const locationDimensions = parseJsonb(location.dimensions_mm);
    const objectDimensions = parseJsonb(object.dimensions_mm);
    if (locationDimensions && objectDimensions) {
        if (
            Number(objectDimensions.widthMm || 0) > Number(locationDimensions.widthMm || 0)
            || Number(objectDimensions.depthMm || 0) > Number(locationDimensions.depthMm || 0)
            || Number(objectDimensions.heightMm || 0) > Number(locationDimensions.heightMm || 0)
        ) {
            throw bindingError(
                'Object dimensions exceed location capacity',
                'INVENTORY_TWIN_LOCATION_CAPACITY_EXCEEDED',
                409
            );
        }
    }

    if (location.max_weight_kg !== null && location.max_weight_kg !== undefined && object.weight_kg !== null && object.weight_kg !== undefined) {
        if (Number(object.weight_kg) > Number(location.max_weight_kg)) {
            throw bindingError(
                'Object weight exceeds location capacity',
                'INVENTORY_TWIN_LOCATION_CAPACITY_EXCEEDED',
                409
            );
        }
    }
}

async function resolveBindingResources(orgId, objectQr, locationQr, trx) {
    const objectEntity = ensureBindingEntity(
        await twinRepo.findQrEntityByCode(orgId, normalizeString(objectQr, 'objectQr'), trx),
        OBJECT_ENTITY_TYPES,
        'objectQr'
    );
    const locationEntity = ensureBindingEntity(
        await twinRepo.findQrEntityByCode(orgId, normalizeString(locationQr, 'locationQr'), trx),
        LOCATION_ENTITY_TYPES,
        'locationQr'
    );

    const objectId = normalizeInteger(objectEntity.entity_id, 'objectId');
    const locationId = normalizeInteger(locationEntity.entity_id, 'locationId');

    const object = await twinRepo.getInventoryObjectById(orgId, objectId, trx, { forUpdate: true });
    const location = await twinRepo.getTwinLocationById(orgId, locationId, trx, { forUpdate: true });

    if (!object) {
        throw bindingError('Inventory object not found', 'INVENTORY_TWIN_OBJECT_NOT_FOUND', 404);
    }
    if (!location) {
        throw bindingError('Location not found', 'INVENTORY_TWIN_LOCATION_NOT_FOUND', 404);
    }

    return { objectEntity, locationEntity, object, location };
}

async function updateLegacyUnitLocation(trx, orgId, legacyUnitId, warehouseId, locationId) {
    if (!legacyUnitId) return null;

    const [result] = await trx('org_inventory_units')
        .where({ org_id: orgId, id: legacyUnitId })
        .update({
            warehouse_id: warehouseId,
            location_id: locationId,
            updated_at: trx.fn.now(),
        })
        .returning('*');

    return result;
}

async function insertTransactionIfNeeded(trx, orgId, object, previousBinding, location, operatorId, transactionType, remarks) {
    if (!object.legacy_unit_id) return null;

    const [result] = await trx('inventory_transactions')
        .insert({
            org_id: orgId,
            unit_id: object.legacy_unit_id,
            transaction_type: transactionType,
            from_holder_type: previousBinding ? 'warehouse_location' : 'unassigned',
            from_holder_id: previousBinding ? String(previousBinding.location_id) : null,
            to_holder_type: location ? 'warehouse_location' : 'unassigned',
            to_holder_id: location ? String(location.id) : null,
            operator_id: operatorId || null,
            remarks,
        })
        .returning('*');

    return result;
}

async function decrementPreviousLocationIfNeeded(trx, orgId, previousBinding) {
    if (!previousBinding) return null;

    const previousLocation = await twinRepo.getTwinLocationById(
        orgId,
        previousBinding.location_id,
        trx,
        { forUpdate: true }
    );
    if (!previousLocation) return null;

    const usedCapacity = Math.max(0, Number(previousLocation.used_capacity || 0) - 1);
    return twinRepo.updateTwinLocation(orgId, previousLocation.id, {
        usedCapacity,
        status: deriveLocationStatus(previousLocation.status, usedCapacity, previousLocation.capacity),
    }, trx);
}

async function incrementTargetLocation(trx, orgId, location) {
    const nextUsedCapacity = Number(location.used_capacity || 0) + 1;
    return twinRepo.updateTwinLocation(orgId, location.id, {
        usedCapacity: nextUsedCapacity,
        status: deriveLocationStatus(location.status, nextUsedCapacity, location.capacity),
    }, trx);
}

async function performBind(orgId, payload, action = 'scan') {
    return knex.transaction(async (trx) => {
        const operatorId = payload.operatorId || null;
        const bindingMode = payload.bindingMode || action;
        const { object, location } = await resolveBindingResources(orgId, payload.objectQr, payload.locationQr, trx);
        const previousBinding = await twinRepo.getActiveLocationBindingByObjectId(
            orgId,
            object.id,
            trx,
            { forUpdate: true }
        );

        if (previousBinding && Number(previousBinding.location_id) === Number(location.id)) {
            throw bindingError(
                'Object is already bound to this location',
                'INVENTORY_TWIN_BINDING_CONFLICT',
                409
            );
        }

        if (previousBinding && action !== 'move') {
            throw bindingError(
                'Object is already bound; use the move operation to change locations',
                'INVENTORY_TWIN_BINDING_CONFLICT',
                409
            );
        }

        ensureLocationAcceptsObject(location, object);

        if (!previousBinding && Number(location.capacity || 0) > 0 && Number(location.used_capacity || 0) >= Number(location.capacity || 0)) {
            throw bindingError(
                'Location capacity exceeded',
                'INVENTORY_TWIN_LOCATION_CAPACITY_EXCEEDED',
                409
            );
        }

        if (previousBinding) {
            if (Number(location.capacity || 0) > 0 && Number(location.used_capacity || 0) >= Number(location.capacity || 0)) {
                throw bindingError(
                    'Location capacity exceeded',
                    'INVENTORY_TWIN_LOCATION_CAPACITY_EXCEEDED',
                    409
                );
            }

            await twinRepo.closeActiveLocationBinding(orgId, object.id, {
                releasedBy: operatorId,
                releaseReason: action === 'move' ? 'moved' : 'rebound',
            }, trx);
            await decrementPreviousLocationIfNeeded(trx, orgId, previousBinding);
        }

        const binding = await twinRepo.createLocationBinding(orgId, {
            objectId: object.id,
            warehouseId: location.warehouse_id,
            locationId: location.id,
            operatorId,
            bindingMode,
            metadata: {
                objectQr: payload.objectQr,
                locationQr: payload.locationQr,
                action,
            },
        }, trx);

        const updatedObject = await twinRepo.updateInventoryObject(orgId, object.id, {
            currentWarehouseId: location.warehouse_id,
            currentLocationId: location.id,
            status: action === 'move' ? object.status : 'in_stock',
        }, trx);

        const updatedLocation = await incrementTargetLocation(trx, orgId, location);
        const updatedUnit = await updateLegacyUnitLocation(trx, orgId, object.legacy_unit_id, location.warehouse_id, location.id);
        const transaction = await insertTransactionIfNeeded(
            trx,
            orgId,
            object,
            previousBinding,
            location,
            operatorId,
            previousBinding ? 'transfer' : 'inbound',
            previousBinding ? 'Twin move binding' : 'Twin scan binding'
        );
        const event = await twinRepo.createTwinEvent(orgId, {
            warehouseId: location.warehouse_id,
            locationId: location.id,
            objectId: object.id,
            actorUserId: operatorId,
            eventType: previousBinding ? 'transfer' : 'inbound',
            source: 'twin_binding',
            eventPayload: {
                bindingId: binding.id,
                previousLocationId: previousBinding?.location_id || null,
                nextLocationId: location.id,
                action,
            },
        }, trx);

        return {
            binding,
            object: updatedObject,
            location: updatedLocation,
            legacyUnit: updatedUnit,
            transaction,
            event,
        };
    });
}

export async function scanBinding(orgId, payload) {
    return performBind(orgId, payload, 'scan');
}

export async function moveBinding(orgId, payload) {
    return performBind(orgId, payload, 'move');
}

export async function unbindBinding(orgId, payload) {
    return knex.transaction(async (trx) => {
        const operatorId = payload.operatorId || null;
        const objectEntity = ensureBindingEntity(
            await twinRepo.findQrEntityByCode(orgId, normalizeString(payload.objectQr, 'objectQr'), trx),
            OBJECT_ENTITY_TYPES,
            'objectQr'
        );
        const object = await twinRepo.getInventoryObjectById(
            orgId,
            normalizeInteger(objectEntity.entity_id, 'objectId'),
            trx,
            { forUpdate: true }
        );
        if (!object) {
            throw bindingError('Inventory object not found', 'INVENTORY_TWIN_OBJECT_NOT_FOUND', 404);
        }

        const activeBinding = await twinRepo.getActiveLocationBindingByObjectId(
            orgId,
            object.id,
            trx,
            { forUpdate: true }
        );
        if (!activeBinding) {
            throw bindingError(
                'Object has no active binding',
                'INVENTORY_TWIN_BINDING_NOT_FOUND',
                404
            );
        }

        const previousLocation = await twinRepo.getTwinLocationById(
            orgId,
            activeBinding.location_id,
            trx,
            { forUpdate: true }
        );
        await twinRepo.closeActiveLocationBinding(orgId, object.id, {
            releasedBy: operatorId,
            releaseReason: payload.reason || 'manual_unbind',
            metadata: {
                action: 'unbind',
                reason: payload.reason || 'manual_unbind',
            },
        }, trx);

        let updatedLocation = null;
        if (previousLocation) {
            updatedLocation = await twinRepo.updateTwinLocation(orgId, previousLocation.id, {
                usedCapacity: Math.max(0, Number(previousLocation.used_capacity || 0) - 1),
                status: deriveLocationStatus(
                    previousLocation.status,
                    Math.max(0, Number(previousLocation.used_capacity || 0) - 1),
                    previousLocation.capacity
                ),
            }, trx);
        }

        const updatedObject = await twinRepo.updateInventoryObject(orgId, object.id, {
            currentWarehouseId: null,
            currentLocationId: null,
        }, trx);
        const updatedUnit = await updateLegacyUnitLocation(trx, orgId, object.legacy_unit_id, null, null);
        const transaction = await insertTransactionIfNeeded(
            trx,
            orgId,
            object,
            activeBinding,
            null,
            operatorId,
            'transfer',
            'Twin unbind'
        );
        const event = await twinRepo.createTwinEvent(orgId, {
            warehouseId: previousLocation?.warehouse_id || null,
            locationId: previousLocation?.id || null,
            objectId: object.id,
            actorUserId: operatorId,
            eventType: 'unbind',
            source: 'twin_binding',
            eventPayload: {
                previousLocationId: previousLocation?.id || null,
                reason: payload.reason || 'manual_unbind',
            },
        }, trx);

        return {
            binding: activeBinding,
            object: updatedObject,
            location: updatedLocation,
            legacyUnit: updatedUnit,
            transaction,
            event,
        };
    });
}
