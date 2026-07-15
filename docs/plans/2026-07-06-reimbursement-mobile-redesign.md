# Reimbursement Mobile Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the compressed desktop reimbursement toolbar on phones with a task-first mobile home that keeps all reimbursement functions reachable.

**Architecture:** Keep desktop reimbursement routes and tables unchanged. Add a mobile-only shell in `ReimbursementTool.jsx` that shares the existing reimbursement store, OCR upload flow, project selector, modals, and record views while presenting a different first screen under the existing CSS breakpoint.

**Tech Stack:** React, Zustand reimbursement store, existing App H5 shell components, vanilla CSS, Node test runner with Playwright.

---

### Task 1: Lock Mobile Information Architecture With A Failing Test

**Files:**
- Modify: `tests/reimbursement/reimbursement-mobile-render.test.mjs`

**Steps:**
1. Assert the mobile route renders a compact project summary.
2. Assert the mobile route exposes a More actions button for low-frequency actions.
3. Assert the desktop H5 tab bar is not visible on the mobile home first screen.
4. Run `npm run test:reimbursement:mobile` and verify it fails for missing mobile shell selectors.

### Task 2: Add The Mobile Shell

**Files:**
- Modify: `src/views/reimbursement/ReimbursementTool.jsx`
- Modify: `src/views/reimbursement/components/ReimbursementMobileHome.jsx`

**Steps:**
1. Add mobile-only shell markup around project summary, primary capture actions, pending queue, review, and secondary action drawer.
2. Keep desktop rendering path unchanged for `PreviewWorkspace`, `ReimbursementTable`, and `AttachmentManager`.
3. Reuse existing store methods and modal state; do not add API calls.

### Task 3: Style The Mobile Shell

**Files:**
- Modify: `src/views/reimbursement/reimbursement.css`

**Steps:**
1. Hide the desktop header actions and tabs on the mobile home view.
2. Style the mobile summary as one compact block.
3. Style primary capture actions as the dominant first-screen controls.
4. Style secondary actions as a bottom sheet or compact drawer.
5. Keep width constraints so `documentElement.scrollWidth <= window.innerWidth`.

### Task 4: Verify Locally And On Remote

**Commands:**
- `npm run build`
- `npm run test:surfaces`
- `npm run test:reimbursement:mobile`

**Rendered checks:**
- Local iPhone viewport route: `/app/reimbursements`
- Remote iPhone viewport route: `https://www.arcspro.work:18443/app/reimbursements`
- Verify no horizontal overflow, no framework overlay, meaningful mobile first screen, and at least one interaction with More actions.
