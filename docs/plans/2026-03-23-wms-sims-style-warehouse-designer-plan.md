# WMS Sims-Style Warehouse Designer Execution Plan

## 1. Goal

Build a warehouse design experience that feels closer to a life-sim build mode than a back-office form editor.

The target is not freeform CAD. The target is:

1. Direct manipulation on canvas
2. Fast object placement with clear visual feedback
3. Low cognitive load for warehouse managers
4. Structured, parameterized data that still fits the existing DOOR twin backend

This plan is written to be directly executable against the current DOOR codebase.

---

## 2. Current UX Diagnosis

Based on the current implementation in:

- `door/src/views/inventory/TwinWarehouseDesigner.jsx`
- `door/src/components/inventory/TwinSceneCanvas.jsx`
- `door/src/views/inventory/TwinWarehouseViewer.jsx`

the main UX problems are:

1. The designer is still form-first, not canvas-first.
2. `layout_json` is exposed as a primary editing surface, which is powerful but not intuitive.
3. Zone creation, rack placement, and slot generation are split across separate form blocks instead of a single spatial workflow.
4. There is no "place-preview-confirm" interaction loop.
5. There is no strong build mode mental model such as draw, place, rotate, duplicate, delete, undo.
6. The 3D viewer already communicates space better than the designer itself, which means the editing surface is lagging behind the visualization layer.

In short:

The current experience asks users to describe a warehouse.
The target experience should let users build a warehouse.

---

## 3. UX Direction

This plan uses a "Sims-style constrained builder" model.

### 3.1 Interaction Principles

1. Canvas first, forms second
2. Build by pointing, dragging, and placing
3. Properties only appear for the current selection
4. Every placement should have a ghost preview before commit
5. Every invalid action should be visually rejected before save
6. The system should feel toy-like and learnable, not enterprise-heavy and brittle

### 3.2 Target Layout

The designer page should be reorganized into four persistent regions:

1. Top bar
   - warehouse selector
   - save draft
   - publish layout
   - undo / redo
   - mode indicator
2. Left build toolbar
   - select
   - draw zone
   - place rack
   - generate locations
   - move
   - delete
3. Center build canvas
   - top-down orthographic view by default
   - optional perspective preview toggle
   - grid, snap, hover highlight, measurement hints
4. Right inspector panel
   - selected object properties
   - dimensions
   - position
   - rotation
   - template bindings
   - batch generation settings

Optional:

5. Bottom asset tray
   - rack templates
   - zone presets
   - favorite layouts

### 3.3 Required Build Interactions

1. Draw zone by drag
2. Place rack by click
3. Rotate rack with `R`
4. Delete selection with `Delete`
5. Duplicate selection with `Alt + drag` or duplicate button
6. Multi-select with drag rectangle in a later phase
7. Generate slots from selected rack via contextual action
8. Undo / redo from the beginning of the redesign

---

## 4. Product Scope

## Phase A: Buildable MVP

This is the first directly shippable redesign.

Includes:

1. Top-down build canvas
2. Left toolbar
3. Right inspector
4. Zone drawing
5. Rack placement
6. Rack move and rotate
7. Slot generation from selected rack
8. Draft state and save flow

Does not include:

1. Freeform walls or arbitrary mesh editing
2. Curved paths
3. Multi-floor visual editing
4. Real-time multi-user collaboration
5. Physics simulation
6. Smart auto-routing

## Phase B: Fluent Builder

Includes:

1. Asset tray
2. Brush placement for repeated racks
3. Duplicate and align helpers
4. Better snapping and spacing guides
5. Bulk edit of selected racks / zones
6. Template-driven warehouse presets

## Phase C: Advanced Twin Authoring

Includes:

1. Multi-select box
2. Grouping
3. Layer visibility toggles
4. Lock / unlock objects
5. Heatmap and operational overlays inside build mode

---

## 5. Architecture Strategy

Do not rebuild the 3D stack from scratch.

Reuse the current viewer rendering foundation and add an editing layer.

### 5.1 Core Decision

Keep the backend parameterized.

The builder should produce structured data:

1. warehouse dimensions
2. warehouse zones
3. rack instances
4. generated locations
5. layout metadata

Do not store raw scene graph transforms as the source of truth without semantic meaning.

### 5.2 Data Layers

Add two explicit client-side layers:

1. `persistedScene`
   - the last server-confirmed scene
2. `draftScene`
   - local editable state with unsaved changes

The UI always edits `draftScene`.
Save commits `draftScene` to the existing twin APIs.

### 5.3 Suggested Frontend Modules

Create:

- `door/src/stores/twinDesignerStore.js`
- `door/src/components/inventory/designer/TwinDesignerCanvas.jsx`
- `door/src/components/inventory/designer/TwinDesignerToolbar.jsx`
- `door/src/components/inventory/designer/TwinDesignerInspector.jsx`
- `door/src/components/inventory/designer/TwinDesignerTopbar.jsx`
- `door/src/components/inventory/designer/TwinAssetTray.jsx`
- `door/src/components/inventory/designer/TwinSelectionGizmo.jsx`
- `door/src/components/inventory/designer/TwinPlacementGhost.jsx`
- `door/src/components/inventory/designer/TwinSnapGrid.jsx`
- `door/src/components/inventory/designer/designerMath.js`
- `door/src/components/inventory/designer/designerCommands.js`

Modify:

- `door/src/views/inventory/TwinWarehouseDesigner.jsx`
- `door/src/components/inventory/TwinSceneCanvas.jsx`
- `door/src/services/inventoryApi.js`

Optional backend additions for a cleaner save path:

- `POST /api/inventory/twin/designer/commit`
- or keep current APIs and perform ordered save batches from frontend in Phase A

---

## 6. UIUX Rules

These are mandatory, not optional polish.

### 6.1 Make the page feel like a builder, not a CRUD panel

1. Default to orthographic top view in build mode
2. Use a visible grid and snap points
3. Use hover states and ghost previews everywhere
4. Make the primary action always spatial
5. Move dense forms into the inspector only

### 6.2 Strong affordance

1. Objects must highlight on hover
2. Selected objects need a visible bounding outline
3. Invalid placement should glow red
4. Valid placement should glow cyan or green
5. Rotation state should be obvious before commit

### 6.3 Reduce cognitive load

1. Only show controls relevant to the current mode
2. Replace raw JSON with guided actions
3. Use contextual microcopy such as:
   - "Drag to draw zone"
   - "Click floor to place rack"
   - "Press R to rotate"
4. Keep labels concise and operational

### 6.4 Visual direction

Avoid generic dark neon admin UI.

Recommended direction:

1. bright neutral canvas
2. industrial utility palette
3. strong object-state colors
4. clean drafting-grid feel
5. bold but restrained typography

This should feel like:

1. warehouse planning software
2. game-like build mode
3. trustworthy operational tool

It should not feel like:

1. CAD
2. spreadsheet with a 3D panel
3. generic AI admin dashboard

---

## 7. Execution Plan

## Milestone 1: Replace form-first shell with builder-first shell

### Goal

Turn `TwinWarehouseDesigner` into a real build workspace.

### Changes

Modify:

- `door/src/views/inventory/TwinWarehouseDesigner.jsx`

Create:

- `door/src/components/inventory/designer/TwinDesignerTopbar.jsx`
- `door/src/components/inventory/designer/TwinDesignerToolbar.jsx`
- `door/src/components/inventory/designer/TwinDesignerInspector.jsx`

### Deliverables

1. New page layout with topbar, left toolbar, center canvas, right inspector
2. Existing warehouse/rack/zone forms moved into inspector
3. `layout_json` hidden behind an "Advanced JSON" disclosure block

### Validation

Run:

```bash
npm --prefix door run build
```

Acceptance:

1. no primary editing section is a free text JSON box
2. the canvas is the visual center of the page
3. the inspector only shows selected-context controls

---

## Milestone 2: Add draft state and command model

### Goal

Make the editor local-first and reversible.

### Changes

Create:

- `door/src/stores/twinDesignerStore.js`
- `door/src/components/inventory/designer/designerCommands.js`

### Store responsibilities

```js
// mode: select | zone | rack | slots | delete
// persistedScene
// draftScene
// selectedIds
// hoveredId
// activeTemplateId
// command history
// undo
// redo
// dirty flag
```

### Deliverables

1. local draft scene
2. undo / redo
3. mode switching
4. selection state separated from server payload

### Acceptance

1. changing selection does not trigger network requests
2. dragging a rack does not auto-save
3. undo restores the previous spatial state

---

## Milestone 3: Implement zone drawing

### Goal

Replace zone forms with drag-to-draw rectangles.

### Changes

Create:

- `door/src/components/inventory/designer/TwinDesignerCanvas.jsx`
- `door/src/components/inventory/designer/TwinPlacementGhost.jsx`
- `door/src/components/inventory/designer/TwinSnapGrid.jsx`

Reuse:

- geometry conversion patterns from `TwinSceneCanvas.jsx`

### Interaction

1. choose "draw zone"
2. click and drag on floor plane
3. show live ghost rectangle
4. release to create draft zone
5. inspector edits code, name, type, exact dimensions

### Save path

Use existing:

- `GET /inventory/twin/warehouse-zones`
- `POST /inventory/twin/warehouse-zones`
- `PUT /inventory/twin/warehouse-zones/:id`

### Acceptance

1. zones are drawable without filling a creation form first
2. zone type color updates immediately
3. zone draft can be cancelled before commit

---

## Milestone 4: Implement rack placement and manipulation

### Goal

Place racks like objects in a build game.

### Changes

Create:

- `door/src/components/inventory/designer/TwinSelectionGizmo.jsx`

Modify:

- `door/src/components/inventory/TwinSceneCanvas.jsx`

### Interaction

1. choose rack mode
2. select rack template from asset tray or toolbar
3. move cursor over floor to see ghost rack
4. click to place
5. drag selected rack to move
6. press `R` to rotate by 90 degrees
7. delete selected rack

### Constraints

1. snap to grid
2. reject overlap with warehouse bounds
3. reject overlap with locked zones or incompatible regions in Phase B

### Acceptance

1. rack placement takes one click after template selection
2. ghost preview updates live while moving cursor
3. invalid placements show visual rejection before save

---

## Milestone 5: Implement location generation as contextual action

### Goal

Generate slots from a selected rack instead of making users fill slot batch forms detached from space.

### Interaction

1. select a rack
2. inspector shows "Generate Locations"
3. choose rule:
   - levels
   - bays
   - slot dimensions
   - capacity
4. show generated preview boxes
5. confirm to create draft locations

### Save path

Reuse existing:

- `POST /inventory/twin/locations/batch-generate`

### Acceptance

1. slot generation is anchored to a selected rack
2. users can preview generation before commit
3. slots appear spatially consistent with rack orientation

---

## Milestone 6: Add publish flow

### Goal

Commit draft changes safely.

### Option A: Frontend-orchestrated save

For Phase A, save in this order:

1. warehouse update
2. zones upsert
3. rack instances upsert
4. slot batch generation or location updates
5. layout snapshot save

### Option B: Backend commit endpoint

Preferred in Phase B:

```txt
POST /api/inventory/twin/designer/commit
```

Payload:

```js
{
  warehouseId,
  sceneVersion,
  zones,
  racks,
  locations,
  layoutJson
}
```

This would improve atomicity and conflict handling.

### Acceptance

1. save is explicit
2. user sees changed count and save result
3. save failures map back to objects when possible

---

## 8. Suggested Task Breakdown

### Task 1

Refactor `TwinWarehouseDesigner.jsx` into builder layout shell.

### Task 2

Add `twinDesignerStore` with draft scene, selection, mode, and history.

### Task 3

Build orthographic designer canvas with pointer picking and floor-plane projection.

### Task 4

Implement zone draw mode.

### Task 5

Implement rack placement mode and rotate / delete shortcuts.

### Task 6

Add right-side inspector for selected warehouse, zone, rack, or location.

### Task 7

Add slot generation preview and confirm flow.

### Task 8

Implement explicit publish flow and dirty-state warnings.

### Task 9

Add polish:

1. hover outlines
2. placement ghost
3. snap lines
4. empty-state hints
5. keyboard shortcut help

---

## 9. Test Plan

### Unit / Interaction

1. selecting a mode updates toolbar and cursor state
2. drawing a zone creates the expected draft bounds
3. rotating a rack changes orientation by 90 degrees
4. undo / redo restores scene state deterministically
5. invalid placements do not enter the draft scene

### Integration

1. create warehouse -> draw zone -> place rack -> generate locations -> save
2. reload the page and confirm the saved scene is reproduced
3. generated locations still bind correctly via QR flow
4. viewer renders the scene produced by the new designer

### Manual UX Checks

1. new user can create first zone without reading documentation
2. new user can place first rack within 30 seconds
3. no step requires editing raw JSON in normal flow
4. users can visually tell why a placement failed

---

## 10. Risks and Controls

### Risk 1: The builder becomes visually nicer but still data-fragile

Control:

1. keep backend validation
2. save explicitly
3. preserve scene version checks

### Risk 2: The canvas becomes difficult to maintain

Control:

1. isolate scene math
2. isolate command model
3. keep rendering components dumb and stateless

### Risk 3: Too much ambition in one rewrite

Control:

1. ship Milestones 1 to 4 first
2. keep slot generation and atomic publish as follow-up milestones if needed

---

## 11. Recommended First Slice

If starting immediately, implement in this order:

1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 4

This already gets the product from:

"parameter form editor"

to:

"real spatial builder"

without requiring backend redesign.

---

## 12. Definition of Done

Ship the Sims-style designer upgrade only when all of the following are true:

1. a user can create warehouse zones by dragging on canvas
2. a user can place and rotate rack instances directly on canvas
3. the right inspector reflects the selected object
4. undo / redo works for zone and rack operations
5. save does not require editing raw JSON
6. the generated scene remains compatible with current viewer and binding flows
7. the experience feels faster and more intuitive than the current form-first designer

