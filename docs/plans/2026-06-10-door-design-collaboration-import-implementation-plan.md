# ArcSpro Design Collaboration Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Excel collaboration-list import to the ArcSpro design request workflow so ops users can upload the common “搭建&设计清单” workbook, review parsed rows, complete missing fields, and sync design-marked rows into the existing approval workflow.

**Architecture:** Keep the existing design_requests approval model intact. Add import batch and import item tables to preserve the full Excel context, then create design_requests only for ready rows marked 设计=✅.

**Tech Stack:** Express, Knex, PostgreSQL, ExcelJS, React, Axios, Vite.

---

### Task 1: Backend Import Test

**Files:**
- Modify: server/tests/design-requests.routes.test.js

**Steps:**
1. Create an in-memory Excel workbook with headers from 搭建&设计清单.xlsx.
2. Add one non-design row, one design row missing required fields, and one design row with department/person/due date.
3. POST the file to /api/ops/design-requests/imports/preview.
4. Assert row counts and sync statuses.
5. PATCH the missing row.
6. POST /commit.
7. Assert generated requests are pending_review.

Run:

    cd /Users/xquare/scratch/door/server
    DATABASE_URL=postgres://door:door_dev@localhost:5432/door_test npm test -- tests/design-requests.routes.test.js

Expected first run: fails with 404 for /imports/preview.

### Task 2: Database Migration

**Files:**
- Create: server/src/db/migrations/20260610000002_create_design_collaboration_import_tables.js

**Steps:**
1. Create design_collaboration_imports.
2. Create design_collaboration_items.
3. Add indexes for race, import, sync status, and generated request id.
4. Keep migration idempotent with hasTable.

### Task 3: Excel Parser And Import Service

**Files:**
- Create: server/src/modules/design-requests/design-collaboration-import.service.js
- Modify: server/src/modules/design-requests/design-request.routes.js

**Steps:**
1. Parse .xlsx with ExcelJS.
2. Locate the header row by required names: 使用区域, 项目, 设计.
3. Fill merged or blank 使用区域 values from previous non-empty area.
4. Normalize rows into import items.
5. Mark 设计=✅ rows as needs_info if missing department/person/due date, otherwise ready.
6. Persist import batch and items.
7. Add PATCH item to update missing fields and recompute status.
8. Add commit to create design_requests for ready items.

### Task 4: Frontend API Contract

**Files:**
- Modify: src/services/designRequestApi.js

**API methods:**
- previewImport(surface, formData)
- getImports(surface, params)
- getImport(surface, importId)
- updateImportItem(surface, importId, itemId, payload)
- commitImport(surface, importId, payload)

**Error handling:**
- Show parser errors as upload-panel errors.
- Keep existing auth invalidation in src/utils/request.js.
- Disable commit when no ready rows are selected.

### Task 5: Ops Workspace Layout

**Files:**
- Modify: src/views/design-requests/DesignRequestWorkspace.jsx
- Modify: src/views/design-requests/design-request-workspace.css

**Steps:**
1. In requester mode, replace the top form-first layout with a collaboration import panel.
2. Add summary cards for total rows, design rows, ready, needs info, synced.
3. Add row table with filters: all, design, needs_info, ready, synced, ignored.
4. Add detail panel with build context and design fields.
5. Add inline edit controls for department, requester, due time, priority, design note.
6. Keep manual single-demand form available behind a secondary section.

### Task 6: Verification

Run:

    cd /Users/xquare/scratch/door/server
    DATABASE_URL=postgres://door:door_dev@localhost:5432/door_test npm test -- tests/design-requests.routes.test.js
    cd /Users/xquare/scratch/door
    npm run build

Browser check:

1. Open http://127.0.0.1:5174/ops/design-requests?raceId=1.
2. Upload /Users/xquare/Desktop/搭建&设计清单.xlsx.
3. Confirm 90 effective rows and 21 design rows.
4. Complete one needs_info row.
5. Commit it.
6. Open admin design requests and verify the generated request appears as 待主管审核.
