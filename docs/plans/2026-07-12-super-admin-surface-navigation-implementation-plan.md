# Super Admin Surface Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore visible, context-safe navigation between the application, operations, and administration surfaces for super administrators.

**Architecture:** Keep authorization profiles and workspace guards unchanged. Route platform super administrators through the existing launcher, add one shared launcher link to the common surface shell, and preserve explicit organization/race selection before entering operational surfaces.

**Tech Stack:** React 19, React Router, Zustand, Node test runner, Vite

---

### Task 1: Lock the navigation contract with failing tests

**Files:**
- Modify: `tests/routes/surface-shell.test.mjs`
- Create: `tests/routes/super-admin-navigation.test.mjs`

**Step 1: Write the failing tests**

Assert that:

- platform super administrators resolve their post-login landing to `/launcher`;
- platform workspace submission accepts `/launcher` as a safe target;
- the shared desktop and mobile surface navigation expose `/launcher` with the label `切换入口`.

**Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/routes/super-admin-navigation.test.mjs tests/routes/surface-shell.test.mjs
```

Expected: failures show the current `/admin` landing and missing shared launcher link.

### Task 2: Implement the minimal navigation behavior

**Files:**
- Modify: `src/views/Login.jsx`
- Modify: `src/views/workspace/WorkspaceSelectPage.jsx`
- Modify: `src/components/surface/SurfaceShell.jsx`
- Modify: `src/components/surface/SurfaceSidebar.jsx`
- Modify: `src/components/surface/SurfaceMobileMenu.jsx`
- Create or modify: a small pure navigation helper under `src/features/workspace/`

**Step 1: Add pure navigation helpers**

Centralize safe landing and redirect selection so tests exercise behavior rather than source text.

**Step 2: Change platform login landing**

After creating the platform workspace session, navigate to `/launcher` unless a valid protected-route return or explicit redirect exists.

**Step 3: Preserve launcher redirect for platform scope**

Allow only `/admin`, `/admin/*`, or `/launcher` as platform-scope submission targets. Fall back to `/admin` for application or operations paths because those require a business workspace.

**Step 4: Add shared surface-switch links**

Render a `切换入口` link to `/launcher` in both desktop and mobile shared shell navigation.

**Step 5: Run focused tests to verify green**

Run:

```bash
node --test tests/routes/super-admin-navigation.test.mjs tests/routes/surface-shell.test.mjs tests/workspaceSession.test.js tests/auth/authorization-navigation-matrix.test.mjs
```

Expected: all tests pass.

### Task 3: Regression verification

**Files:**
- Verify only

**Step 1: Run the frontend suite**

```bash
npm test
```

Expected: all tests pass with no failures.

**Step 2: Build production assets**

```bash
npm run build
```

Expected: Vite build and boundary checks pass.

**Step 3: Start the local development stack**

```bash
cd server
docker compose -p arcspro-remediation-20260711 up -d --build
```

Expected: gateway readiness returns HTTP 200.

**Step 4: Browser acceptance**

Verify:

1. super admin login lands on `/launcher`;
2. all three cards are visible;
3. application card requests an organization context;
4. operations card requests a race context;
5. administration opens directly from platform context;
6. `切换入口` returns to `/launcher` from each surface;
7. browser error log is empty.

### Task 4: Review and commit

**Files:**
- Review all modified files

**Step 1: Review the diff**

```bash
git diff --check
git diff --stat
git status --short
```

**Step 2: Commit**

```bash
git add docs/plans tests/routes src
git commit -m "fix(navigation): restore super admin surface launcher"
```
