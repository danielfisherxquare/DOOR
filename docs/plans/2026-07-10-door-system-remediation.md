# ArcSpro System Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore a reproducible, secure ArcSpro baseline, then incrementally converge authorization, API contracts, backend modules, frontend surfaces, and GIS/3D code into a verifiable modular monolith.

**Architecture:** Keep one repository and one PostgreSQL database. Separate Web, API, Worker, shared contracts, shared studio models, and test support with npm workspaces only after the clean-install baseline is green. Migrate one vertical slice at a time; the backend remains the authorization authority.

**Tech Stack:** Node.js 20, npm, React 19, Vite 5, Zustand 5, Express 4, PostgreSQL 16, Knex 3, OpenFGA, Node test runner, Playwright, Docker Compose.

---

## Execution rules

- Work only in `/Users/xquare/scratch/door/.worktrees/door-remediation-20260710`.
- Do not copy uncommitted files from the original release worktree wholesale.
- Every behavior change follows red-green-refactor.
- Configuration changes use an executable failing gate as RED and the same gate as GREEN.
- Each commit covers one theme and follows Conventional Commits.
- Do not rewrite Git history, rotate external secrets, deploy, or push without explicit confirmation at that step.
- A phase is complete only after its acceptance commands pass from a clean install.

## Baseline evidence

```text
branch: codex/door-remediation-20260710
base:   225027def0189cdbc4999638eff6efd3d6e52434

frontend npm ci --ignore-scripts:
  FAIL ERESOLVE @pascal-app/core@0.3.2 -> three@^0.182
  deeper registry check: @pascal-app/viewer@0.3.2 -> three@^0.183
  first mutually compatible Pascal family: 0.6.x -> three@^0.184
  next strict-resolution failure: react-leaflet@4.2.1 -> React 18 only
  React 19-compatible map family: react-leaflet@5.x

server npm ci --ignore-scripts:
  PASS
  audit: 8 moderate, 3 high
```

## Phase A — Stop the bleeding and create a trustworthy baseline

### Task 1: Make the frontend dependency graph reproducible

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.npmrc`
- Create: `tests/tooling/dependency-policy.test.mjs`

**Step 1: Preserve the failing clean-install evidence**

Run:

```bash
npm ci --dry-run --ignore-scripts
```

Expected: FAIL with the `@pascal-app/core@0.3.2` and `three@^0.182` peer conflict.

**Step 2: Write a dependency-policy test**

Create a test that reads `package.json` and asserts:

```js
assert.equal(pkg.dependencies['@pascal-app/core'], '^0.6.0')
assert.equal(pkg.dependencies['@pascal-app/viewer'], '^0.6.0')
assert.equal(pkg.dependencies.three, '^0.184.0')
assert.equal(pkg.dependencies['react-leaflet'], '^5.0.0')
assert.equal(pkg.devDependencies['@types/react'].startsWith('^19.'), true)
assert.equal(pkg.devDependencies['@types/react-dom'].startsWith('^19.'), true)
assert.ok(pkg.devDependencies.eslint)
assert.ok(pkg.devDependencies.prettier)
assert.ok(pkg.devDependencies.typescript)
```

Run:

```bash
node --test tests/tooling/dependency-policy.test.mjs
```

Expected: FAIL because `three` is `^0.183.2` and the tooling dependencies do not exist.

**Step 3: Align package versions and tooling**

Update `package.json`:

```json
{
  "scripts": {
    "lint": "eslint src tests --ext .js,.jsx,.ts,.tsx,.mjs",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pascal-app/core": "^0.6.0",
    "@pascal-app/viewer": "^0.6.0",
    "react-leaflet": "^5.0.0",
    "three": "^0.184.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^8.63.0",
    "@typescript-eslint/parser": "^8.63.0",
    "eslint": "^9.39.1",
    "prettier": "^3.9.5",
    "typescript": "^5.9.3"
  }
}
```

Create `.npmrc`:

```ini
engine-strict=true
legacy-peer-deps=false
save-exact=false
```

Run:

```bash
npm install --ignore-scripts
```

Expected: PASS and update `package-lock.json`.

**Step 4: Verify clean installation and existing behavior**

Run:

```bash
rm -rf node_modules
npm ci --ignore-scripts
node --test tests/tooling/dependency-policy.test.mjs
npm test
npm run build
```

Expected: all commands PASS. Build warnings are recorded but do not block this task.

**Step 5: Commit**

```bash
git add package.json package-lock.json .npmrc tests/tooling/dependency-policy.test.mjs
git commit -m "fix(tooling): restore reproducible frontend installs"
```

### Task 2: Establish working lint, format, and TypeScript gates

**Files:**

- Create: `eslint.config.js`
- Create: `.prettierignore`
- Create: `tsconfig.json`
- Modify: `.prettierrc.json` if it exists after reconciling the original worktree proposal
- Modify: files reported by the new gates, in small batches

**Step 1: Write a tooling-config test**

Create `tests/tooling/quality-gates.test.mjs` that asserts the flat lint config uses `@typescript-eslint/parser` for `*.ts` and `*.tsx`, `tsconfig.json` includes all TypeScript source files, and the temporary Prettier legacy-debt boundary is explicit.

Run:

```bash
node --test tests/tooling/quality-gates.test.mjs
```

Expected: FAIL because the configs do not exist.

**Step 2: Add minimal configs**

Use JavaScript/React rules for JS/JSX and TypeScript parser overrides for TS/TSX. Start with correctness rules (`no-undef`, parser errors, invalid React hooks) and warnings for style debt. Temporarily exclude `src/` from the Prettier gate; remove that exclusion module-by-module during Phase E instead of generating one unreviewable repository-wide formatting commit.

**Step 3: Run the gates and record the baseline**

```bash
npm run lint
npm run typecheck
npm run format:check
```

Expected: failures identify real source debt rather than missing executables.

**Step 4: Fix in bounded batches**

Fix parser/config errors first. Do not reformat the entire repository in the same commit. Add a temporary documented warning budget only when fixing all warnings would mix unrelated domains.

**Step 5: Verify and commit**

```bash
node --test tests/tooling/quality-gates.test.mjs
npm run lint
npm run typecheck
npm run format:check
git diff --check
git commit -am "chore(tooling): add executable quality gates"
```

### Task 3: Prevent tests from touching non-test databases

**Files:**

- Create: `server/tests/support/test-environment.mjs`
- Create: `server/tests/test-environment.test.js`
- Modify: `server/package.json`
- Modify: DB-backed tests that define their own unsafe fallback
- Do not load: `server/.env` from test scripts

**Step 1: Write the failing safety tests**

Test these cases:

```js
assertSafeTestDatabase('postgres://door:x@localhost:5432/door_test') // pass
assertSafeTestDatabase('postgres://door:x@localhost:5432/test_door') // pass
assert.throws(
  () => assertSafeTestDatabase('postgres://door:x@localhost:5432/door'),
  /Refusing to run destructive tests/
)
```

Also spawn the test preloader with `DATABASE_URL=.../door` and expect a non-zero exit before importing Knex.

Run:

```bash
cd server
node --test tests/test-environment.test.js
```

Expected: FAIL because the shared guard does not exist.

**Step 2: Implement the preloader**

`test-environment.mjs` must:

```js
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ||= 'postgres://door:door_dev@127.0.0.1:5432/door_test'
assertSafeTestDatabase(process.env.DATABASE_URL)
```

It must not parse `.env`.

**Step 3: Change server scripts**

```json
{
  "scripts": {
    "test": "node --import ./tests/support/test-environment.mjs --test --test-concurrency=1",
    "test:unit": "node --import ./tests/support/test-environment.mjs --test tests/unit/**/*.test.js",
    "test:integration": "node --import ./tests/support/test-environment.mjs --test --test-concurrency=1 tests/integration/**/*.test.js"
  }
}
```

Keep compatibility scripts until the existing 57 server test files are classified.

**Step 4: Verify destructive tests are blocked**

```bash
DATABASE_URL=postgres://door:door_dev@127.0.0.1:5432/door npm test
```

Expected: immediate FAIL with `Refusing to run destructive tests`, before migrations or cleanup.

**Step 5: Verify against `door_test`**

Start PostgreSQL or use the CI service, then run:

```bash
DATABASE_URL=postgres://door:door_dev@127.0.0.1:5432/door_test npm test
```

Expected: tests execute against `door_test`; code failures are handled separately from environment failures.

**Step 6: Commit**

```bash
git add server/package.json server/tests
git commit -m "test(server): enforce isolated test databases"
```

### Task 4: Remove tracked secrets and add repository secret checks

**Files:**

- Delete from Git: `server/.env.dev`
- Modify: `.gitignore`
- Modify: `server/.env.example`
- Create: `scripts/check-tracked-secrets.mjs`
- Create: `tests/security/tracked-secrets.test.mjs`
- Create: `docs/security/secret-rotation-runbook.md`

**Step 1: Write a failing tracked-secret test**

The test runs `git ls-files` and fails if a tracked file matches `.env`, `.env.dev`, or secret assignment patterns with non-placeholder values.

Run:

```bash
node --test tests/security/tracked-secrets.test.mjs
```

Expected: FAIL and name `server/.env.dev` without printing secret values.

**Step 2: Remove the file from tracking**

```bash
git rm server/.env.dev
```

Add to `.gitignore`:

```gitignore
.env.dev
.env.*.dev
tmp/
```

Keep only placeholders in `server/.env.example`.

**Step 3: Add a rotation runbook**

Document:

- OCR/API key revocation owner and evidence field.
- JWT/database credential review.
- PII `v1 -> v2` dual-decrypt, re-encrypt, verify, retire sequence.
- GitHub/Gitee history-cleaning coordination after rotation.

Do not include secret values.

**Step 4: Verify and commit**

```bash
node --test tests/security/tracked-secrets.test.mjs
node scripts/check-tracked-secrets.mjs
git diff --check
git commit -m "fix(security): remove tracked development secrets"
```

### Task 5: Correct container health and environment handling

**Files:**

- Modify: `server/Dockerfile`
- Modify: `server/docker-compose.yml`
- Modify: `server/nginx.conf`
- Create: `server/tests/deployment-config.test.js`
- Modify: `server/src/modules/health/health.routes.js` only if response contract tests require it

**Step 1: Write failing deployment-config tests**

Assert:

- Dockerfile health check targets `/api/health/live`.
- Compose app and worker receive the same PII key variables.
- Nginx config does not contain unresolved `${NGINX_*}` placeholders in the mounted final config.
- Readiness uses `/api/health/ready` only where database/key readiness is required.

Run:

```bash
cd server
node --test tests/deployment-config.test.js
```

Expected: FAIL on missing/incorrect health configuration.

**Step 2: Implement health checks**

Use:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/health/live || exit 1
```

Keep readiness as a deployment smoke check because it depends on PostgreSQL and key-guard state.

**Step 3: Verify HTTP behavior**

```bash
cd server
node --test tests/health.test.js tests/deployment-config.test.js
```

Expected: `/live` returns 200; `/ready` returns 200 only with DB and key guard ready.

**Step 4: Verify container config when Docker is available**

```bash
docker compose config
docker build -t arcspro-server-remediation-test .
```

Expected: both commands PASS. If Docker is unavailable, record the gate as blocked, not passed.

**Step 5: Commit**

```bash
git add server/Dockerfile server/docker-compose.yml server/nginx.conf server/tests
git commit -m "fix(deploy): use valid liveness and readiness probes"
```

### Task 6: Add the first mandatory CI workflow

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `tests/tooling/ci-workflow.test.mjs`
- Modify: root and server package scripts as needed

**Step 1: Write a workflow contract test**

The test checks that CI includes:

- clean checkout;
- Node 20;
- `npm ci` for front and server;
- PostgreSQL 16 service with health check;
- encoding, secret, lint, typecheck, tests, build;
- explicit `door_test` URL;
- no `--force` or `--legacy-peer-deps`.

Run:

```bash
node --test tests/tooling/ci-workflow.test.mjs
```

Expected: FAIL because no workflow exists.

**Step 2: Add CI**

Use separate frontend and backend jobs so failures remain attributable. Backend integration job sets only test credentials and test encryption keys.

**Step 3: Verify locally**

```bash
node --test tests/tooling/ci-workflow.test.mjs
npm ci --ignore-scripts
npm run check:encoding
npm run lint
npm run typecheck
npm test
npm run build
```

Run backend gates against `door_test`.

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml tests/tooling/ci-workflow.test.mjs package.json server/package.json
git commit -m "ci: add reproducible frontend and server gates"
```

## Phase B — Shared contracts and a single API error model

### Task 7: Introduce npm workspaces and `packages/contracts`

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/api-error.js`
- Create: `packages/contracts/src/response.js`
- Create: `packages/contracts/src/module-catalog.js`
- Create: `packages/contracts/tests/contracts.test.js`

**Steps:**

1. Write contract tests for module IDs, success responses, error responses, and workspace scope.
2. Run tests and confirm RED because the package does not exist.
3. Add root workspaces for `server` and `packages/*`; update Docker build planning before removing `server/package-lock.json`.
4. Implement minimal framework-neutral contracts.
5. Run `npm ci`, contract tests, front tests, and server unit tests.
6. Commit with `feat(contracts): add shared API and module contracts`.

### Task 8: Break the frontend auth/request/store cycle

**Files:**

- Create: `src/auth/auth-session-adapter.js`
- Create: `tests/auth/auth-session-adapter.test.mjs`
- Modify: `src/utils/request.js`
- Modify: `src/stores/authStore.js`
- Modify: `src/api/auth.js` only for typed errors
- Create: `tests/tooling/import-cycles.test.mjs`

**Steps:**

1. Add a static import-cycle test; verify it fails on `api/auth -> authStore -> request`.
2. Add adapter behavior tests for token reads and `auth-expired` notification.
3. Implement an adapter that does not import Zustand.
4. Configure the adapter from `authStore` after store creation.
5. Change `request.js` to import only the adapter and shared `ApiError`.
6. Verify no static cycles, auth tests, workspace tests, and build.
7. Commit with `refactor(auth): decouple request client from auth store`.

### Task 9: Preserve structured API errors end to end

**Files:**

- Modify: `server/src/middleware/error-handler.js`
- Modify: `server/src/middleware/request-id.js`
- Modify: `src/utils/request.js`
- Modify: `src/utils/apiResponse.js`
- Create: `server/tests/error-handler.test.js`
- Create: `tests/api/api-error.test.mjs`

**Steps:**

1. Write server tests for `{ success:false, error:{ code,message,requestId,details } }`.
2. Write client tests proving 403, 409, and 422 remain distinguishable.
3. Verify RED against the current string-only error conversion.
4. Implement shared response builders and `ApiError`.
5. Keep a temporary compatibility getter for `response.message` while callers migrate.
6. Verify tests and commit with `refactor(api): preserve structured error responses`.

### Task 10: Remove API path remapping and response-shape guessing

**Files:**

- Modify: `src/utils/request.js`
- Modify: all modules under `src/api/`
- Modify: `src/services/inventoryApi.js`
- Modify: direct-fetch stores and views identified by the audit
- Create: `tests/api/api-paths.test.mjs`

**Steps:**

1. Add a test that fails if `remapApiPath` contains rules or API modules use legacy prefixes.
2. Migrate APIs by surface: auth/public, app events, ops, admin.
3. Remove `.then(unwrapData)` one module at a time and update callers.
4. Keep raw `fetch` only for streaming, blob, HEAD, and service-worker cases; share auth/error helpers.
5. Verify each surface before deleting `remapApiPath`.
6. Commit in surface-sized commits, not one repository-wide commit.

## Phase C — One authorization system

### Task 11: Capture the current authorization behavior matrix

**Files:**

- Create: `server/tests/authz/authorization-matrix.test.js`
- Create: `tests/auth/authorization-navigation-matrix.test.mjs`
- Read: `server/src/utils/capability-policy.js`
- Read: `server/src/middleware/require-permission.js`
- Read: `server/src/middleware/require-authz.js`
- Read: `server/src/authz/model/arcspro.fga`

**Steps:**

1. Enumerate super_admin, org_admin, race_admin, and user across platform/org/race workspaces.
2. Cover every registered module in app/ops/admin.
3. Assert navigation visibility and backend authorization separately.
4. Run against current behavior; classify unexpected differences before changing code.
5. Commit characterization tests with `test(authz): capture current authorization matrix`.

### Task 12: Add a single authorization adapter

**Files:**

- Create: `server/src/authz/authorization.js`
- Create: `server/src/middleware/authorize.js`
- Create: `server/tests/authz/authorization.test.js`
- Modify: `server/src/authz/authz.service.js`
- Modify: `server/src/authz/profile.service.js`

**Steps:**

1. Write failing tests for `assert(action, resource, workspace)`.
2. Implement local and OpenFGA-backed adapters behind the same interface.
3. Pin and pass authorization model ID in production OpenFGA calls.
4. Keep `requirePermission` and `requireAuthz` as compatibility wrappers that call the adapter.
5. Verify the matrix remains green.
6. Commit with `refactor(authz): introduce one authorization adapter`.

### Task 13: Migrate routes and remove legacy auth context

**Files:**

- Modify: `server/src/app.js`
- Modify: route files using `requirePermission` or `requireAuthz`
- Modify: 12 files reading `req.user`, `req.orgAccess`, or `req.tenantContext`
- Modify: `server/src/middleware/require-auth.js`
- Delete after migration: legacy permission middleware files

**Steps:**

1. Migrate one module at a time: identity/design requests, records/import, audit/lottery/bib, inventory, reimbursement, credential, admin utilities.
2. For each module, run its authorization matrix before and after.
3. Replace legacy aliases with `req.authContext`.
4. Delete the expired role migration map only after token compatibility is confirmed.
5. Add a static test that fails on legacy context identifiers.
6. Commit each module separately.

## Phase D — Backend module boundaries and transactions

### Task 14: Introduce the module template and boundary checks

**Files:**

- Create: `server/src/lib/http/response.js`
- Create: `server/src/lib/http/validation.js`
- Create: `server/tests/architecture/module-boundaries.test.js`
- Modify: `server/package.json`

**Steps:**

1. Add a failing static test that reports route files importing Knex and raw `req.body` passed to repositories.
2. Add shared validation and response helpers.
3. Establish a ratchet file listing existing violations; new violations fail CI.
4. Reduce the ratchet to zero as modules migrate.
5. Commit with `test(architecture): enforce backend module boundaries`.

### Task 15: Migrate event-core modules

**Files:**

- Modify: `server/src/modules/records/*`
- Modify: `server/src/modules/import-sessions/*`
- Modify: `server/src/modules/audit/*`
- Modify: `server/src/modules/lottery/*`
- Modify: `server/src/modules/lottery-v2/*`
- Modify: `server/src/modules/bib/*`
- Add: `*.controller.js` and `*.schema.js` files

**Steps per module:**

1. Characterize current route responses and authorization.
2. Write failing schema and transaction tests.
3. Move HTTP parsing to controller and business rules to service.
4. Ensure repository accepts explicit fields and optional `trx`.
5. Verify module tests plus the complete import -> audit -> lottery -> bib flow.
6. Commit one module per commit.

### Task 16: Add transactions to multi-write workflows

**Files:**

- Modify: `server/src/modules/auth/auth.service.js`
- Modify: `server/src/modules/audit/audit.routes.js` and new service
- Modify: design-request approval workflows
- Modify: reimbursement/import workflows found by the boundary audit

**Steps:**

1. Add failure-injection tests proving partial writes currently survive.
2. Verify RED by forcing the second write to fail.
3. Wrap the complete use case in `knex.transaction`.
4. Verify no partial rows remain.
5. Commit per workflow using `fix(<scope>): make <workflow> atomic`.

### Task 17: Migrate supporting modules in waves

**Waves:**

1. credential, team, profile, identity-center;
2. reimbursement and OCR;
3. inventory core, twin, and spatial;
4. assessment, interview, design requests;
5. backup, dictionary, operation log, sys-job.

Each wave must reduce architecture ratchet counts, keep module tests green, and include one API smoke check.

## Phase E — Frontend surfaces and GIS/3D

### Task 18: Create one route registry per surface

**Files:**

- Create: `src/routes/appRoutes.jsx`
- Create: `src/routes/opsRoutes.jsx`
- Create: `src/routes/adminRoutes.jsx`
- Modify: `src/components/app/appConfig.js`
- Modify: `src/components/ops/opsConfig.js`
- Modify: `src/components/admin/adminConfig.js`
- Modify: three Layout components
- Create: `tests/routes/route-registry.test.mjs`

**Steps:**

1. Add tests proving every navigation entry maps to exactly one route and moduleId.
2. Verify RED on duplicated current definitions.
3. Create registries that include path, label, moduleId, scope, capability, and lazy component.
4. Derive navigation and `<Route>` elements from the registry.
5. Verify surface/workspace tests and browser smoke.
6. Commit one surface at a time.

### Task 19: Replace duplicated layouts with `SurfaceShell`

**Files:**

- Create: `src/components/surface/SurfaceShell.jsx`
- Create: `src/components/surface/SurfaceSidebar.jsx`
- Create: `src/components/surface/SurfaceMobileMenu.jsx`
- Create: component tests
- Modify: AppLayout, OpsLayout, AdminLayout
- Delete after migration: `src/components/shared/LayoutShell`

**Steps:**

1. Characterize desktop and mobile layout behavior.
2. Build slot-based shell without surface-specific business imports.
3. Migrate ops, verify; migrate admin, verify; migrate app, verify.
4. Remove the unused old shell.
5. Run Playwright at desktop and 390px widths.

### Task 20: Extract the shared studio model

**Files:**

- Create: `packages/studio-model/`
- Move shared pure functions from both `studioProjectUtils.js` files
- Modify frontend and server imports
- Create parity and serialization tests

**Steps:**

1. Add parity tests for the 21 duplicated exports.
2. Verify test coverage on current front/server implementations.
3. Move the common implementation without behavior changes.
4. Keep browser-only and server-only adapters outside the package.
5. Delete duplicate copies after all imports migrate.
6. Verify 3D Studio, inventory scene, and export tests.

### Task 21: Split terrain, map, and editor hotspots

**Files:**

- Split: `src/utils/terrainModel/model.js`
- Split: `src/views/app/terrain-model/TerrainModelPage.jsx`
- Split: `src/components/map/MapView3D.tsx`
- Split: `src/3d-studio/model/editorDocument.js`

**Order:**

1. Pure coordinate and geometry helpers.
2. DEM/texture acquisition.
3. mesh and print export.
4. Bambu packaging.
5. React controller hooks.
6. UI sections and render adapters.

For every extraction, move tests first, verify green, move code without edits, verify green, then refactor.

## Phase F — Complete verification

### Task 22: Run repository gates from a clean clone

Run:

```bash
npm ci
npm run check:encoding
npm run lint
npm run typecheck
npm test
npm run build
node scripts/check-tracked-secrets.mjs

cd server
npm ci
DATABASE_URL=postgres://door:door_dev@127.0.0.1:5432/door_test npm test
```

Expected: every command exits 0. Record versions and final counts.

### Task 23: Verify critical business flows

Verify with fixtures and browser evidence:

1. login -> workspace -> app/ops/admin authorization;
2. select race -> import list -> commit -> records visible;
3. audit five steps -> job polling -> results;
4. lottery preview/finalize/rollback;
5. bib assignment/export/tracking;
6. credential request/review/issue;
7. reimbursement import/OCR/match/export;
8. inventory inbound/binding/outbound/count;
9. GIS map -> 3D studio -> export.

Save API JSON, screenshots, and logs under a deliberately ignored evidence directory. Publish only a redacted verification summary.

### Task 24: Verify deployment and rollback

Run:

```bash
docker compose config
docker compose build
docker compose up -d
docker compose exec app npm run migrate
curl -fsS http://127.0.0.1:3001/api/health/live
curl -fsS http://127.0.0.1:3001/api/health/ready
```

Verify frontend routes, static chunk loading, worker registration, database backup, and rollback to the previous image/database snapshot.

### Task 25: Close the long-term goal

Before completion:

- Confirm no plan task remains pending.
- Confirm external secret rotation evidence is attached or explicitly marked as an external blocker.
- Run `git status --short` and require a clean tree.
- Run the full gate stack again.
- Produce a final remediation report mapping every original finding to code, tests, and runtime evidence.
- Mark the goal complete only after every required item is verified.
