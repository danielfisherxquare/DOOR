import * as repo from './inventory.twin.repository.js';

function compactEvent(event) {
    return {
        id: event.id,
        warehouseId: event.warehouse_id,
        locationId: event.location_id,
        objectId: event.object_id,
        eventType: event.event_type,
        eventStatus: event.event_status,
        source: event.source,
        createdAt: event.created_at,
    };
}

export async function getTwinScenePayload(orgId, warehouseId) {
    const warehouse = await repo.getTwinWarehouseById(orgId, warehouseId);
    if (!warehouse) {
        throw new Error('Warehouse not found');
    }

    const [zones, racks, locations, objects, events] = await Promise.all([
        repo.getWarehouseZones(orgId, { warehouseId }),
        repo.getRackInstances(orgId, { warehouseId }),
        repo.getTwinLocations(orgId, { warehouseId }),
        repo.getInventoryObjects(orgId, { warehouseId }),
        repo.getTwinEvents(orgId, { warehouseId, limit: 100 }),
    ]);

    return {
        warehouse,
        zones,
        racks,
        locations,
        objects,
        alerts: [],
        events: events.map(compactEvent),
        version: warehouse.scene_version,
    };
}
