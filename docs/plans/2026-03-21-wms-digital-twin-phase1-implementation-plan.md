# WMS Digital Twin Phase 1 Implementation Plan

**Goal:** Deliver a production-safe first phase of DOOR WMS 3D digital twin capabilities that supports multi-warehouse 3D definitions, rack templates, item shape definitions, location QR codes, scan-based location binding, and basic 3D warehouse visualization without breaking the current WMS flows.

**Architecture:** Keep the current `inventory` module as the system of record for legacy pages, extend existing warehouse/unit tables with twin-ready fields, add a small set of new twin tables for 3D layout and binding history, and implement all new capabilities behind `/api/inventory/twin/*` routes. New twin write paths must double-write the legacy fields required by `InventoryHome`, `Reports`, `StocktakingManager`, `WarehouseManager`, `BatchInbound`, and `QRCodePrinter`.

**Tech Stack:** Node.js, Express, Knex, PostgreSQL, React, React Router, Vite, `three`, `@react-three/fiber`, `@react-three/drei`

---

### Task 1: Add the twin schema and extend the legacy schema

**Files:**
- Create: `door/server/src/db/migrations/20260322000001_extend_inventory_tables_for_twin_phase1.js`
- Create: `door/server/src/db/migrations/20260322000002_create_inventory_twin_tables_phase1.js`
- Create: `door/server/tests/inventory-twin-schema.test.js`

**Step 1: Write the failing migration/schema test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('inventory twin phase1 schema provides twin fields, twin tables, and uniqueness constraints', async () => {
  assert.fail('not implemented');
});
```

**Step 2: Run the focused test to verify failure**

Run: `npm --prefix door/server test -- tests/inventory-twin-schema.test.js`

Expected: FAIL because the new migration files and schema objects do not exist yet.

**Step 3: Write the minimal migration implementation**

Add legacy-table extensions:

```js
// warehouses
// - dimensions_mm jsonb
// - origin jsonb
// - floor_count integer not null default 1
// - scene_version integer not null default 1
// - layout_json jsonb nullable

// warehouse_locations
// - transform jsonb
// - dimensions_mm jsonb
// - max_weight_kg decimal
// - occupancy_mode string default 'count'
// - rack_instance_code string nullable
// - slot_path string nullable

// org_inventory_units
// - shape_template_code string nullable
// - dimensions_mm jsonb nullable
// - weight_kg decimal nullable
// - parent_unit_id bigint nullable
// - object_level string not null default 'unit'
```

Create new tables:

```js
// warehouse_zones
// rack_templates
// rack_instances
// item_shape_templates
// inventory_objects
// qr_entities
// location_bindings
// twin_events
```

Required constraints:

```js
// qr_entities.qr_code unique
// rack_templates unique(org_id, code)
// rack_instances unique(warehouse_id, code)
// item_shape_templates unique(org_id, code)
// inventory_objects unique(org_id, object_code)
// partial unique index on location_bindings(object_id) where unbound_at is null
```

**Step 4: Re-run the focused schema test**

Run: `npm --prefix door/server test -- tests/inventory-twin-schema.test.js`

Expected: PASS.

---

### Task 2: Add twin repository and service layer

**Files:**
- Create: `door/server/src/modules/inventory/inventory.twin.repository.js`
- Create: `door/server/src/modules/inventory/inventory.twin.service.js`
- Create: `door/server/tests/inventory-twin.repository.test.js`

**Step 1: Write the failing repository/service test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('inventory twin repository creates warehouses, rack templates, instances, locations, and objects with org isolation', async () => {
  assert.fail('not implemented');
});
```

**Step 2: Run the focused test**

Run: `npm --prefix door/server test -- tests/inventory-twin.repository.test.js`

Expected: FAIL because the twin repository/service files do not exist yet.

**Step 3: Write the minimal implementation**

Repository responsibilities:

```js
// warehouses
// - getTwinWarehouses
// - getTwinWarehouseById
// - createTwinWarehouse
// - updateTwinWarehouse
// - getTwinWarehouseLayout
// - saveTwinWarehouseLayout

// rack templates
// - getRackTemplates
// - createRackTemplate
// - updateRackTemplate

// rack instances
// - getRackInstances
// - createRackInstance
// - updateRackInstance

// locations
// - getTwinLocations
// - createTwinLocation
// - updateTwinLocation
// - batchGenerateLocations

// item shapes
// - getItemShapeTemplates
// - createItemShapeTemplate
// - updateItemShapeTemplate

// inventory objects
// - getInventoryObjects
// - createInventoryObject
// - updateInventoryObject

// QR helpers
// - createQrEntity
// - findQrEntityByCode
```

Service responsibilities:

```js
// validate dimensions_mm payloads
// validate transform payloads
// validate allowed shape types
// normalize defaults for layout_json, metadata, object level, status
// generate deterministic location codes when batch creating locations
```

**Step 4: Re-run the test**

Run: `npm --prefix door/server test -- tests/inventory-twin.repository.test.js`

Expected: PASS.

---

### Task 3: Add twin routes and route contract tests

**Files:**
- Create: `door/server/src/modules/inventory/inventory.twin.routes.js`
- Modify: `door/server/src/modules/inventory/inventory.routes.js`
- Create: `door/server/tests/inventory-twin.routes.test.js`

**Step 1: Write the failing route test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('inventory twin routes expose warehouse, rack, location, shape, object, scene, and event endpoints', async () => {
  assert.fail('not implemented');
});
```

**Step 2: Run the focused test**

Run: `npm --prefix door/server test -- tests/inventory-twin.routes.test.js`

Expected: FAIL because the route module does not exist yet.

**Step 3: Write the minimal implementation**

Create the new sub-router and mount it under the existing inventory router:

```js
// in inventory.routes.js
router.use('/twin', twinRoutes);
```

Expose these endpoints exactly:

```js
GET    /api/inventory/twin/warehouses
POST   /api/inventory/twin/warehouses
PUT    /api/inventory/twin/warehouses/:id
GET    /api/inventory/twin/warehouses/:id/layout
PUT    /api/inventory/twin/warehouses/:id/layout

GET    /api/inventory/twin/rack-templates
POST   /api/inventory/twin/rack-templates
PUT    /api/inventory/twin/rack-templates/:id

GET    /api/inventory/twin/rack-instances
POST   /api/inventory/twin/rack-instances
PUT    /api/inventory/twin/rack-instances/:id

GET    /api/inventory/twin/locations
POST   /api/inventory/twin/locations
PUT    /api/inventory/twin/locations/:id
POST   /api/inventory/twin/locations/batch-generate
POST   /api/inventory/twin/locations/batch-generate-qr

GET    /api/inventory/twin/item-shapes
POST   /api/inventory/twin/item-shapes
PUT    /api/inventory/twin/item-shapes/:id

GET    /api/inventory/twin/objects
POST   /api/inventory/twin/objects
PUT    /api/inventory/twin/objects/:id

POST   /api/inventory/twin/bindings/scan
POST   /api/inventory/twin/bindings/move
POST   /api/inventory/twin/bindings/unbind

GET    /api/inventory/twin/scene/:warehouseId
GET    /api/inventory/twin/events
```

All responses must remain:

```js
{ success: true, data }
```

**Step 4: Re-run the test**

Run: `npm --prefix door/server test -- tests/inventory-twin.routes.test.js`

Expected: PASS.

---

### Task 4: Implement QR entity generation and scan-binding transaction

**Files:**
- Create: `door/server/src/modules/inventory/inventory.twin.binding.js`
- Modify: `door/server/src/modules/inventory/inventory.twin.repository.js`
- Modify: `door/server/src/modules/inventory/inventory.twin.service.js`
- Create: `door/server/tests/inventory-twin-binding.test.js`

**Step 1: Write the failing binding test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('scan binding creates one active binding, updates legacy location fields, and rejects duplicates', async () => {
  assert.fail('not implemented');
});
```

**Step 2: Run the focused test**

Run: `npm --prefix door/server test -- tests/inventory-twin-binding.test.js`

Expected: FAIL because the binding transaction does not exist yet.

**Step 3: Write the minimal implementation**

Binding flow must be one transaction:

```js
// 1. resolve objectQr and locationQr through qr_entities
// 2. verify entity types are inventory_object and location
// 3. verify same org_id
// 4. verify location is not locked
// 5. verify dimensions and weight fit the location
// 6. close previous location_bindings row if active
// 7. insert new location_bindings row
// 8. update inventory_objects.current_location_id and current_warehouse_id
// 9. if source_unit_id exists, update org_inventory_units.location_id and warehouse_id
// 10. update warehouse_locations.used_capacity and status
// 11. insert inventory_transactions row with transaction_type = 'transfer' or 'inbound'
// 12. insert twin_events row
```

QR generation rules:

```js
// location QR prefix: LOC-
// object QR prefix: OBJ-
// batch QR prefix: BAT-
// payload version starts at 1
```

**Step 4: Re-run the binding test**

Run: `npm --prefix door/server test -- tests/inventory-twin-binding.test.js`

Expected: PASS.

---

### Task 5: Add scene aggregation and event feed

**Files:**
- Create: `door/server/src/modules/inventory/inventory.twin.scene.js`
- Modify: `door/server/src/modules/inventory/inventory.twin.service.js`
- Create: `door/server/tests/inventory-twin.scene.test.js`

**Step 1: Write the failing scene test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('scene endpoint returns warehouse, zones, rack instances, locations, objects, and sceneVersion', async () => {
  assert.fail('not implemented');
});
```

**Step 2: Run the focused test**

Run: `npm --prefix door/server test -- tests/inventory-twin.scene.test.js`

Expected: FAIL because the scene aggregation service does not exist yet.

**Step 3: Write the minimal implementation**

```js
// getTwinScene(warehouseId):
// - warehouse core fields + dimensions_mm + layout_json + scene_version
// - zones scoped to warehouse
// - rack_instances scoped to warehouse
// - warehouse_locations scoped to warehouse
// - inventory_objects where current_warehouse_id = warehouseId
// - latest unresolved twin_events summary limited to 100
```

The scene endpoint should return a compact shape optimized for the viewer:

```js
{
  warehouse,
  zones,
  racks,
  locations,
  objects,
  alerts: [],
  version: warehouse.scene_version
}
```

**Step 4: Re-run the scene test**

Run: `npm --prefix door/server test -- tests/inventory-twin.scene.test.js`

Expected: PASS.

---

### Task 6: Extend the shared frontend API layer and admin navigation

**Files:**
- Modify: `door/src/services/inventoryApi.js`
- Modify: `door/src/components/admin/AdminLayout.jsx`
- Create: `door/src/views/inventory/TwinWarehouseDesigner.jsx`
- Create: `door/src/views/inventory/TwinWarehouseViewer.jsx`
- Create: `door/src/views/inventory/TwinScanBindingPanel.jsx`

**Step 1: Extend the API client**

Add a `twinApi` export with:

```js
getWarehouses
createWarehouse
updateWarehouse
getWarehouseLayout
saveWarehouseLayout
getRackTemplates
createRackTemplate
updateRackTemplate
getRackInstances
createRackInstance
updateRackInstance
getLocations
createLocation
updateLocation
batchGenerateLocations
batchGenerateLocationQrs
getItemShapes
createItemShape
updateItemShape
getObjects
createObject
updateObject
scanBind
moveBinding
unbindBinding
getScene
getEvents
```

**Step 2: Add new admin routes**

Add these pages under the existing inventory menu:

```jsx
/admin/inventory/twin/designer
/admin/inventory/twin/viewer
/admin/inventory/twin/bind
```

Add menu labels:

```txt
3D设计
3D查看
库位绑定
```

**Step 3: Run the frontend build**

Run: `npm --prefix door run build`

Expected: PASS with route stubs and API client wiring.

---

### Task 7: Implement the 3D viewer first

**Files:**
- Modify: `door/src/views/inventory/TwinWarehouseViewer.jsx`
- Create: `door/src/components/inventory/twin/TwinSceneCanvas.jsx`
- Create: `door/src/components/inventory/twin/TwinLegend.jsx`
- Create: `door/src/components/inventory/twin/TwinFilters.jsx`

**Step 1: Build the minimal viewer**

Viewer requirements:

```jsx
// - warehouse selector
// - top / side / perspective camera toggles
// - status filters: empty / occupied / locked
// - click location -> details panel
// - highlight the last bound object if present in query params
```

3D rendering rules:

```jsx
// warehouse = floor plane + bounds wireframe
// zones = colored translucent rectangles
// rack instances = parameterized box structures
// locations = small slot boxes
// objects = box / bin / drum primitives
// empty/occupied/locked use distinct colors
```

**Step 2: Run the frontend build**

Run: `npm --prefix door run build`

Expected: PASS.

---

### Task 8: Implement the 3D designer

**Files:**
- Modify: `door/src/views/inventory/TwinWarehouseDesigner.jsx`
- Create: `door/src/components/inventory/twin/TwinDesignerSidebar.jsx`
- Create: `door/src/components/inventory/twin/TwinPropertiesPanel.jsx`

**Step 1: Build the minimal designer**

Designer responsibilities:

```jsx
// - edit warehouse dimensions
// - create and edit warehouse zones
// - create rack instances from rack templates
// - drag rack instances on the floor plane
// - batch-generate locations for a rack instance
// - save layout_json
```

Do not implement freeform mesh editing. Keep all edits form-driven plus constrained drag positioning.

**Step 2: Run the frontend build**

Run: `npm --prefix door run build`

Expected: PASS.

---

### Task 9: Implement the scan binding page and connect it to the viewer

**Files:**
- Modify: `door/src/views/inventory/TwinScanBindingPanel.jsx`
- Modify: `door/src/views/inventory/TwinWarehouseViewer.jsx`

**Step 1: Build the minimal scan binding flow**

Requirements:

```jsx
// - manual input and camera scan support
// - scan location first, then object
// - show validation error or success state
// - on success navigate to viewer with warehouseId + locationId + objectId highlight context
```

Use the same browser QR support already used by `ScanPickup` and do not create a second QR scanning approach.

**Step 2: Run the frontend build**

Run: `npm --prefix door run build`

Expected: PASS.

---

### Task 10: Integrate phase1 into current WMS pages without replacing them

**Files:**
- Modify: `door/src/views/inventory/WarehouseManager.jsx`
- Modify: `door/src/views/inventory/BatchInbound.jsx`
- Modify: `door/src/views/inventory/QRCodePrinter.jsx`

**Step 1: Add the minimal integration**

`WarehouseManager`:

```jsx
// add 3D design and 3D view actions per selected warehouse
```

`BatchInbound`:

```jsx
// allow choosing target warehouse for twin object creation
// after unit creation, create matching inventory_objects for unit-level objects
```

`QRCodePrinter`:

```jsx
// add printing mode toggle:
// - unit QR
// - location QR
```

Do not remove any current path from the legacy workflow.

**Step 2: Run the frontend build**

Run: `npm --prefix door run build`

Expected: PASS.

---

### Task 11: Add focused regression and concurrency coverage

**Files:**
- Create: `door/server/tests/inventory-twin.integration.test.js`
- Create: `door/docs/plans/wms-digital-twin-phase1-regression-checklist.md`

**Step 1: Add the regression checklist**

```md
# WMS Digital Twin Phase 1 Regression Checklist
- 创建多个仓库并维护不同 3D 尺寸
- 创建货架模板并生成货架实例
- 批量生成库位并打印库位二维码
- 创建箱体、料箱、圆桶三种规格
- 单件对象与旧 org_inventory_units 一一映射
- 扫描库位码 + 货物码绑定成功
- 重复绑定、跨仓绑定、超尺寸绑定被拒绝
- 绑定后旧库存总览、报表、盘点仍可读取位置数据
- 3D 查看页能正确高亮最新绑定结果
```

**Step 2: Add the integration test**

Cover:

```js
// - create warehouse + rack template + rack instance + locations
// - create unit + inventory_object + qr_entities
// - bind object to location
// - verify legacy unit location fields updated
// - verify second concurrent bind fails
```

**Step 3: Run the server tests**

Run:

```bash
npm --prefix door/server test -- tests/inventory-twin-schema.test.js tests/inventory-twin.repository.test.js tests/inventory-twin.routes.test.js tests/inventory-twin-binding.test.js tests/inventory-twin.scene.test.js tests/inventory-twin.integration.test.js
```

Expected: PASS.

---

### Task 12: Full verification and rollout gate

**Files:**
- Modify: `door/docs/plans/2026-03-21-wms-digital-twin-design.md`
- Create: `door/docs/plans/2026-03-21-wms-digital-twin-phase1-implementation-plan.md`

**Step 1: Run full project verification**

Run:

```bash
npm --prefix door/server test
npm --prefix door run build
```

Expected: PASS.

**Step 2: Verify the old WMS routes still build and load**

Manual checks:

```txt
/admin/inventory
/admin/inventory/inbound
/admin/inventory/scan
/admin/inventory/print
/admin/inventory/warehouses
/admin/inventory/stocktaking
/admin/inventory/reports
/admin/inventory/twin/designer
/admin/inventory/twin/viewer
/admin/inventory/twin/bind
```

**Step 3: Rollout condition**

Only ship phase1 when all of the following are true:

```txt
- twin schema migrations pass on a clean database
- scan binding double-write remains consistent
- concurrency test passes
- legacy inventory pages still work
- frontend 3D pages load on at least one realistic warehouse fixture
```
