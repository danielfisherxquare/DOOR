# DOOR Design Requests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the DOOR design request collaboration app across ops, admin, and app surfaces with manager approval before designer work.

**Architecture:** Add one backend domain module shared by the three surfaces, with scoped Express mounts and Knex tables. Add one frontend API client and three React pages that reuse the same request/detail components but expose different actions per surface.

**Tech Stack:** React 19, Vite, Express, Knex, PostgreSQL, node:test, Playwright/browser validation.

---

### Task 1: Backend Contract Tests

Files:

- Create: server/tests/design-requests.routes.test.js
- Create: server/src/modules/design-requests/design-request.defaults.js
- Create: server/src/modules/design-requests/design-request.service.js
- Create: server/src/modules/design-requests/design-request.routes.js

Step 1: Write failing tests.

Cover:

- default templates are returned for marathon, trail, aquatic, and orienteering.
- POST /api/ops/design-requests/requests creates a pending_review request with reference assets.
- POST /api/app/design-requests/requests/:id/start rejects pending requests.
- POST /api/admin/design-requests/requests/:id/review approves and assigns a designer.
- POST /api/app/design-requests/requests/:id/assets uploads a deliverable and moves status to design_uploaded.

Step 2: Run test to verify RED.

Run: cd server && npm test -- design-requests.routes.test.js

Expected: fail because the design-request routes do not exist.

### Task 2: Database Migration

Files:

- Create: server/src/db/migrations/20260610000001_create_design_request_tables.js

Step 1: Add tables.

Create:

- design_request_templates
- design_requests
- design_request_assets
- design_request_reviews

Step 2: Run backend test.

Run: cd server && npm test -- design-requests.routes.test.js

Expected: still fail because service/routes are not implemented.

### Task 3: Backend Service And Routes

Files:

- Create: server/src/modules/design-requests/design-request.defaults.js
- Create: server/src/modules/design-requests/design-request.service.js
- Create: server/src/modules/design-requests/design-request.routes.js
- Modify: server/src/app.js

Step 1: Implement service.

Implement listTemplates, createTemplate, createTemplateFromRequest, listRequests, getRequest, createRequest, reviewRequest, startDesign, addAsset, and getStats.

Step 2: Mount routes.

Mount /api/ops/design-requests, /api/admin/design-requests, and /api/app/design-requests.

Step 3: Run backend test.

Run: cd server && npm test -- design-requests.routes.test.js

Expected: pass.

### Task 4: Frontend API Client

Files:

- Create: src/services/designRequestApi.js

Step 1: Add client methods for templates, requests, review, start, assets, and stats.

### Task 5: Shared Frontend UI

Files:

- Create: src/views/design-requests/DesignRequestWorkspace.jsx
- Create: src/views/design-requests/design-request-workspace.css

Step 1: Build shared workspace.

Props:

- surface: app, ops, or admin
- mode: designer, requester, or manager

Visible states:

- stats cards
- request table
- detail preview panel
- submit form in ops mode
- review controls in admin mode
- start/upload controls in app mode

### Task 6: Surface Routes And Navigation

Files:

- Modify: src/components/app/AppLayout.jsx
- Modify: src/components/app/appConfig.js
- Modify: src/components/admin/AdminLayout.jsx
- Modify: src/components/admin/adminConfig.js
- Modify: src/components/ops/OpsLayout.jsx
- Modify: src/components/ops/opsConfig.js

Step 1: Add lazy routes.

Routes:

- /app/design-requests
- /admin/design-requests
- /ops/design-requests

Step 2: Add nav entries.

Labels:

- 应用层：设计工作台
- 管理层：设计需求
- 执行层：设计需求

### Task 7: Build And Visual Verification

Files:

- No production files unless fixes are needed.

Step 1: Run tests and build.

Run: cd server && npm test -- design-requests.routes.test.js

Run: npm run build

Step 2: Start services.

Run: cd server && npm run dev

Run: npm run dev -- --host 127.0.0.1

Step 3: Browser QA.

Target flow: /ops/design-requests submit request, /admin/design-requests approve, /app/design-requests start and upload, then status changes to design_uploaded.

Check desktop and mobile:

- page is not blank
- no Vite or React overlay
- console has no relevant errors
- table and detail preview are visible
- controls change visible state
- text does not overlap at 390px mobile width
