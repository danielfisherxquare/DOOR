# ArcSpro H5 Product Grade Mobile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the ArcSpro application layer behave like a mature installable H5 app on iOS and Android, with a consistent mobile design language, resilient API data envelopes, and verified mobile layouts.

**Architecture:** Keep the existing ArcSpro app-layer route structure and Vite React stack. Extend the shared H5 primitives instead of creating another shell, then migrate the highest-risk data-heavy pages to desktop table plus mobile card rendering. Backend behavior stays compatible; the frontend normalizes existing response envelopes before filtering or rendering.

**Tech Stack:** React 19, Vite, plain CSS, Node built-in test runner, Playwright for rendered mobile QA.

---

## Product Decisions

- The first screen stays an operational app, not a landing page.
- Desktop tables remain tables. On mobile, data-heavy views render card lists with stable field labels and primary actions.
- Touch controls that appear in the mobile shell or primary workflows must be at least 44px high.
- Tabs on mobile stay horizontally scrollable instead of becoming a one-column vertical stack.
- PWA install copy must show observable platform behavior:
  - Android/Chromium: use the saved beforeinstallprompt event when available.
  - iOS Safari: instruct the user to use Share -> Add to Home Screen.
  - Standalone mode: do not keep advertising install.

## Component Contract

### AppH5DataTable

Current API:

    <AppH5DataTable mobileCards={<AppH5DataCard ... />}>
      <table>...</table>
    </AppH5DataTable>

Required behavior:

- Desktop: render .app-h5-table-scroll and keep native table semantics.
- Mobile: when mobileCards is supplied, hide .app-h5-table-scroll and show .app-h5-table-cards.
- Empty states remain outside the table primitive.

### AppH5DataCard

Use this card for mobile row rendering:

    <AppH5DataCard
      eyebrow="证件号 4501..."
      title="张三"
      meta={<AppH5StatusTag tone="success">已关联赛事</AppH5StatusTag>}
      fields={[
        { key: 'event', label: '项目', value: '半程马拉松' },
        { key: 'phone', label: '手机号', value: '138...' },
      ]}
      actions={<Link className="btn btn--ghost btn--sm" to="/app/projects/1">编辑计划</Link>}
    />

### AppH5Tabs

Mobile CSS must make .app-h5-tabs horizontally scrollable with each tab at least 44px high. Do not add a new tab implementation unless a route needs a different visual pattern.

## API/Data Contract

Normalize existing API and mock response envelopes before rendering:

    unwrapListData(response, ['projects'])

Accept these shapes:

    [{ id: 1, name: '赛事计划' }]
    { data: [{ id: 1, name: '赛事计划' }] }
    { data: { projects: [{ id: 1, name: '赛事计划' }] } }
    { projects: [{ id: 1, name: '赛事计划' }] }

For records query responses, preserve:

    { records: [], total: 0 }
    { data: { records: [], total: 0 } }

## Tasks

### Task 1: Lock the Shell and Data Contracts With Failing Tests

**Files:**
- Modify: tests/pwa/appShell.test.mjs
- Modify: tests/app-h5/mobileDataCards.test.mjs
- Modify: tests/app-h5/apiResponse.test.mjs

**Step 1: Write failing tests**

Add assertions for:

- workspace-main__install-copy, workspace-main__install-hint, and platform-specific install copy in AppLayout.jsx.
- 44px mobile shell controls in app-layout.css.
- horizontally scrollable .app-h5-tabs mobile rules in app-h5-surface.css.
- mobileCards usage in ProjectListPage, RecordsOverviewPanel, ProcessingOverviewPanel, VerificationImportPanel, and LotteryListsPanel.
- unwrapListData accepts projects and nested data.projects envelopes.

**Step 2: Run tests to verify RED**

Run:

    node --test tests/pwa/appShell.test.mjs tests/app-h5/mobileDataCards.test.mjs tests/app-h5/apiResponse.test.mjs

Expected: FAIL before implementation on missing shell copy/classes, mobile tab rules, page card fallbacks, or list envelope handling.

### Task 2: Implement the Shared H5 Mobile Primitives

**Files:**
- Modify: src/components/app/AppH5Surface.jsx
- Modify: src/components/app/app-h5-surface.css
- Modify: src/components/app/AppLayout.jsx
- Modify: src/components/app/app-layout.css

**Step 1: Implement minimal code**

- Keep AppH5DataTable and AppH5DataCard; tighten mobile CSS if needed.
- Make .app-h5-tabs mobile horizontal with overflow-x auto, scroll-snap-type, and min-height: 44px.
- Enlarge shell topbar buttons, context trigger, avatar, install button, dock buttons to mature touch size.
- Replace generic install toast with visible text:
  - Android prompt available: 一键安装到桌面.
  - iOS: 在 Safari 分享菜单中选择“添加到主屏幕”.
  - Installed: 已安装.
- Remove duplicate unreachable return in mobileDockItems.

**Step 2: Run focused tests**

Run:

    node --test tests/pwa/appShell.test.mjs tests/app-h5/designLanguage.test.mjs

Expected: PASS.

### Task 3: Convert Data-Heavy Pages to Mobile Cards

**Files:**
- Modify: src/views/app/projects/ProjectListPage.jsx
- Modify: src/views/app/events/records/RecordsOverviewPanel.jsx
- Modify: src/views/app/events/processing/ProcessingOverviewPanel.jsx
- Modify: src/views/app/events/processing/VerificationImportPanel.jsx
- Modify: src/views/app/events/processing/LotteryListsPanel.jsx
- Modify: src/views/app/events/records/records-page.css
- Modify: src/views/app/events/processing/processing-center.css

**Step 1: Implement card renderers**

Use AppH5DataCard and AppH5StatusTag for mobile rows. Keep table markup intact for desktop. Use field labels that match real operator language:

- Records: 姓名, 项目, 手机号, 证件号, 签位状态, 号码布, 来源.
- Projects: 项目名称, 关联赛事, 状态.
- Processing status: 状态, 人数, 占比, 分组.
- Verification preview: 证件号, 净成绩, 赛事名称, 项目.
- Lottery lists: 姓名, 证件号, 手机号, 匹配状态, 匹配方式.

**Step 2: Run focused tests**

Run:

    node --test tests/app-h5/mobileDataCards.test.mjs

Expected: PASS.

### Task 4: Harden Existing API Envelope Handling

**Files:**
- Modify: src/utils/apiResponse.js
- Modify: src/views/app/projects/ProjectListPage.jsx

**Step 1: Implement normalization**

- Extend unwrapListData to inspect one nested data object layer before falling back to empty list.
- Use unwrapListData(data, ['projects']) in ProjectListPage before projects.filter.

**Step 2: Run focused tests**

Run:

    node --test tests/app-h5/apiResponse.test.mjs tests/app-h5/projectsLanguage.test.mjs

Expected: PASS.

### Task 5: Full Code Gate

Run:

    node --test tests/app-h5/designLanguage.test.mjs tests/app-h5/eventsLanguage.test.mjs tests/app-h5/projectsLanguage.test.mjs tests/app-h5/mobileDataCards.test.mjs tests/app-h5/apiResponse.test.mjs tests/pwa/appShell.test.mjs
    npm run build

Expected: all tests pass; build succeeds. Existing Vite size warnings are allowed only if they predate this work and do not block output.

### Task 6: Rendered Mobile QA

Temporary Playwright script: /tmp/door-h5-mobile-qa.mjs.

Flow under test:

    /app -> mobile shell renders -> records/processing/projects pages show app-like controls, no page-wide horizontal overflow, and data-heavy views use mobile cards when viewport is narrow.

Run:

    npm run dev -- --host 127.0.0.1
    node /tmp/door-h5-mobile-qa.mjs

Inspect at 320, 390, and 412px widths:

- page title and first meaningful content are visible.
- no framework overlay.
- no relevant console errors.
- document.documentElement.scrollWidth <= window.innerWidth + 1.
- topbar touch controls are at least 44px.
- .app-h5-table-cards is visible on card-enabled pages at mobile width.
- screenshots saved under /tmp/door-h5-product-grade-*.png.

## Completion Evidence

The work is complete only when current evidence proves:

- App shell install metadata and platform install UX exist.
- Mobile topbar and dock controls meet 44px touch target.
- Tabs no longer consume a full mobile screen as one-column controls.
- Records, processing, and project tables have mobile card alternatives without removing desktop tables.
- Project API envelopes cannot crash mobile metrics with projects.filter is not a function.
- Focused tests and npm run build pass.
- Rendered mobile QA passes at 320, 390, and 412px.
