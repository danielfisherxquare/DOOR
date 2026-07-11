# Credential Generation Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make credential approval atomically create one generated credential, then let an authorized race operator view and issue it from the existing credential workspace.

**Architecture:** Keep request review and first credential generation in one PostgreSQL transaction. Enforce one credential per request with a partial unique index and a locked request row. Reuse the existing surface-aware credential API and issue page, then prove the complete flow with isolated integration tests and real-browser evidence.

**Tech Stack:** Node.js, Express, Knex, PostgreSQL 16, React 19, Zustand, Playwright, Node test runner.

---

### Task 1: Specify atomic approval and generation

**Files:**
- Modify: `server/tests/credential-refactor.routes.test.js`
- Modify: `server/src/modules/credential/credential.repository.js`
- Modify: `server/src/modules/credential/credential.service.js`
- Create: `server/src/db/migrations/20260711000001_add_credential_request_unique_index.js`

**Step 1: Write the failing integration assertions**

Extend the race-operator test so an approved request returns:

```js
assert.equal(reviewed.body.data.status, 'generated')
assert.ok(reviewed.body.data.credentialId)
assert.equal(reviewed.body.data.credentialStatus, 'generated')
```

Assert exactly one `credential_credentials` row exists for the request and that its category, person, job title, and access area match the final review values. Re-review the same request and expect HTTP 400 with the count still equal to one.

**Step 2: Add a rollback failure test**

Inside the isolated test database, temporarily install a PostgreSQL trigger that raises an exception on `credential_credentials` insert. Approve a submitted request, expect HTTP 500, drop the trigger in `finally`, and assert the request is still `submitted` with no credential.

**Step 3: Run the test and verify RED**

Run the single file against a fresh database through `server/tests/support/run-isolated-tests.mjs` or an equivalent disposable `arcspro_test_*` database.

Expected: approval still returns `approved`, no credential exists, and rollback assertions fail.

**Step 4: Add the database invariant**

Create a partial unique index:

```sql
CREATE UNIQUE INDEX credential_credentials_org_request_unique
ON credential_credentials (org_id, request_id)
WHERE request_id IS NOT NULL;
```

The down migration removes only this index.

**Step 5: Implement locked transactional generation**

Add repository functions that accept a Knex transaction for:

- locking a request row by organization and ID;
- finding an existing credential by request;
- reading request access areas;
- inserting credential access areas.

In `reviewRequest`, validate the request, category, and areas, then start one transaction. Lock the request; reject `generated`, `rejected`, or already-linked requests; update review fields; create the credential with a new `CRED-xxxxxx` number; save its signed QR payload; copy the final access areas; and finally set the request status to `generated`.

**Step 6: Run the isolated test and verify GREEN**

Expected: request/review/generation, duplicate prevention, and trigger rollback all pass.

**Step 7: Commit**

```bash
git add server/src/modules/credential server/src/db/migrations/20260711000001_add_credential_request_unique_index.js server/tests/credential-refactor.routes.test.js
git commit -m "fix(credentials): generate approved credentials atomically"
```

### Task 2: Open the generated pool to authorized race operators

**Files:**
- Modify: `server/src/modules/credential/credential.routes.js`
- Modify: `server/tests/credential-refactor.routes.test.js`

**Step 1: Write failing authorization assertions**

After approval, call these routes with the `race_admin` app token:

```text
GET  /api/app/credentials/credentials/:raceId
GET  /api/app/credentials/stats/:raceId
POST /api/app/credentials/credentials/:raceId/:credentialId/issue
GET  /api/app/credentials/credentials/:raceId/:credentialId
```

Expect list and stats to return 200, issue to return 200, and detail to report `issued`. Keep void and reissue forbidden for the same operator.

**Step 2: Run and verify RED**

Expected: list and stats currently return 403.

**Step 3: Apply the operator guard**

Use `requireCredentialOperator` for credential list and stats. Keep `requireCredentialAdmin` on void and reissue. Keep race access checks on every route.

**Step 4: Run and verify GREEN**

Assert one issue log exists and the credential is `issued`.

**Step 5: Commit**

```bash
git add server/src/modules/credential/credential.routes.js server/tests/credential-refactor.routes.test.js
git commit -m "fix(credentials): expose issuance pool to race operators"
```

### Task 3: Repair the issue page and app route

**Files:**
- Modify: `src/views/admin/credential/CredentialIssuePage.jsx`
- Modify: `src/views/admin/credential/useCredentialSurface.js`
- Modify: `src/routes/appRoutes.jsx`
- Modify: `src/components/app/appConfig.js`
- Modify: `tests/surfaceBoundaries.test.js`
- Modify: `tests/routes/route-registry.test.mjs`

**Step 1: Write failing boundary tests**

Assert the issue page:

- does not import `adminCredentialApi`;
- does not read raw `orgId`/`raceId` from search params;
- uses `credentialApi`, `orgId`, and `raceId` from `useCredentialSurface`;
- accepts the array returned by `getCredentials` instead of expecting `data.items`;
- maps `/app/credential/issue` to the real issue component, not the credential-center redirect.

**Step 2: Run and verify RED**

Run `npm run test:surfaces` and the route-registry test.

**Step 3: Implement the surface-safe page**

Use:

```js
const { buildHref, credentialApi, orgId, raceId } = useCredentialSurface()
```

Load `res.data || []`, preserve existing UI, and register `CredentialIssuePage` as the app route component.

**Step 4: Run frontend gates**

Run:

```bash
npm run test:surfaces
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0.

**Step 5: Commit**

```bash
git add src/views/admin/credential src/routes/appRoutes.jsx src/components/app/appConfig.js tests
git commit -m "fix(credentials): connect app issuance workspace"
```

### Task 4: Seed repeatable credential rules

**Files:**
- Modify: `server/scripts/seed-demo-data.mjs`
- Modify: `server/tests/demo-seed.test.js`

**Step 1: Write failing seed assertions**

For the Shanghai acceptance race, assert the seed contains:

- access area `101 / 终点核心区`;
- category `OPS / 赛事执行` requiring review;
- the category-to-area link;
- idempotent counts after a second seed run.

**Step 2: Run and verify RED**

Expected: no credential rules exist.

**Step 3: Add idempotent upserts**

Upsert by organization, race, and business code. Do not delete user-created credential data.

**Step 4: Run and verify GREEN**

Run the demo-seed test in a disposable database.

**Step 5: Commit**

```bash
git add server/scripts/seed-demo-data.mjs server/tests/demo-seed.test.js
git commit -m "test(seed): add credential acceptance fixtures"
```

### Task 5: Prove request, review, generation, and issue in the browser

**Files:**
- Modify: `scripts/verify-business-surfaces.mjs`

**Step 1: Extend the verifier**

Create a uniquely named `admin_direct` request from `/app/credential/requests`, approve it from `/app/credential/review`, open `/app/credential/issue`, and complete issuance. Assert the visible states change from `待审核` to `已生成` to `已领取`.

Use a unique run suffix so rerunning the verifier does not collide with earlier evidence.

**Step 2: Rebuild and deploy the local acceptance stack**

Run the frontend build and rebuild the app image. Confirm app and PostgreSQL health before browser execution.

**Step 3: Run the verifier**

Expected report:

```json
{
  "ok": true,
  "failedRequests": [],
  "resourceFailures": [],
  "pageErrors": [],
  "consoleErrors": []
}
```

Save screenshots and `result.json` under `output/remediation-acceptance-20260711/business-surfaces/`.

**Step 4: Commit**

```bash
git add scripts/verify-business-surfaces.mjs
git commit -m "test(acceptance): verify credential issuance lifecycle"
```
