# ArcSpro OpenFGA AuthZ Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move ArcSpro permission checks behind a single OpenFGA-backed authorization layer, then drive route and frontend visibility from that layer.

**Architecture:** Express calls `requireAuthz()`, which delegates to `server/src/authz`. The authz layer can call real OpenFGA through `@openfga/sdk` or use a local checker for tests and local dev when OpenFGA is not running. Legacy tables remain the migration source and are projected into relationship tuples.

**Tech Stack:** Node.js ESM, Express, Knex/Postgres, React 19, Vite, OpenFGA official `@openfga/sdk`, node:test, Playwright/browser visual verification.

---

### Task 1: AuthZ Object IDs And Local Checker

**Files:**
- Create: `server/src/authz/object-ids.js`
- Create: `server/src/authz/local-checker.js`
- Create: `server/src/authz/model/arcspro.fga`
- Create: `server/tests/authz/local-checker.test.js`

**Step 1: Write failing tests**

Cover:

- `moduleObjectId({ orgId: 'org-1', surface: 'app', moduleId: 'design-requests' })` returns `module:org-1/app/design-requests`.
- User granted `organization:org-1#admin` can enter `surface:org-1/admin`.
- User without `module#granted` cannot open that module even if surface is granted.
- Race operator can enter `surface:race-1001/ops`.

Run:

```bash
node --test server/tests/authz/local-checker.test.js
```

Expected: FAIL because files do not exist.

**Step 2: Implement minimal code**

Implement:

- tuple normalization.
- direct tuple lookup.
- relation expansion needed for the first model: `organization#member/admin/platform_admin`, `race#operator/manager`, `surface#can_enter`, `module#can_open`.

Do not implement generic OpenFGA language parsing.

**Step 3: Verify**

```bash
node --test server/tests/authz/local-checker.test.js
```

Expected: PASS.

### Task 2: Official OpenFGA SDK Adapter

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Create: `server/src/authz/openfga.client.js`
- Create: `server/src/authz/authz.service.js`
- Create: `server/tests/authz/authz-service.test.js`

**Step 1: Install SDK**

```bash
cd server
npm install @openfga/sdk
```

**Step 2: Write failing tests**

Cover:

- Missing OpenFGA env in production throws a startup/config error.
- `AUTHZ_PROVIDER=local` uses local checker.
- `authz.check({ userId, relation, object })` returns a boolean.
- `authz.assert(...)` throws a 403-style error when denied.

Run:

```bash
node --test server/tests/authz/authz-service.test.js
```

Expected: FAIL because service does not exist.

**Step 3: Implement adapter**

Expose:

```js
createAuthzService({ provider, tuples, openfgaConfig })
authz.check({ userId, relation, object })
authz.assert(authContext, { relation, object })
authz.listObjects({ userId, relation, type })
authz.writeTuples({ writes, deletes })
```

Real OpenFGA maps calls to official SDK methods. Local provider uses `local-checker.js`.

**Step 4: Verify**

```bash
node --test server/tests/authz/authz-service.test.js
```

Expected: PASS.

### Task 3: Tuple Projector From Existing Tables

**Files:**
- Create: `server/src/authz/tuple-projector.js`
- Create: `server/tests/authz/tuple-projector.test.js`
- Read: `server/src/utils/capability-policy.js`
- Read: `server/src/modules/module-access/module-access.registry.js`

**Step 1: Write failing tests**

Use fake rows for users, races, `user_race_permissions`, `org_race_permissions`, and `user_module_access`.

Assert:

- `org_admin` becomes `organization#admin`, not global module bypass.
- `race_admin` role defaults become explicit `module#granted` tuples.
- `user_module_access` becomes direct module grants.
- Default modules `app:home` and `app:profile` are explicit module grants.

Run:

```bash
node --test server/tests/authz/tuple-projector.test.js
```

Expected: FAIL.

**Step 2: Implement projector**

Project rows into tuple objects:

```js
{ user: 'user:<id>', relation: 'granted', object: 'module:<scope>/<surface>/<module>' }
```

Keep projection pure. No database access in this file.

**Step 3: Verify**

```bash
node --test server/tests/authz/tuple-projector.test.js
```

Expected: PASS.

### Task 4: AuthZ Profile API

**Files:**
- Create: `server/src/modules/authz/authz.routes.js`
- Create: `server/src/authz/profile.service.js`
- Modify: `server/src/app.js`
- Create: `server/tests/authz/profile-routes.test.js`

**Step 1: Write failing API tests**

Use supertest against Express app with local authz provider.

Cover:

- `GET /api/authz/profile?orgId=<org>` returns visible surfaces and modules.
- User without organization access gets 403.
- Race context adds race-scoped ops modules only when granted.

Run:

```bash
node --env-file-if-exists=server/.env --test server/tests/authz/profile-routes.test.js
```

Expected: FAIL.

**Step 2: Implement route**

Route response shape:

```json
{
  "success": true,
  "data": {
    "orgId": "org_1",
    "raceId": "1001",
    "surfaces": ["app", "admin"],
    "modules": ["app:home", "app:profile", "admin:identity-center"],
    "workspaceScopes": []
  }
}
```

**Step 3: Verify**

```bash
node --env-file-if-exists=server/.env --test server/tests/authz/profile-routes.test.js
```

Expected: PASS.

### Task 5: Route Middleware Migration

**Files:**
- Create: `server/src/middleware/require-authz.js`
- Modify: `server/src/app.js`
- Create: `server/tests/authz/require-authz.test.js`

**Step 1: Write failing tests**

Cover:

- `/api/admin/identity-center` requires `admin:identity-center`.
- `/api/admin/design-requests` requires `admin:design-requests`.
- `/api/ops/design-requests` requires `ops:design-requests`.
- `/api/app/design-requests` requires `app:design-requests`.

Expected: FAIL before middleware exists.

**Step 2: Implement middleware**

`requireAuthz({ surface, moduleId, scope })` builds surface/module object ids from `req.authContext`, `req.query.orgId`, and `req.query.raceId`.

**Step 3: Verify**

```bash
node --test server/tests/authz/require-authz.test.js
```

Expected: PASS.

### Task 6: Frontend Consumes AuthZ Profile

**Files:**
- Modify: `src/stores/authStore.js`
- Modify: `src/utils/moduleAccess.js`
- Modify: `src/features/workspace/workspaceSession.js`
- Modify: `src/components/app/appConfig.js`
- Modify: `src/components/admin/adminConfig.js`
- Test: `tests/moduleAccess.test.js`
- Test: `tests/workspaceSession.test.js`

**Step 1: Write/update failing tests**

Expected behavior:

- `org_admin` does not get all modules from frontend role logic.
- `hasModuleAccess` checks `user.moduleAccess` only, plus explicit default modules already returned by backend.
- Admin nav items can be filtered by module ids.

Run:

```bash
npm run test:surfaces
```

Expected: FAIL until frontend helpers are changed.

**Step 2: Implement frontend data flow**

Keep API call location in existing request/auth store conventions. New call:

```http
GET /api/authz/profile?orgId=<orgId>&raceId=<raceId>
```

On success, set:

```js
user.surfaceAccess
user.moduleAccess
user.authzProfile
```

**Step 3: Verify**

```bash
npm run test:surfaces
npm run build
```

Expected: PASS.

### Task 7: Local Dev And Browser Verification

**Files:**
- No source edits unless verification exposes a bug.
- Screenshots under `tmp/` only.

**Step 1: Start backend and frontend**

```bash
cd server
AUTHZ_PROVIDER=local npm run dev
```

```bash
npm run dev -- --host 127.0.0.1
```

**Step 2: Real browser login**

Use the local dev URL and real stored/local account credentials. Do not mutate production data.

Check:

- Workspace selector renders allowed surfaces.
- `/app` visible modules match `/api/authz/profile`.
- `/ops` hides modules not granted.
- `/admin` hides modules not granted.
- Direct URL to a denied module shows the existing no-access screen.

**Step 3: Final verification commands**

```bash
node --test server/tests/authz/*.test.js
npm run test:surfaces
npm run build
```

**Step 4: Review diff**

```bash
git status --short
git diff -- docs/plans server/src src tests server/tests server/package.json server/package-lock.json
```

Do not commit unless the user explicitly asks.

---

## Execution Record

Implemented on 2026-06-11.

What landed:

- Added the OpenFGA model, official SDK adapter, local dev/test checker, tuple projector, authz profile API, and `requireAuthz()` middleware.
- Kept legacy tables as the migration source, but converted role and table rows into explicit relationship tuples before authorization checks.
- Removed frontend role-based module inference. Frontend surface and module visibility now comes from `/api/authz/profile`.
- Made persisted workspace scope part of profile refresh, so page reloads and direct deep links keep the selected organization/race context.
- Wrapped active admin direct routes with module guards for `dashboard`, `orgs`, `races`, `backups`, `identity-center`, `team`, `design-requests`, `hr`, `finance`, `credentials`, `branding`, `inventory`, and `bib-tracking`.

Verified:

```bash
node --test server/tests/authz/*.test.js
npm run test:surfaces
npm run build
```

Browser verification used local dev servers, `AUTHZ_PROVIDER=local`, and a real local super admin login. In the selected organization-operation workspace, the launcher showed only app/admin entries, admin navigation showed only granted modules, `/ops` rendered the no-access screen, and denied admin direct routes such as `/admin/reimbursements` and `/admin/credential-center` returned to the granted admin entry instead of rendering their business pages.
