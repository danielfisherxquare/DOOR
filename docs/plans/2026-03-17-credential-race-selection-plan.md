# Credential Race Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a new race selection page for the credential management module and fix sidebar raceId loss.

**Architecture:** Add a selection page displaying all races in an org, modify routing defaults, enhance `AdminLayout` to preserve `raceId` in URL search params during sub-menu navigation, and add fallback links in subpages.

**Tech Stack:** React, React Router

---
### Task 1: Update AdminLayout Sidebar & Routes

**Files:**
- Modify: `src/components/admin/AdminLayout.jsx`

**Step 1: Update minimal implementation**
1. Extract `currentRaceId` from `searchParams.get('raceId')`.
2. Update the helper function to `linkWithContext(routePath)` to attach both `orgId` and `raceId` to URLs if present. Update `orgMenus` mapping to use `linkWithContext(child.path)`.
3. Add `CredentialSelectRacePage` to lazy imports and map it to `path="credential/select-race"`.
4. Update the default `/admin/credential` `<Navigate>` element to redirect to `/admin/credential/select-race${selectedOrgId ? ...}` instead of `zones`.

**Step 2: Commit**
```bash
git add src/components/admin/AdminLayout.jsx
git commit -m "feat: preserve raceId context in sidebar and map select-race route"
```

### Task 2: Implement SelectRacePage

**Files:**
- Create: `src/views/admin/credential/CredentialSelectRacePage.jsx`

**Step 1: Write the minimal implementation**
Render a `useEffect` loaded page that dynamically populates `racesApi.getAll({ orgId: selectedOrgId })`. If `!selectedOrgId`, show prompt to select org. If valid, show cards. Include a Link around each card navigating to `/admin/credential/zones?orgId=${selectedOrgId}&raceId=${race.id}`.

**Step 2: Commit**
```bash
git add src/views/admin/credential/CredentialSelectRacePage.jsx
git commit -m "feat: implement credential race selection landing page"
```

### Task 3: Update Subpages without RaceId

**Files:**
- Modify: `src/views/admin/credential/CredentialZonePage.jsx`
- Modify: `src/views/admin/credential/CredentialRolePage.jsx`
- Modify: `src/views/admin/credential/CredentialStylePage.jsx`
- Modify: `src/views/admin/credential/CredentialApplicationPage.jsx`
- Modify: `src/views/admin/credential/CredentialReviewPage.jsx`

**Step 1: Write the minimal implementation**
For each credential subpage that depends on a race, change the empty state (`if (!raceId)`) from simple text to a friendly View with an action button linking to `/admin/credential/select-race${selectedOrgId ? "?orgId="+selectedOrgId : ""}`, e.g. `<Link className="btn btn--primary" to="...">返回选择赛事</Link>`.

**Step 2: Commit**
```bash
git add src/views/admin/credential/Credential*.jsx
git commit -m "feat: update credential subpages to offer 'return to race generation' escape hatch"
```
