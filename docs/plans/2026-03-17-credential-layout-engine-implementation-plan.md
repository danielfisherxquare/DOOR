# Credential Template Design Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the `CredentialLayoutView` in the TOOL application to use the advanced layout engine from `BibLayoutView` while integrating real DOOR credential data (Zones and Roles).

**Architecture:** We will extract the core interaction mechanics (`bibLayoutSnap`, `bibLayoutCommands`) and adapt the canvas rendering logic from `BibLayoutView`. Furthermore, we'll introduce new API endpoints in `tool/src/services/api` or `credentialApi.ts` to fetch `CredentialZone` and `CredentialRole` data from the backend to generate realistic preview data for template design.

**Tech Stack:** React, Canvas 2D, qr-code-styling, pdfjs-dist

---

### Task 1: Integrate API bindings for Credential Roles and Zones

**Files:**
- Create/Modify: `tool/src/services/credentialApi.ts` (or similar file handling credential API calls)

**Step 1: Write API fetch functions**
```typescript
// Example additions to credentialApi.ts
export const credentialApi = {
    // ... existing ...
    getZones: (raceId: number) => get<CredentialZoneRow[]>(`/api/admin/credentials/zones/${raceId}`),
    getRoles: (raceId: number) => get<CredentialRoleRow[]>(`/api/admin/credentials/roles/${raceId}`),
};
```
*Note: exact URLs will be verified against the backend routing before implementation.*

**Step 2: Commit**
```bash
git add tool/src/services/credentialApi.ts
git commit -m "feat: add api bindings for credential zones and roles"
```

---

### Task 2: Port Layout Engine Interactions (Snap & Commands)

**Files:**
- Modify: `tool/src/components/credential/CredentialLayoutView.tsx`

**Step 1: Add Interaction State and Event Listeners**
- Import `applySnap` and `BibLayoutCommand` utilities.
- Add `interactionRef` to track `draw`, `move`, `resize` modes.
- Implement `handleFieldDragStart`, `handleMove`, `handleUp` matching the logic in `BibLayoutView`.
- Add `snapGuides` state and render them over the canvas.

**Step 2: Commit**
```bash
git add tool/src/components/credential/CredentialLayoutView.tsx
git commit -m "refactor: port bib layout interaction engine to credential layout"
```

---

### Task 3: Implement Advanced Canvas Rendering & QR Generation

**Files:**
- Modify: `tool/src/components/credential/CredentialLayoutView.tsx`

**Step 1: Upgrade `renderCanvas` Function**
- Replace simplified `ctx.fillText` with the precise `measureText` and multi-line/alignment aware rendering loop from `BibLayoutView`.
- Implement specific rendering for `rect` (role backgroundColor) and `accessLegend` (zones).
- Pull in `qr-code-styling` caching logic for realistic QR code preview.

**Step 2: Commit**
```bash
git add tool/src/components/credential/CredentialLayoutView.tsx
git commit -m "feat: upgrade credential canvas rendering with advanced text and QR support"
```

---

### Task 4: UI Enhancements (Toolbar & Properties Panel)

**Files:**
- Modify: `tool/src/components/credential/CredentialLayoutView.tsx`

**Step 1: Add Layout Toolbars**
- Add the `<div className="toolbarLeft">` containing alignment and distribution commands.
- Ensure the properties panel (`<div className="propsPanel">`) includes advanced settings (autoFit, padding, specific QR settings) similar to `BibLayoutView`.

**Step 2: Fetch and Use Real Data for Preview**
- Use the APIs from Task 1 in `useEffect` to fetch `zones` and `roles`.
- Construct a realistic `sampleRow` utilizing this data so the preview canvas accurately reflects real-world usage.

**Step 3: Commit**
```bash
git add tool/src/components/credential/CredentialLayoutView.tsx
git commit -m "feat: complete UI enhancements for credential layout view"
```
