# ArcSpro Workspace Surface Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the medium refactor for ArcSpro workspace selection and independent App, Execute, and Admin surfaces.

**Architecture:** Add a single workspace session as the source of org/race context, then make `/app`, `/ops`, and `/admin` read that context instead of each layout resolving query state. Keep one repository and one backend, but enforce surface boundaries through route config, tests, API prefixes, and feature-level shared modules.

**Tech Stack:** React 19, React Router, Zustand, Vite, Node built-in test runner, Express backend modules.

---

## Preconditions

- Read `docs/plans/2026-06-11-arcspro-workspace-surface-refactor-design.md` first.
- Run from `/Users/xquare/scratch/door`.
- Current dirty files may contain user work. Do not revert unrelated changes.
- Use `apply_patch` for manual edits.
- Use @test-driven-development before code changes.
- Use @ui-component-design before React UI work.
- Use @api-integration before backend/API client changes.
- Do not commit unless the user explicitly asks for commits in this session.

## Task 1: Add Boundary Inventory Tests

**Files:**
- Create: `tests/surfaceBoundaries.test.js`
- Modify: `package.json`

**Step 1: Write the failing tests**

Create `tests/surfaceBoundaries.test.js` with checks that prevent the known regressions:

~~~js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

describe('surface boundaries', () => {
  it('does not import admin views from app or ops components', () => {
    const files = globSync('src/components/{app,ops}/**/*.{js,jsx}')
    const offenders = files.filter((file) => read(file).includes('views/admin'))
    assert.deepEqual(offenders, [])
  })

  it('does not expose cross-surface links inside ops navigation config', () => {
    const source = read('src/components/ops/opsConfig.js')
    assert.equal(source.includes('/app/'), false)
    assert.equal(source.includes('/admin/'), false)
  })

  it('does not remap app or ops business calls to admin APIs', () => {
    const source = read('src/utils/request.js')
    for (const path of ['/records', '/lottery', '/bib', '/clothing', '/import-sessions']) {
      assert.equal(source.includes(path), false)
    }
  })
})
~~~

If `globSync` is unavailable in the current Node runtime, replace it with a small recursive `readdirSync` helper.

**Step 2: Add a script**

Add to `package.json`:

~~~json
"test:surfaces": "node --test tests/surfaceContext.test.js tests/moduleAccess.test.js tests/surfaceBoundaries.test.js"
~~~

**Step 3: Run the test and verify it fails**

Run:

~~~bash
npm run test:surfaces
~~~

Expected: FAIL on current cross-surface imports and legacy remaps.

## Task 2: Introduce Workspace Session Core

**Files:**
- Create: `src/features/workspace/workspaceSession.js`
- Create: `tests/workspaceSession.test.js`
- Modify: `package.json`

**Step 1: Write the failing tests**

Create `tests/workspaceSession.test.js`:

~~~js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceSession, resolveWorkspaceFromLegacyContext } from '../src/features/workspace/workspaceSession.js'

describe('workspace session', () => {
  it('stores org, race, surface, and last paths in one object', () => {
    const session = createWorkspaceSession({
      orgId: 'org-1',
      orgName: '中奥资源',
      raceId: 'race-1',
      raceName: '测试赛事',
      surface: 'app',
    })

    assert.equal(session.orgId, 'org-1')
    assert.equal(session.raceId, 'race-1')
    assert.equal(session.lastAppPath, '/app')
    assert.equal(session.lastOpsPath, '/ops')
    assert.equal(session.lastAdminPath, '/admin')
  })

  it('uses legacy query only as migration input', () => {
    const session = resolveWorkspaceFromLegacyContext({
      queryOrgId: 'org-url',
      queryRaceId: 'race-url',
      user: { preferences: { lastOrgId: 'org-pref', lastRaceId: 'race-pref' } },
    })

    assert.equal(session.orgId, 'org-url')
    assert.equal(session.raceId, 'race-url')
  })
})
~~~

**Step 2: Implement minimal core**

`src/features/workspace/workspaceSession.js` should export pure helpers first:

~~~js
const DEFAULT_PATHS = {
  app: '/app',
  ops: '/ops',
  admin: '/admin',
}

export function createWorkspaceSession(input = {}) {
  return {
    orgId: input.orgId ? String(input.orgId) : '',
    orgName: input.orgName || '',
    raceId: input.raceId ? String(input.raceId) : '',
    raceName: input.raceName || '',
    surface: input.surface || 'app',
    lastAppPath: input.lastAppPath || DEFAULT_PATHS.app,
    lastOpsPath: input.lastOpsPath || DEFAULT_PATHS.ops,
    lastAdminPath: input.lastAdminPath || DEFAULT_PATHS.admin,
  }
}

export function resolveWorkspaceFromLegacyContext({ queryOrgId, queryRaceId, user }) {
  return createWorkspaceSession({
    orgId: queryOrgId || user?.preferences?.lastOrgId || user?.orgId || '',
    raceId: queryRaceId || user?.preferences?.lastRaceId || '',
  })
}
~~~

**Step 3: Run tests**

Run:

~~~bash
node --test tests/workspaceSession.test.js
npm run test:surfaces
~~~

Expected: workspace test PASS; surface test may still fail until later tasks.

## Task 3: Add Workspace Store, Selector, and Launcher

**Files:**
- Create: `src/features/workspace/workspaceStore.js`
- Create: `src/views/workspace/WorkspaceSelectPage.jsx`
- Create: `src/views/workspace/LauncherPage.jsx`
- Modify: `src/App.jsx`
- Test: add cases to `tests/workspaceSession.test.js`

**Step 1: Extend tests for persistence shape**

Add tests that verify `serializeWorkspaceSession` and `parseWorkspaceSession` keep org/race/surface and reject empty objects.

**Step 2: Implement store**

Use Zustand with localStorage. Keep the API small:

~~~js
export const useWorkspaceStore = create((set, get) => ({
  session: null,
  setWorkspaceSession: (session) => set({ session: createWorkspaceSession(session) }),
  clearWorkspaceSession: () => set({ session: null }),
  rememberSurfacePath: (surface, path) => {
    const current = get().session
    if (!current) return
    const key = surface === 'ops' ? 'lastOpsPath' : surface === 'admin' ? 'lastAdminPath' : 'lastAppPath'
    set({ session: { ...current, [key]: path } })
  },
}))
~~~

**Step 3: Add routes**

Add routes before the protected surface routes:

~~~jsx
<Route path="/workspaces" element={<WorkspaceSelectPage />} />
<Route path="/workspaces/select" element={<WorkspaceSelectPage />} />
<Route path="/launcher" element={<LauncherPage />} />
~~~

**Step 4: Build the UI**

Workspace selector should use existing `/profile/context-options` data first. If the API shape is not stable, wrap it in `src/features/workspace/workspaceApi.js` and normalize to:

~~~js
{ organizations: [{ id, name, races: [{ id, name }] }] }
~~~

Launcher should show only surfaces the user can access and route to the last remembered path for that surface.

**Step 5: Run verification**

Run:

~~~bash
node --test tests/workspaceSession.test.js
npm run build
~~~

Expected: PASS.

## Task 4: Make Surface Layouts Read Workspace Session

**Files:**
- Modify: `src/components/app/AppLayout.jsx`
- Modify: `src/components/admin/AdminLayout.jsx`
- Modify: `src/components/ops/OpsLayout.jsx`
- Modify: `src/utils/surfaceContext.js`
- Test: `tests/surfaceContext.test.js`, `tests/workspaceSession.test.js`

**Step 1: Add tests for legacy query migration**

Extend `tests/surfaceContext.test.js` with a case that legacy query values are treated as migration input, not as the long-term page context.

**Step 2: Replace per-layout selection state**

In each layout:

- Remove local `selectedOrgId` and `selectedRaceId` ownership.
- Read `session.orgId` and `session.raceId` from `useWorkspaceStore`.
- If missing, navigate to `/workspaces` with a return URL.
- Keep only a “切换工作区” control in the top bar.

**Step 3: Keep compatibility for old links**

When a surface route has `?orgId=&raceId=`, write those values into workspace session, then replace the URL without the query.

**Step 4: Run verification**

Run:

~~~bash
node --test tests/surfaceContext.test.js tests/workspaceSession.test.js
npm run build
~~~

Expected: PASS.

## Task 5: Isolate Navigation Between App, Execute, and Admin

**Files:**
- Modify: `src/components/app/appConfig.js`
- Modify: `src/components/ops/opsConfig.js`
- Modify: `src/components/admin/adminConfig.js`
- Modify: `src/components/ops/OpsLayout.jsx`
- Test: `tests/moduleAccess.test.js`, `tests/surfaceBoundaries.test.js`

**Step 1: Make tests fail for current cross-links**

Run:

~~~bash
npm run test:surfaces
~~~

Expected: FAIL until cross-surface imports and links are removed.

**Step 2: Remove cross-surface links from business nav**

- Delete app/admin jump links from ops sidebar config or layout.
- Keep surface switching only in the shared top bar or launcher.
- Remove admin priority shortcuts that send users to `/app/credential-center`.

**Step 3: Move credential config entries out of app nav**

App nav should not expose:

- `/app/credential-access-areas`
- `/app/credential-categories`
- `/app/credential-styles`
- `/app/credential-issue`

Admin nav should expose credential rules. Ops nav should expose credential issue.

**Step 4: Run tests**

Run:

~~~bash
npm run test:surfaces
npm run build
~~~

Expected: PASS or only fail on imports planned for Task 6.

## Task 6: Split Credential Feature Across Three Surfaces

**Files:**
- Create: `src/features/credential/`
- Move or wrap from: `src/views/admin/credential/*`
- Modify: `src/components/app/AppLayout.jsx`
- Modify: `src/components/ops/OpsLayout.jsx`
- Modify: `src/components/admin/AdminLayout.jsx`
- Modify: `src/api/credential.js`
- Test: `tests/surfaceBoundaries.test.js`

**Step 1: Create feature exports**

Create feature-level components with explicit names:

~~~text
src/features/credential/admin/CredentialRulesPage.jsx
src/features/credential/app/CredentialRequestsPage.jsx
src/features/credential/app/CredentialReviewPage.jsx
src/features/credential/execute/CredentialIssuePage.jsx
src/features/credential/shared/
~~~

**Step 2: Move behavior by ownership**

- Admin: access areas, categories, style templates, review policy.
- App: request pool, application detail, business review.
- Execute: issue, pickup, scan resolution.

**Step 3: Update API client**

`src/api/credential.js` should resolve these prefixes:

~~~js
const CREDENTIAL_PREFIX_BY_SURFACE = {
  admin: '/admin/credentials',
  app: '/app/credentials',
  ops: '/ops/credentials',
  execute: '/execute/credentials',
}
~~~

Keep `/ops` during compatibility; do not make app or execute call admin endpoints.

**Step 4: Run verification**

Run:

~~~bash
npm run test:surfaces
npm run build
~~~

Expected: no `views/admin/credential` imports from app or ops components.

## Task 7: Split Inventory and Warehouse Ownership

**Files:**
- Create: `src/features/inventory/`
- Modify: `src/views/inventory/*`
- Modify: `src/views/ops/warehouse/*`
- Modify: `src/services/inventoryApi.js`
- Modify: app/admin/ops route configs
- Test: `tests/surfaceBoundaries.test.js`

**Step 1: Define three modes**

Create explicit feature folders:

~~~text
src/features/inventory/admin/
src/features/inventory/app/
src/features/inventory/execute/
src/features/inventory/shared/
~~~

**Step 2: Move behavior by ownership**

- Admin: warehouse master data, rules, alerts, reports.
- App: inventory dashboard, planning, analytics.
- Execute: inbound, outbound, binding, count.

**Step 3: Update `inventoryApi`**

Keep `resolveSurfacePrefix`, but remove any path where execute/app falls back to admin for writes.

**Step 4: Run verification**

Run:

~~~bash
npm run test:surfaces
npm run build
~~~

Expected: ops warehouse imports only feature/shared modules, not app/admin view pages.

## Task 8: Clean API Prefixes and Legacy Request Remaps

**Files:**
- Modify: `server/src/app.js`
- Modify: `src/utils/request.js`
- Modify: `src/api/app/bibTracking.js`
- Modify: app/event API clients found by `rg "/api/admin|request\('/" src/api src/services src/views/app src/views/ops`
- Test: `tests/surfaceBoundaries.test.js`

**Step 1: Add a test for forbidden admin API usage**

Extend `tests/surfaceBoundaries.test.js` to scan `src/api`, `src/services`, `src/views/app`, and `src/views/ops` for direct `/api/admin` calls unless the file is explicitly admin-only.

**Step 2: Add app/execute endpoints before deleting remaps**

Do not delete a remap until the corresponding app or execute endpoint exists.

Initial targets:

- `/api/app/bibs` for app bib tracking.
- `/api/app/events/*` for import, records, lottery, clothing, and business bib planning.
- `/api/execute/credentials` with `/api/ops/credentials` compatibility.
- `/api/execute/warehouse` with `/api/ops/warehouse` compatibility.

**Step 3: Remove legacy remaps one by one**

For each removed mapping:

1. Run the API/client unit test.
2. Run `npm run test:surfaces`.
3. Run `npm run build`.

## Task 9: Redesign Identity Center Permission Pages

**Files:**
- Modify: `server/src/modules/module-access/module-access.registry.js`
- Modify: `server/src/utils/capability-policy.js`
- Modify: `src/utils/moduleAccess.js`
- Modify: `src/views/admin/identity/*`
- Test: `tests/moduleAccess.test.js`

**Step 1: Add tests for role package behavior**

Add cases to `tests/moduleAccess.test.js`:

~~~js
it('does not give org_admin execute modules without explicit app access after refactor flag', () => {
  const user = { role: 'org_admin', moduleAccess: ['admin:dashboard'] }
  assert.equal(hasModuleAccess(user, 'ops', 'scan', { strictSurfaceModules: true }), false)
})
~~~

**Step 2: Introduce strict mode behind a feature flag**

Start with a flag so existing users are not locked out during migration:

~~~js
const strictSurfaceModules = Boolean(user?.preferences?.strictSurfaceModules)
~~~

**Step 3: Replace the matrix landing page**

Identity Center should show:

- 角色包。
- 工作区授权。
- 应用授权。
- 动作授权。

Keep old routes as migration pages until Task 10.

**Step 4: Run verification**

Run:

~~~bash
node --test tests/moduleAccess.test.js
npm run build
~~~

Expected: PASS.

## Task 10: Retire Dead Routes and Duplicate Pages

**Files:**
- Modify: `src/components/admin/AdminLayout.jsx`
- Modify: `src/components/admin/adminConfig.js`
- Delete after verification: `src/views/admin/import/ImportPage.jsx`
- Delete after verification: `src/views/admin/processing/ProcessingCenterPage.jsx`
- Delete after verification: `src/views/admin/records/RecordsPage.jsx`
- Delete after verification: `src/views/admin/lottery/LotteryPage.jsx`
- Delete after verification: `src/views/admin/bib/BibPage.jsx`
- Delete after verification: `src/views/admin/clothing/ClothingPage.jsx`
- Test: `tests/surfaceBoundaries.test.js`

**Step 1: Prove files are unused**

Run:

~~~bash
rg "views/admin/(import|processing|records|lottery|bib|clothing)" src tests server
rg "ImportPage|ProcessingCenterPage|RecordsPage|LotteryPage|BibPage|ClothingPage" src tests server
~~~

Expected: no references after earlier tasks.

**Step 2: Delete only proven-unused files**

Use `apply_patch` delete file hunks. If any reference remains, move the referenced behavior first.

**Step 3: Final verification**

Run:

~~~bash
npm run test:surfaces
npm run check:encoding
npm run build
~~~

Expected: PASS.

## Final Acceptance

- Login without workspace routes to `/workspaces`.
- Selecting org/race routes to `/launcher`.
- `/app/*`, `/ops/*`, and `/admin/*` show the same workspace header after refresh.
- App pages no longer show their own org/race selector.
- Ops pages do not import admin views.
- App pages do not import admin views.
- App and ops clients do not call `/api/admin/*` for business reads/writes.
- Identity Center grants entry access, workspace access, app access, and action access separately.
- Old links with `?orgId=&raceId=` migrate into workspace session and then clean the URL.

## Suggested Manual Smoke

Run the dev server:

~~~bash
npm run dev -- --host 0.0.0.0
~~~

Then verify in browser:

1. `/workspaces` select 中奥资源 + a race.
2. `/launcher` open 应用层, then refresh `/app/design-requests`.
3. Switch to 执行层 and open `/ops/scan`.
4. Switch to 管理层 and open `/admin/identity-center`.
5. Confirm changing workspace from the top bar updates all three surfaces.
