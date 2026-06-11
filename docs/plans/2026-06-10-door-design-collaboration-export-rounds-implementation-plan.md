# ArcSpro Design Collaboration Export Rounds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build multi-round standard spreadsheet export and upload diff detection for ArcSpro design collaboration.

**Architecture:** Imports remain immutable batches. A snapshot table stores the latest known row state and timestamps per race. Export rounds freeze selected snapshot rows into downloadable Excel workbooks and become the baseline for later incremental/full-marked exports.

**Tech Stack:** Express routes, Knex migrations, PostgreSQL, ExcelJS, React, Axios.

---

### Task 1: Backend Regression Test

**Files:**
- Modify: `server/tests/design-requests.routes.test.js`

**Steps:**
1. Add a second workbook helper with one changed row and one new category row.
2. Add a test that uploads the first workbook, creates round 1 export, uploads the second workbook, checks import diff counts, creates incremental export, downloads it, and verifies the workbook contains the expected helper headers and changed/new rows.
3. Run `DATABASE_URL=postgres://door:door_dev@localhost:5432/door_test npm test -- tests/design-requests.routes.test.js`.
4. Expected first result: failure because export routes and diff fields do not exist yet.

### Task 2: Migration

**Files:**
- Create: `server/src/db/migrations/20260610000003_design_collaboration_export_rounds.js`

**Steps:**
1. Add diff columns to `design_collaboration_imports`.
2. Add stable key, content hash, change type, first seen, and last changed columns to `design_collaboration_items`.
3. Create `design_collaboration_item_snapshots`.
4. Create `design_collaboration_exports`.
5. Create `design_collaboration_export_items`.
6. Rerun the backend test and confirm it now fails at service/route behavior, not schema.

### Task 3: Import Diff Service

**Files:**
- Modify: `server/src/modules/design-requests/design-collaboration-import.service.js`

**Steps:**
1. Parse optional `系统行键`.
2. Compute stable keys and content hashes for every parsed row.
3. Compare imported rows to current snapshots.
4. Update snapshots and item diff columns in the preview transaction.
5. Extend mapped import/item payloads with diff counts and timestamps.

### Task 4: Export Round Service and Routes

**Files:**
- Modify: `server/src/modules/design-requests/design-collaboration-import.service.js`
- Modify: `server/src/modules/design-requests/design-request.routes.js`
- Modify: `src/services/designRequestApi.js`

**Steps:**
1. Add `listExports`, `createExport`, and `downloadExportWorkbook`.
2. Add routes under `/collaboration-exports` for app/admin/ops surfaces.
3. Generate ExcelJS workbooks with standard headers plus helper columns.
4. Rerun backend tests until green.

### Task 5: Frontend UI

**Files:**
- Modify: `src/views/design-requests/DesignRequestWorkspace.jsx`
- Modify: `src/views/design-requests/design-request-workspace.css`

**Steps:**
1. Add designer export panel with three buttons and latest round summary.
2. Add ops import diff metrics, filters, row badge, and detail timestamps.
3. Use blob download for generated spreadsheets.
4. Run `npm run build`.

### Task 6: Local Migration and Browser Validation

**Steps:**
1. Run `cd server && npm run migrate` against local dev DB.
2. Upload the real spreadsheet and verify diff labels.
3. Open the app/designer route and verify export controls.
4. Confirm no `接口不存在` or `[object Object]` is visible.
