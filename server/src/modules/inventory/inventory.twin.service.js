import knex from '../../db/knex.js';
import * as repo from './inventory.twin.repository.js';
import * as bindingService from './inventory.twin.binding.js';
import { getTwinScenePayload } from './inventory.twin.scene.js';

const SHAPE_TYPES = new Set(['box', 'bin', 'drum', 'custom_bbox']);
const OBJECT_LEVELS = new Set(['unit', 'box', 'pallet', 'batch']);
const LOCATION_OCCUPANCY_MODES = new Set(['count', 'volume', 'weight', 'mixed']);
const DEFAULT_DIMENSIONS_BY_TYPE = {
    clothing: { widthMm: 420, depthMm: 320, heightMm: 60 },
    medal: { widthMm: 140, depthMm: 140, heightMm: 25 },
    bag: { widthMm: 480, depthMm: 360, heightMm: 140 },
    other: { widthMm: 400, depthMm: 300, heightMm: 180 },
};
const DEFAULT_WEIGHT_BY_TYPE = {
    clothing: 0.35,
    medal: 0.12,
    bag: 0.8,
    other: 1,
};

function twinError(message, code = 'INVENTORY_TWIN_INPUT_INVALID', status = 400) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.expose = true;
    return error;
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value, fieldName, { required = false, fallback = undefined } = {}) {
    if (value === undefined) {
        if (required) {
            throw twinError(`${fieldName} is required`);
        }
        return fallback;
    }
    const nextValue = String(value || '').trim();
    if (!nextValue) {
        if (required) {
            throw twinError(`${fieldName} is required`);
        }
        return fallback ?? null;
    }
    return nextValue;
}

function normalizeBoolean(value, fallback = false) {
    if (value === undefined) return fallback;
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    throw twinError('value must be a boolean');
}

function normalizeInteger(value, fieldName, { required = false, min = 0, fallback = undefined } = {}) {
    if (value === undefined) {
        if (required) throw twinError(`${fieldName} is required`);
        return fallback;
    }
    const nextValue = Number(value);
    if (!Number.isInteger(nextValue) || nextValue < min) {
        throw twinError(`${fieldName} must be an integer greater than or equal to ${min}`);
    }
    return nextValue;
}

function normalizeDecimal(value, fieldName, { required = false, min = -Infinity, fallback = undefined } = {}) {
    if (value === undefined) {
        if (required) throw twinError(`${fieldName} is required`);
        return fallback;
    }
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue) || nextValue < min) {
        throw twinError(`${fieldName} must be a number greater than or equal to ${min}`);
    }
    return nextValue;
}

function normalizeJsonObject(value, fieldName, { required = false, fallback = undefined } = {}) {
    if (value === undefined) {
        if (required) throw twinError(`${fieldName} is required`);
        return fallback;
    }
    if (value === null) {
        if (required) throw twinError(`${fieldName} is required`);
        return null;
    }
    if (!isPlainObject(value)) {
        throw twinError(`${fieldName} must be an object`);
    }
    return value;
}

function normalizeDimensionsMm(value, fieldName, { required = false } = {}) {
    if (value === undefined) {
        if (required) throw twinError(`${fieldName} is required`);
        return undefined;
    }

    if (value === null) {
        if (required) throw twinError(`${fieldName} is required`);
        return null;
    }

    if (!isPlainObject(value)) {
        throw twinError(`${fieldName} must be an object`);
    }

    const widthMm = normalizeDecimal(value.widthMm, `${fieldName}.widthMm`, { required: true, min: 0 });
    const depthMm = normalizeDecimal(value.depthMm, `${fieldName}.depthMm`, { required: true, min: 0 });
    const heightMm = normalizeDecimal(value.heightMm, `${fieldName}.heightMm`, { required: true, min: 0 });

    return { widthMm, depthMm, heightMm };
}

function normalizePoint(value, fieldName, { required = false } = {}) {
    if (value === undefined) {
        if (required) throw twinError(`${fieldName} is required`);
        return undefined;
    }

    if (value === null) {
        if (required) throw twinError(`${fieldName} is required`);
        return null;
    }

    if (!isPlainObject(value)) {
        throw twinError(`${fieldName} must be an object`);
    }

    return {
        x: normalizeDecimal(value.x, `${fieldName}.x`, { required: true }),
        y: normalizeDecimal(value.y, `${fieldName}.y`, { required: true }),
        z: normalizeDecimal(value.z, `${fieldName}.z`, { required: true }),
    };
}

function normalizeTransform(value, fieldName, { required = false } = {}) {
    if (value === undefined) {
        if (required) throw twinError(`${fieldName} is required`);
        return undefined;
    }

    if (value === null) {
        if (required) throw twinError(`${fieldName} is required`);
        return null;
    }

    if (!isPlainObject(value)) {
        throw twinError(`${fieldName} must be an object`);
    }

    return {
        x: normalizeDecimal(value.x, `${fieldName}.x`, { required: true }),
        y: normalizeDecimal(value.y, `${fieldName}.y`, { required: true }),
        z: normalizeDecimal(value.z, `${fieldName}.z`, { required: true }),
        rotationX: normalizeDecimal(value.rotationX ?? 0, `${fieldName}.rotationX`, { required: true }),
        rotationY: normalizeDecimal(value.rotationY ?? 0, `${fieldName}.rotationY`, { required: true }),
        rotationZ: normalizeDecimal(value.rotationZ ?? 0, `${fieldName}.rotationZ`, { required: true }),
    };
}

function normalizeRotation(value, fieldName) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (!isPlainObject(value)) {
        throw twinError(`${fieldName} must be an object`);
    }

    return {
        x: normalizeDecimal(value.x ?? 0, `${fieldName}.x`, { required: true }),
        y: normalizeDecimal(value.y ?? 0, `${fieldName}.y`, { required: true }),
        z: normalizeDecimal(value.z ?? 0, `${fieldName}.z`, { required: true }),
    };
}

function normalizeShapeType(value, fieldName, { required = false } = {}) {
    if (value === undefined) {
        if (required) throw twinError(`${fieldName} is required`);
        return undefined;
    }

    const nextValue = normalizeString(value, fieldName, { required });
    if (nextValue === null || nextValue === undefined) return nextValue;
    if (!SHAPE_TYPES.has(nextValue)) {
        throw twinError(`${fieldName} must be one of ${Array.from(SHAPE_TYPES).join(', ')}`);
    }
    return nextValue;
}

function normalizeAllowedShapeTypes(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (!Array.isArray(value)) {
        throw twinError('allowedShapeTypes must be an array');
    }
    return [...new Set(value.map((item) => normalizeShapeType(item, 'allowedShapeTypes item', { required: true })))];
}

function parseJsonLike(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }
    if (isPlainObject(value)) return value;
    return null;
}

function normalizeMaybeDimensionsMm(value) {
    if (!value || !isPlainObject(value)) return null;
    const widthMm = Number(value.widthMm ?? value.width_mm);
    const depthMm = Number(value.depthMm ?? value.depth_mm);
    const heightMm = Number(value.heightMm ?? value.height_mm);
    if (![widthMm, depthMm, heightMm].every(Number.isFinite)) return null;
    return {
        widthMm: Math.max(widthMm, 1),
        depthMm: Math.max(depthMm, 1),
        heightMm: Math.max(heightMm, 1),
    };
}

function normalizeObjectLevel(value, { required = false } = {}) {
    if (value === undefined) {
        if (required) throw twinError('objectLevel is required');
        return undefined;
    }

    const nextValue = normalizeString(value, 'objectLevel', { required });
    if (nextValue === null || nextValue === undefined) return nextValue;
    if (!OBJECT_LEVELS.has(nextValue)) {
        throw twinError(`objectLevel must be one of ${Array.from(OBJECT_LEVELS).join(', ')}`);
    }
    return nextValue;
}

function normalizeOccupancyMode(value) {
    if (value === undefined) return undefined;
    const nextValue = normalizeString(value, 'occupancyMode', { required: true });
    if (!LOCATION_OCCUPANCY_MODES.has(nextValue)) {
        throw twinError(`occupancyMode must be one of ${Array.from(LOCATION_OCCUPANCY_MODES).join(', ')}`);
    }
    return nextValue;
}

function buildLocationCode(slot, index) {
    if (slot.code) return normalizeString(slot.code, 'code', { required: true });

    const zone = normalizeString(slot.zone ?? 'A', 'zone', { required: true });
    const aisle = String(normalizeInteger(slot.aisle ?? index + 1, 'aisle', { required: true, min: 0 })).padStart(2, '0');
    const shelf = String(normalizeInteger(slot.shelf ?? 1, 'shelf', { required: true, min: 0 })).padStart(2, '0');
    const position = String(normalizeInteger(slot.position ?? index + 1, 'position', { required: true, min: 0 })).padStart(2, '0');
    return `${zone}-${aisle}-${shelf}-${position}`;
}

function buildLocationQrCode(warehouseId, code) {
    return `LOC-${warehouseId}-${String(code).replace(/[^a-zA-Z0-9]+/g, '-').toUpperCase()}`;
}

function normalizeWarehousePayload(data, { partial = false } = {}) {
    const payload = {};

    if (!partial || data.code !== undefined) payload.code = normalizeString(data.code, 'code', { required: !partial });
    if (!partial || data.name !== undefined) payload.name = normalizeString(data.name, 'name', { required: !partial });
    if (data.address !== undefined) payload.address = normalizeString(data.address, 'address', { fallback: null });
    if (data.contact !== undefined) payload.contact = normalizeString(data.contact, 'contact', { fallback: null });
    if (data.isDefault !== undefined || !partial) payload.isDefault = normalizeBoolean(data.isDefault, false);
    if (data.status !== undefined) payload.status = normalizeString(data.status, 'status', { required: true });
    if (data.dimensionsMm !== undefined) payload.dimensionsMm = normalizeDimensionsMm(data.dimensionsMm, 'dimensionsMm');
    if (data.origin !== undefined) payload.origin = normalizePoint(data.origin, 'origin');
    if (data.floorCount !== undefined || !partial) payload.floorCount = normalizeInteger(data.floorCount, 'floorCount', { min: 1, fallback: 1 });
    if (data.sceneVersion !== undefined || !partial) payload.sceneVersion = normalizeInteger(data.sceneVersion, 'sceneVersion', { min: 1, fallback: 1 });
    if (data.layoutJson !== undefined) payload.layoutJson = data.layoutJson === null ? null : data.layoutJson;

    return payload;
}

function normalizeRackTemplatePayload(data, { partial = false } = {}) {
    const payload = {};

    if (!partial || data.code !== undefined) payload.code = normalizeString(data.code, 'code', { required: !partial });
    if (!partial || data.name !== undefined) payload.name = normalizeString(data.name, 'name', { required: !partial });
    if (data.shapeType !== undefined || !partial) payload.shapeType = normalizeString(data.shapeType, 'shapeType', { required: !partial, fallback: 'standard' }) || 'standard';
    if (!partial || data.outerDimensionsMm !== undefined) payload.outerDimensionsMm = normalizeDimensionsMm(data.outerDimensionsMm, 'outerDimensionsMm', { required: !partial });
    if (data.levels !== undefined || !partial) payload.levels = normalizeInteger(data.levels, 'levels', { min: 1, fallback: 1 });
    if (data.bays !== undefined || !partial) payload.bays = normalizeInteger(data.bays, 'bays', { min: 1, fallback: 1 });
    if (data.maxLoadKg !== undefined) payload.maxLoadKg = normalizeDecimal(data.maxLoadKg, 'maxLoadKg', { min: 0 });
    if (data.slotRule !== undefined || !partial) payload.slotRule = normalizeJsonObject(data.slotRule ?? {}, 'slotRule', { required: !partial, fallback: {} });
    if (data.allowedShapeTypes !== undefined) payload.allowedShapeTypes = normalizeAllowedShapeTypes(data.allowedShapeTypes);
    if (data.status !== undefined) payload.status = normalizeString(data.status, 'status', { required: true });
    if (data.createdBy !== undefined) payload.createdBy = data.createdBy;

    return payload;
}

function normalizeRackInstancePayload(data, { partial = false } = {}) {
    const payload = {};

    if (!partial || data.warehouseId !== undefined) payload.warehouseId = normalizeInteger(data.warehouseId, 'warehouseId', { required: !partial, min: 1 });
    if (!partial || data.rackTemplateId !== undefined) payload.rackTemplateId = normalizeInteger(data.rackTemplateId, 'rackTemplateId', { required: !partial, min: 1 });
    if (!partial || data.code !== undefined) payload.code = normalizeString(data.code, 'code', { required: !partial });
    if (!partial || data.name !== undefined) payload.name = normalizeString(data.name, 'name', { required: !partial });
    if (!partial || data.positionMm !== undefined) payload.positionMm = normalizePoint(data.positionMm, 'positionMm', { required: !partial });
    if (data.rotationDeg !== undefined) payload.rotationDeg = normalizeRotation(data.rotationDeg, 'rotationDeg');
    if (data.scale !== undefined) payload.scale = normalizeJsonObject(data.scale, 'scale');
    if (data.status !== undefined) payload.status = normalizeString(data.status, 'status', { required: true });
    if (data.metadata !== undefined) payload.metadata = normalizeJsonObject(data.metadata, 'metadata');
    if (data.createdBy !== undefined) payload.createdBy = data.createdBy;

    return payload;
}

function normalizeLocationPayload(data, { partial = false } = {}) {
    const payload = {};

    if (!partial || data.warehouseId !== undefined) payload.warehouseId = normalizeInteger(data.warehouseId, 'warehouseId', { required: !partial, min: 1 });
    if (!partial || data.code !== undefined) payload.code = normalizeString(data.code, 'code', { required: !partial });
    if (data.zone !== undefined) payload.zone = normalizeString(data.zone, 'zone', { fallback: null });
    if (data.aisle !== undefined) payload.aisle = normalizeString(data.aisle, 'aisle', { fallback: null });
    if (data.shelf !== undefined) payload.shelf = normalizeString(data.shelf, 'shelf', { fallback: null });
    if (data.position !== undefined) payload.position = normalizeString(data.position, 'position', { fallback: null });
    if (data.qrCode !== undefined) payload.qrCode = normalizeString(data.qrCode, 'qrCode', { fallback: null });
    if (data.capacity !== undefined || !partial) payload.capacity = normalizeInteger(data.capacity, 'capacity', { min: 0, fallback: 1 });
    if (data.usedCapacity !== undefined) payload.usedCapacity = normalizeInteger(data.usedCapacity, 'usedCapacity', { min: 0, fallback: 0 });
    if (data.itemTypes !== undefined) {
        if (!Array.isArray(data.itemTypes)) throw twinError('itemTypes must be an array');
        payload.itemTypes = data.itemTypes.map((item) => normalizeString(item, 'itemTypes item', { required: true }));
    }
    if (data.status !== undefined) payload.status = normalizeString(data.status, 'status', { required: true });
    if (data.transform !== undefined) payload.transform = normalizeTransform(data.transform, 'transform');
    if (data.dimensionsMm !== undefined) payload.dimensionsMm = normalizeDimensionsMm(data.dimensionsMm, 'dimensionsMm');
    if (data.maxWeightKg !== undefined) payload.maxWeightKg = normalizeDecimal(data.maxWeightKg, 'maxWeightKg', { min: 0 });
    if (data.occupancyMode !== undefined || !partial) payload.occupancyMode = normalizeOccupancyMode(data.occupancyMode) || 'count';
    if (data.rackInstanceCode !== undefined) payload.rackInstanceCode = normalizeString(data.rackInstanceCode, 'rackInstanceCode', { fallback: null });
    if (data.slotPath !== undefined) payload.slotPath = normalizeString(data.slotPath, 'slotPath', { fallback: null });

    return payload;
}

function normalizeItemShapeTemplatePayload(data, { partial = false } = {}) {
    const payload = {};

    if (!partial || data.code !== undefined) payload.code = normalizeString(data.code, 'code', { required: !partial });
    if (!partial || data.name !== undefined) payload.name = normalizeString(data.name, 'name', { required: !partial });
    if (!partial || data.shapeType !== undefined) payload.shapeType = normalizeShapeType(data.shapeType, 'shapeType', { required: !partial });
    if (!partial || data.dimensionsMm !== undefined) payload.dimensionsMm = normalizeDimensionsMm(data.dimensionsMm, 'dimensionsMm', { required: !partial });
    if (data.geometryProfile !== undefined) payload.geometryProfile = data.geometryProfile === null ? null : data.geometryProfile;
    if (data.defaultWeightKg !== undefined) payload.defaultWeightKg = normalizeDecimal(data.defaultWeightKg, 'defaultWeightKg', { min: 0 });
    if (data.stackable !== undefined || !partial) payload.stackable = normalizeBoolean(data.stackable, true);
    if (data.orientationRules !== undefined) payload.orientationRules = data.orientationRules === null ? null : data.orientationRules;
    if (data.status !== undefined) payload.status = normalizeString(data.status, 'status', { required: true });
    if (data.createdBy !== undefined) payload.createdBy = data.createdBy;

    return payload;
}

function normalizeInventoryObjectPayload(data, { partial = false } = {}) {
    const payload = {};

    if (data.legacyUnitId !== undefined) payload.legacyUnitId = normalizeInteger(data.legacyUnitId, 'legacyUnitId', { min: 1 });
    if (data.batchId !== undefined) payload.batchId = normalizeInteger(data.batchId, 'batchId', { min: 1 });
    if (data.shapeTemplateId !== undefined) payload.shapeTemplateId = normalizeInteger(data.shapeTemplateId, 'shapeTemplateId', { min: 1 });
    if (!partial || data.objectCode !== undefined) payload.objectCode = normalizeString(data.objectCode, 'objectCode', { required: !partial });
    if (!partial || data.objectLevel !== undefined) payload.objectLevel = normalizeObjectLevel(data.objectLevel, { required: !partial }) || 'unit';
    if (!partial || data.shapeType !== undefined) payload.shapeType = normalizeShapeType(data.shapeType, 'shapeType', { required: !partial });
    if (data.dimensionsMm !== undefined) payload.dimensionsMm = normalizeDimensionsMm(data.dimensionsMm, 'dimensionsMm');
    if (data.weightKg !== undefined) payload.weightKg = normalizeDecimal(data.weightKg, 'weightKg', { min: 0 });
    if (data.stackable !== undefined || !partial) payload.stackable = normalizeBoolean(data.stackable, true);
    if (data.orientationRules !== undefined) payload.orientationRules = data.orientationRules === null ? null : data.orientationRules;
    if (data.parentObjectId !== undefined) payload.parentObjectId = normalizeInteger(data.parentObjectId, 'parentObjectId', { min: 1 });
    if (data.currentWarehouseId !== undefined) payload.currentWarehouseId = normalizeInteger(data.currentWarehouseId, 'currentWarehouseId', { min: 1 });
    if (data.currentLocationId !== undefined) payload.currentLocationId = normalizeInteger(data.currentLocationId, 'currentLocationId', { min: 1 });
    if (data.status !== undefined) payload.status = normalizeString(data.status, 'status', { required: true });
    if (data.createdBy !== undefined) payload.createdBy = data.createdBy;

    return payload;
}

function normalizeQrEntityPayload(data) {
    return {
        entityType: normalizeString(data.entityType, 'entityType', { required: true }),
        entityId: normalizeString(data.entityId, 'entityId', { required: true }),
        qrCode: normalizeString(data.qrCode, 'qrCode', { required: true }),
        payloadVersion: normalizeInteger(data.payloadVersion, 'payloadVersion', { min: 1, fallback: 1 }),
        status: normalizeString(data.status, 'status', { fallback: 'active' }) || 'active',
        payload: data.payload ?? null,
        createdBy: data.createdBy,
    };
}

export const twinValidation = {
    buildLocationCode,
    buildLocationQrCode,
    normalizeLocationPayload,
    normalizeWarehousePayload,
};

async function upsertQrEntity(orgId, data, repository = repo) {
    const db = data.db;
    const entityType = data.entityType;
    const entityId = String(data.entityId);
    const existing = await repository.findQrEntity(orgId, entityType, entityId, db);
    if (existing) {
        return repository.updateQrEntity(orgId, existing.id, { ...data, entityId }, db);
    }

    const existingByCode = await repository.findQrEntityByCode(orgId, data.qrCode, db);
    if (existingByCode) {
        if (existingByCode.entity_type !== entityType || String(existingByCode.entity_id) !== entityId) {
            throw twinError(
                `QR code ${data.qrCode} already registered to another entity`,
                'INVENTORY_TWIN_QR_CONFLICT',
                409
            );
        }
        return repository.updateQrEntity(orgId, existingByCode.id, { ...data, entityId }, db);
    }

    return repository.createQrEntity(orgId, { ...data, entityId }, db);
}

async function ensureLocationQrEntity(orgId, location, db, repository = repo) {
    if (!location?.id) return null;
    const warehouseId = location.warehouse_id ?? location.warehouseId;
    const code = location.code;
    const qrCode = location.qr_code || location.qrCode || buildLocationQrCode(warehouseId, code);
    if (!qrCode) return null;

    return upsertQrEntity(orgId, {
        entityType: 'location',
        entityId: String(location.id),
        qrCode,
        status: 'active',
        payload: {
            locationId: location.id,
            warehouseId,
            code,
        },
        db,
    }, repository);
}

async function ensureInventoryObjectQrEntity(orgId, object, db, repository = repo) {
    if (!object?.id) return null;
    const qrCode = object.object_code ?? object.objectCode;
    if (!qrCode) return null;

    return upsertQrEntity(orgId, {
        entityType: 'inventory_object',
        entityId: String(object.id),
        qrCode,
        status: 'active',
        payload: {
            objectId: object.id,
            objectCode: qrCode,
            objectLevel: object.object_level ?? object.objectLevel,
            warehouseId: object.current_warehouse_id ?? object.currentWarehouseId ?? null,
            locationId: object.current_location_id ?? object.currentLocationId ?? null,
        },
        db,
    }, repository);
}

function inferShapeTypeFromLegacyUnit(unit, spec = {}) {
    if (spec.shapeType && SHAPE_TYPES.has(spec.shapeType)) return spec.shapeType;
    const category = `${unit.item_category || ''} ${spec.category || ''}`.toLowerCase();
    if (category.includes('桶') || category.includes('drum')) return 'drum';
    if ((unit.item_type || '').toLowerCase() === 'bag') return 'bin';
    return 'box';
}

function inferDimensionsFromLegacyUnit(unit, shapeType, spec = {}) {
    const explicit = normalizeMaybeDimensionsMm(spec.dimensionsMm || spec.dimensions_mm);
    if (explicit) return explicit;
    if (shapeType === 'drum') {
        return { widthMm: 380, depthMm: 380, heightMm: 580 };
    }
    return DEFAULT_DIMENSIONS_BY_TYPE[unit.item_type] || DEFAULT_DIMENSIONS_BY_TYPE.other;
}

function inferWeightFromLegacyUnit(unit, spec = {}) {
    const explicit = Number(spec.weightKg ?? spec.weight_kg);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
    return DEFAULT_WEIGHT_BY_TYPE[unit.item_type] || DEFAULT_WEIGHT_BY_TYPE.other;
}

function inferInventoryObjectStatus(unit) {
    const legacyStatus = normalizeString(unit.status || 'in_stock', 'status', { fallback: 'in_stock' }) || 'in_stock';
    if (legacyStatus === 'available') return 'in_stock';
    return legacyStatus;
}

function normalizeBatchLocationRows(data) {
    const warehouseId = normalizeInteger(data.warehouseId, 'warehouseId', { required: true, min: 1 });
    if (!Array.isArray(data.slots) || data.slots.length === 0) {
        throw twinError('slots is required');
    }

    return data.slots.map((slot, index) => {
        const code = buildLocationCode(slot, index);
        return normalizeLocationPayload({
            warehouseId,
            code,
            zone: slot.zone ?? data.zone,
            aisle: slot.aisle ?? data.aisle ?? String(index + 1).padStart(2, '0'),
            shelf: slot.shelf ?? data.shelf ?? '01',
            position: slot.position ?? data.position ?? String(index + 1).padStart(2, '0'),
            qrCode: slot.qrCode || buildLocationQrCode(warehouseId, code),
            capacity: slot.capacity ?? data.capacity ?? 1,
            itemTypes: slot.itemTypes ?? data.itemTypes,
            status: slot.status ?? data.status ?? 'empty',
            transform: slot.transform ?? data.transform,
            dimensionsMm: slot.dimensionsMm ?? data.dimensionsMm,
            maxWeightKg: slot.maxWeightKg ?? data.maxWeightKg,
            occupancyMode: slot.occupancyMode ?? data.occupancyMode ?? 'count',
            rackInstanceCode: slot.rackInstanceCode ?? data.rackInstanceCode,
            slotPath: slot.slotPath ?? `slot-${index + 1}`,
        });
    });
}

export function createTwinMutationWorkflow({ database = knex, repository = repo } = {}) {
    return {
        createTwinLocation(orgId, data) {
            const input = normalizeLocationPayload(data);
            return database.transaction(async (trx) => {
                const location = await repository.createTwinLocation(orgId, input, trx);
                await ensureLocationQrEntity(orgId, location, trx, repository);
                return location;
            });
        },

        updateTwinLocation(orgId, locationId, data) {
            const input = normalizeLocationPayload(data, { partial: true });
            return database.transaction(async (trx) => {
                const location = await repository.updateTwinLocation(orgId, locationId, input, trx);
                await ensureLocationQrEntity(orgId, location, trx, repository);
                return location;
            });
        },

        batchGenerateLocations(orgId, data) {
            const rows = normalizeBatchLocationRows(data);
            return database.transaction(async (trx) => {
                const locations = await repository.batchCreateTwinLocations(orgId, rows, trx);
                for (const location of locations) {
                    await ensureLocationQrEntity(orgId, location, trx, repository);
                }
                return locations;
            });
        },

        createInventoryObject(orgId, data) {
            const input = normalizeInventoryObjectPayload(data);
            return database.transaction(async (trx) => {
                const object = await repository.createInventoryObject(orgId, input, trx);
                await ensureInventoryObjectQrEntity(orgId, object, trx, repository);
                return object;
            });
        },

        updateInventoryObject(orgId, objectId, data) {
            const input = normalizeInventoryObjectPayload(data, { partial: true });
            return database.transaction(async (trx) => {
                const object = await repository.updateInventoryObject(orgId, objectId, input, trx);
                await ensureInventoryObjectQrEntity(orgId, object, trx, repository);
                return object;
            });
        },
    };
}

const twinMutationWorkflow = createTwinMutationWorkflow();

export async function getTwinWarehouses(orgId) {
    return repo.getTwinWarehouses(orgId);
}

export async function getTwinWarehouseById(orgId, warehouseId) {
    return repo.getTwinWarehouseById(orgId, warehouseId);
}

export async function createTwinWarehouse(orgId, data) {
    return repo.createTwinWarehouse(orgId, normalizeWarehousePayload(data));
}

export async function updateTwinWarehouse(orgId, warehouseId, data) {
    return repo.updateTwinWarehouse(orgId, warehouseId, normalizeWarehousePayload(data, { partial: true }));
}

export async function getTwinWarehouseLayout(orgId, warehouseId) {
    return repo.getTwinWarehouseLayout(orgId, warehouseId);
}

export async function saveTwinWarehouseLayout(orgId, warehouseId, layoutJson) {
    const warehouse = await repo.saveTwinWarehouseLayout(orgId, warehouseId, layoutJson ?? null);
    if (!warehouse) {
        throw twinError('Warehouse not found', 'INVENTORY_TWIN_WAREHOUSE_NOT_FOUND', 404);
    }
    return warehouse;
}

export async function getWarehouseZones(orgId, filters = {}) {
    return repo.getWarehouseZones(orgId, filters);
}

export async function createWarehouseZone(orgId, data) {
    if (!data.warehouseId) throw twinError('warehouseId is required');
    if (!data.boundsMm) throw twinError('boundsMm is required');

    return repo.createWarehouseZone(orgId, {
        warehouseId: normalizeInteger(data.warehouseId, 'warehouseId', { required: true, min: 1 }),
        code: normalizeString(data.code, 'code', { required: true }),
        name: normalizeString(data.name, 'name', { required: true }),
        zoneType: normalizeString(data.zoneType, 'zoneType', { fallback: 'storage' }) || 'storage',
        boundsMm: data.boundsMm,
        metadata: data.metadata ?? null,
        status: normalizeString(data.status, 'status', { fallback: 'active' }) || 'active',
        createdBy: data.createdBy,
    });
}

export async function updateWarehouseZone(orgId, zoneId, data) {
    return repo.updateWarehouseZone(orgId, zoneId, {
        warehouseId: data.warehouseId !== undefined ? normalizeInteger(data.warehouseId, 'warehouseId', { min: 1 }) : undefined,
        code: data.code !== undefined ? normalizeString(data.code, 'code', { required: true }) : undefined,
        name: data.name !== undefined ? normalizeString(data.name, 'name', { required: true }) : undefined,
        zoneType: data.zoneType !== undefined ? normalizeString(data.zoneType, 'zoneType', { required: true }) : undefined,
        boundsMm: data.boundsMm,
        metadata: data.metadata,
        status: data.status !== undefined ? normalizeString(data.status, 'status', { required: true }) : undefined,
    });
}

export async function getRackTemplates(orgId) {
    return repo.getRackTemplates(orgId);
}

export async function createRackTemplate(orgId, data) {
    return repo.createRackTemplate(orgId, normalizeRackTemplatePayload(data));
}

export async function updateRackTemplate(orgId, rackTemplateId, data) {
    return repo.updateRackTemplate(orgId, rackTemplateId, normalizeRackTemplatePayload(data, { partial: true }));
}

export async function getRackInstances(orgId, filters = {}) {
    return repo.getRackInstances(orgId, filters);
}

export async function createRackInstance(orgId, data) {
    return repo.createRackInstance(orgId, normalizeRackInstancePayload(data));
}

export async function updateRackInstance(orgId, rackInstanceId, data) {
    return repo.updateRackInstance(orgId, rackInstanceId, normalizeRackInstancePayload(data, { partial: true }));
}

export async function getTwinLocations(orgId, filters = {}) {
    return repo.getTwinLocations(orgId, filters);
}

export async function createTwinLocation(orgId, data) {
    return twinMutationWorkflow.createTwinLocation(orgId, data);
}

export async function updateTwinLocation(orgId, locationId, data) {
    return twinMutationWorkflow.updateTwinLocation(orgId, locationId, data);
}

export async function batchGenerateLocations(orgId, data) {
    return twinMutationWorkflow.batchGenerateLocations(orgId, data);
}

export async function getItemShapeTemplates(orgId) {
    return repo.getItemShapeTemplates(orgId);
}

export async function createItemShapeTemplate(orgId, data) {
    return repo.createItemShapeTemplate(orgId, normalizeItemShapeTemplatePayload(data));
}

export async function updateItemShapeTemplate(orgId, templateId, data) {
    return repo.updateItemShapeTemplate(orgId, templateId, normalizeItemShapeTemplatePayload(data, { partial: true }));
}

export async function getInventoryObjects(orgId, filters = {}) {
    return repo.getInventoryObjects(orgId, {
        warehouseId: filters.warehouseId ? normalizeInteger(filters.warehouseId, 'warehouseId', { min: 1 }) : undefined,
        locationId: filters.locationId ? normalizeInteger(filters.locationId, 'locationId', { min: 1 }) : undefined,
        batchId: filters.batchId ? normalizeInteger(filters.batchId, 'batchId', { min: 1 }) : undefined,
        objectLevel: filters.objectLevel ? normalizeObjectLevel(filters.objectLevel) : undefined,
        status: filters.status ? normalizeString(filters.status, 'status', { required: true }) : undefined,
    });
}

export async function createInventoryObject(orgId, data) {
    return twinMutationWorkflow.createInventoryObject(orgId, data);
}

export async function updateInventoryObject(orgId, objectId, data) {
    return twinMutationWorkflow.updateInventoryObject(orgId, objectId, data);
}

export async function syncLegacyUnitsToTwinObjects(orgId, legacyUnits, options = {}, db) {
    if (!Array.isArray(legacyUnits) || legacyUnits.length === 0) {
        return { created: [], updated: [], objects: [] };
    }

    const created = [];
    const updated = [];
    const objects = [];

    for (const unit of legacyUnits) {
        const spec = parseJsonLike(unit.item_spec);
        const objectCode = normalizeString(unit.qr_code, 'qr_code', { required: true });
        const shapeType = inferShapeTypeFromLegacyUnit(unit, spec || {});
        const payload = normalizeInventoryObjectPayload({
            legacyUnitId: Number(unit.id),
            batchId: unit.batch_id ? Number(unit.batch_id) : undefined,
            objectCode,
            objectLevel: 'unit',
            shapeType,
            dimensionsMm: inferDimensionsFromLegacyUnit(unit, shapeType, spec || {}),
            weightKg: inferWeightFromLegacyUnit(unit, spec || {}),
            currentWarehouseId: options.currentWarehouseId ?? (unit.warehouse_id ? Number(unit.warehouse_id) : undefined),
            currentLocationId: options.currentLocationId ?? (unit.location_id ? Number(unit.location_id) : undefined),
            status: inferInventoryObjectStatus(unit),
            createdBy: options.createdBy,
        });

        const existing = await repo.getInventoryObjectByLegacyUnitId(orgId, Number(unit.id), db)
            || await repo.getInventoryObjectByCode(orgId, objectCode, db);

        let object;
        if (existing) {
            object = await repo.updateInventoryObject(orgId, existing.id, payload, db);
            updated.push(object);
        } else {
            object = await repo.createInventoryObject(orgId, payload, db);
            created.push(object);
        }

        await ensureInventoryObjectQrEntity(orgId, object, db);
        objects.push(object);
    }

    return { created, updated, objects };
}

export async function createQrEntity(orgId, data) {
    return upsertQrEntity(orgId, normalizeQrEntityPayload(data));
}

export async function findQrEntityByCode(orgId, qrCode) {
    return repo.findQrEntityByCode(orgId, normalizeString(qrCode, 'qrCode', { required: true }));
}

export async function findQrEntity(orgId, entityType, entityId) {
    return repo.findQrEntity(
        orgId,
        normalizeString(entityType, 'entityType', { required: true }),
        normalizeString(entityId, 'entityId', { required: true })
    );
}

export async function createTwinEvent(orgId, data) {
    return repo.createTwinEvent(orgId, {
        warehouseId: data.warehouseId !== undefined ? normalizeInteger(data.warehouseId, 'warehouseId', { min: 1 }) : undefined,
        locationId: data.locationId !== undefined ? normalizeInteger(data.locationId, 'locationId', { min: 1 }) : undefined,
        objectId: data.objectId !== undefined ? normalizeInteger(data.objectId, 'objectId', { min: 1 }) : undefined,
        eventType: normalizeString(data.eventType, 'eventType', { required: true }),
        eventStatus: normalizeString(data.eventStatus, 'eventStatus', { fallback: 'committed' }) || 'committed',
        actorUserId: data.actorUserId,
        source: normalizeString(data.source, 'source', { fallback: 'system' }) || 'system',
        eventPayload: data.eventPayload ?? null,
    });
}

export async function getTwinEvents(orgId, filters = {}) {
    return repo.getTwinEvents(orgId, {
        warehouseId: filters.warehouseId ? normalizeInteger(filters.warehouseId, 'warehouseId', { min: 1 }) : undefined,
        objectId: filters.objectId ? normalizeInteger(filters.objectId, 'objectId', { min: 1 }) : undefined,
        limit: filters.limit ? normalizeInteger(filters.limit, 'limit', { min: 1 }) : undefined,
    });
}

export async function scanBinding(orgId, payload) {
    return bindingService.scanBinding(orgId, {
        objectQr: normalizeString(payload.objectQr, 'objectQr', { required: true }),
        locationQr: normalizeString(payload.locationQr, 'locationQr', { required: true }),
        bindingMode: payload.bindingMode ? normalizeString(payload.bindingMode, 'bindingMode', { required: true }) : 'scan',
        operatorId: payload.operatorId,
    });
}

export async function moveBinding(orgId, payload) {
    return bindingService.moveBinding(orgId, {
        objectQr: normalizeString(payload.objectQr, 'objectQr', { required: true }),
        locationQr: normalizeString(payload.locationQr, 'locationQr', { required: true }),
        bindingMode: payload.bindingMode ? normalizeString(payload.bindingMode, 'bindingMode', { required: true }) : 'move',
        operatorId: payload.operatorId,
    });
}

export async function unbindBinding(orgId, payload) {
    return bindingService.unbindBinding(orgId, {
        objectQr: normalizeString(payload.objectQr, 'objectQr', { required: true }),
        reason: payload.reason !== undefined ? normalizeString(payload.reason, 'reason', { fallback: null }) : null,
        operatorId: payload.operatorId,
    });
}

export async function getTwinScene(orgId, warehouseId) {
    const normalizedWarehouseId = normalizeInteger(warehouseId, 'warehouseId', { required: true, min: 1 });
    return getTwinScenePayload(orgId, normalizedWarehouseId);
}

export function previewLocationQrCodes(warehouseId, codes = []) {
    const normalizedWarehouseId = normalizeInteger(warehouseId, 'warehouseId', { required: true, min: 1 });
    if (!Array.isArray(codes)) {
        throw twinError('codes must be an array');
    }

    return codes.map((code) => {
        const normalizedCode = normalizeString(code, 'code', { required: true });
        return {
            code: normalizedCode,
            qrCode: buildLocationQrCode(normalizedWarehouseId, normalizedCode),
        };
    });
}
