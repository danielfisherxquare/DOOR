# Credential Direct Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the credential module around `证件类别 + 通行区域编号`, complete the full data migration, and switch both DOOR and TOOL to the new semantics without keeping the old write path alive.

**Architecture:** Add a new credential schema layer for access areas, categories, requests, and request/access snapshots, then cut the Express service and React/Electron clients over to the new routes and types. Keep credential issuance, scan, void, reissue, and style-template infrastructure, but replace every old `role-template / zone / application override` assumption with category-color and numeric access-code semantics.

**Tech Stack:** Node.js, Express, Knex, PostgreSQL, React, React Router, Vite, Electron, TypeScript

---

### Task 1: Add the new credential schema and migration backfill

**Files:**
- Create: `door/server/src/db/migrations/20260317000001_create_credential_access_areas.js`
- Create: `door/server/src/db/migrations/20260317000002_create_credential_categories.js`
- Create: `door/server/src/db/migrations/20260317000003_create_credential_category_access_areas.js`
- Create: `door/server/src/db/migrations/20260317000004_create_credential_requests.js`
- Create: `door/server/src/db/migrations/20260317000005_create_credential_request_access_areas.js`
- Create: `door/server/src/db/migrations/20260317000006_create_credential_credential_access_areas.js`
- Create: `door/server/src/db/migrations/20260317000007_migrate_legacy_credential_data.js`
- Modify: `door/server/src/db/migrations/20260316000008_create_credential_credentials.js`
- Test: `door/server/tests/credential-migration.test.js`

**Step 1: Write the failing migration test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('legacy credential data migrates into categories, access areas, requests, and credential snapshots', async () => {
  assert.fail('not implemented');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix door/server test -- tests/credential-migration.test.js`
Expected: FAIL with a missing migration helper or assertion failure.

**Step 3: Write the minimal implementation**

```js
// access_areas: use access_code text, validate /^[0-9]+$/, keep geometry nullable
// categories: store category_name, category_code, card_color, requires_review, default_style_template_id
// requests: replace applications, add source_mode and optional job_title
// request_access_areas: store resolved final access list, not add/remove deltas
// credential_access snapshots: replace credential_credential_zones semantics
// migration backfill:
// 1. map legacy zones -> access areas
// 2. turn non-digit zone_code into stable numeric access_code by sort_order,id
// 3. map role_templates -> categories
// 4. map role_template_zones -> category_access_areas
// 5. map applications -> requests with job_title=role_name
// 6. rebuild request access rows from role-template relations + overrides
// 7. rebuild credential access snapshots from legacy credential_credential_zones
```

**Step 4: Run migration test to verify it passes**

Run: `npm --prefix door/server test -- tests/credential-migration.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git -C door add server/src/db/migrations server/tests/credential-migration.test.js
git -C door commit -m "feat: add credential direct-refactor schema and legacy backfill"
```

### Task 2: Replace repository and service semantics with access areas and categories

**Files:**
- Modify: `door/server/src/modules/credential/credential.repository.js`
- Modify: `door/server/src/modules/credential/credential.service.js`
- Create: `door/server/tests/credential-refactor.routes.test.js`

**Step 1: Write the failing route/service test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('access areas reject non-numeric access codes and categories return card colors', async () => {
  assert.fail('not implemented');
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix door/server test -- tests/credential-refactor.routes.test.js`
Expected: FAIL because the new routes or service output do not exist yet.

**Step 3: Write the minimal implementation**

```js
// repository:
// - add find/insert/update/delete for access_areas, categories, category_access_areas, requests, request_access_areas
// - add credential snapshot reads from credential_credential_access_areas
//
// service:
// - get/create/update/delete access areas using numeric-string validation
// - get/create/update/delete categories with cardColor and default accessAreas
// - remove default_zone_code and zoneOverrides from all new write paths
// - return categoryName/categoryColor/jobTitle/accessAreas in credential detail and scan result
// - keep issue/void/reissue status flow unchanged
```

**Step 4: Run the test to verify it passes**

Run: `npm --prefix door/server test -- tests/credential-refactor.routes.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git -C door add server/src/modules/credential server/tests/credential-refactor.routes.test.js
git -C door commit -m "feat: switch credential service to access areas and categories"
```

### Task 3: Replace credential routes and request/review contract

**Files:**
- Modify: `door/server/src/modules/credential/credential.routes.js`
- Modify: `door/src/api/credential.js`
- Modify: `tool/src/services/credentialApi.ts`

**Step 1: Write the minimal implementation**

```js
// Express routes:
// GET/POST/PUT/DELETE /api/credential/access-areas/:raceId
// GET/POST/PUT/DELETE /api/credential/categories/:raceId
// GET/POST /api/credential/requests/:raceId
// GET /api/credential/requests/:raceId/:requestId
// POST /api/credential/requests/:raceId/:requestId/review
// existing credentials, scan, issue, void, reissue routes stay under /credentials
//
// request payload:
// {
//   sourceMode: 'self_service' | 'admin_direct',
//   categoryId: number,
//   personName: string,
//   orgName?: string,
//   jobTitle?: string,
//   accessCodes?: string[],
//   remark?: string
// }
//
// review payload:
// {
//   approved: boolean,
//   categoryId?: number,
//   jobTitle?: string,
//   accessCodes?: string[],
//   remark?: string,
//   rejectReason?: string
// }
```

**Step 2: Run focused server tests**

Run: `npm --prefix door/server test -- tests/credential-refactor.routes.test.js`
Expected: PASS with the new route names and payload contract.

**Step 3: Verify no old write route remains referenced**

Run: `rg -n "role-templates|zones|applications/.*/review|zoneOverrides|defaultZoneCode" door/src door/server tool/src -S`
Expected: only legacy migration code and comments remain; active clients use `access-areas`, `categories`, `requests`, `accessCodes`.

**Step 4: Commit**

```bash
git -C door add server/src/modules/credential/credential.routes.js src/api/credential.js
git -C door commit -m "feat: replace credential public routes and web api contract"
```

### Task 4: Refactor the DOOR admin navigation and page naming

**Files:**
- Modify: `door/src/components/admin/AdminLayout.jsx`
- Modify: `door/src/views/admin/credential/CredentialSelectRacePage.jsx`
- Modify: `door/src/views/admin/credential/CredentialZonePage.jsx`
- Modify: `door/src/views/admin/credential/CredentialRolePage.jsx`
- Modify: `door/src/views/admin/credential/CredentialApplicationPage.jsx`
- Modify: `door/src/views/admin/credential/CredentialReviewPage.jsx`
- Modify: `door/src/views/admin/credential/CredentialStylePage.jsx`

**Step 1: Write the minimal implementation**

```jsx
// AdminLayout:
// - rename menu labels to 通行区域 / 证件类别 / 证件申请与直建 / 证件审核 / 证件样式
// - keep /admin/credential/select-race entry
// - change child route paths to /access-areas /categories /requests /review /styles
// - keep client redirects from old paths to the new paths for one cutover cycle
//
// page responsibilities:
// - CredentialZonePage -> 通行区域管理 and numeric access-code validation
// - CredentialRolePage -> 证件类别管理 with cardColor and default accessCodes
// - CredentialApplicationPage -> mixed self-service + admin_direct creation UI
// - CredentialReviewPage -> edit whole accessCodes list, not add/remove overrides
// - CredentialStylePage -> 14x10 portrait default preset and category-aware copy
```

**Step 2: Run the frontend build**

Run: `npm --prefix door run build`
Expected: PASS.

**Step 3: Commit**

```bash
git -C door add src/components/admin/AdminLayout.jsx src/views/admin/credential src/api/credential.js
git -C door commit -m "feat: refactor DOOR credential admin pages to category and access-code model"
```

### Task 5: Update TOOL layout types and default template behavior

**Files:**
- Modify: `tool/src/types/credentialLayout.ts`
- Modify: `tool/src/components/credential/CredentialLayoutView.tsx`
- Modify: `tool/src/components/credential/CredentialGenerateView.tsx`
- Modify: `tool/electron/credentialExportWorker.cjs`
- Test: `tool/src/types/credentialLayout.test.ts`

**Step 1: Write the failing pure-type/layout test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultLayout } from './credentialLayout';

test('default credential layout uses 10cm x 14cm portrait page size', () => {
  const layout = createDefaultLayout();
  assert.equal(layout.pageWidth, 283.46);
  assert.equal(layout.pageHeight, 396.85);
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix tool test -- src/types/credentialLayout.test.ts`
Expected: FAIL because the default layout still uses the old square size or old field keys.

**Step 3: Write the minimal implementation**

```ts
// replace field keys:
// roleName -> categoryName
// zoneList -> accessCodeList
// zoneLegend -> accessLegend
// add jobTitle and categoryColor dataset support
//
// createDefaultLayout():
// pageWidth = 283.46
// pageHeight = 396.85
// place accessCodeList prominently on the front
//
// export worker:
// resolve categoryName/jobTitle/accessCodeList/categoryColor
// paint badge background from categoryColor before drawing dynamic fields
```

**Step 4: Run the test and build**

Run: `npm --prefix tool test -- src/types/credentialLayout.test.ts`
Expected: PASS.

Run: `npm --prefix tool run build`
Expected: PASS.

**Step 5: Commit**

```bash
git -C tool add src/types/credentialLayout.ts src/components/credential/CredentialLayoutView.tsx src/components/credential/CredentialGenerateView.tsx electron/credentialExportWorker.cjs src/types/credentialLayout.test.ts
git -C tool commit -m "feat: switch TOOL credential layout to portrait category and access-code fields"
```

### Task 6: Refactor TOOL issue and scan views to the new response contract

**Files:**
- Modify: `tool/src/components/credential/CredentialIssueView.tsx`
- Modify: `tool/src/components/credential/CredentialScanView.tsx`
- Modify: `tool/src/services/credentialApi.ts`

**Step 1: Write the minimal implementation**

```ts
// issue view:
// - consume categoryName, categoryColor, jobTitle, accessAreas[]
// - render category swatch and numeric access chips
//
// scan view:
// - show categoryName and accessAreas[].accessCode
// - remove zone-color-as-badge-main-color assumption
// - keep offline verification bridge unchanged
```

**Step 2: Run the TOOL build**

Run: `npm --prefix tool run build`
Expected: PASS.

**Step 3: Commit**

```bash
git -C tool add src/components/credential/CredentialIssueView.tsx src/components/credential/CredentialScanView.tsx src/services/credentialApi.ts
git -C tool commit -m "feat: update TOOL issue and scan views for category and access-code responses"
```

### Task 7: Add direct-create request flow and manual regression checklist

**Files:**
- Modify: `door/src/views/admin/credential/CredentialApplicationPage.jsx`
- Modify: `door/src/views/admin/credential/CredentialReviewPage.jsx`
- Modify: `door/src/views/admin/credential/CredentialSelectRacePage.jsx`
- Create: `door/docs/plans/credential-direct-refactor-regression-checklist.md`

**Step 1: Write the minimal implementation**

```md
# Credential Direct Refactor Regression Checklist
- 创建数字通行区域，验证非数字编码被拒绝
- 创建证件类别并绑定多个默认通行区域
- 自助申请提交并进入审核
- 管理员直建请求并直接生成
- 审核时替换 accessCodes 列表
- 证件详情、发放、扫码、补打、作废、历史记录核对
- TOOL 默认模板尺寸和导出颜色验证
```

**Step 2: Run full project verification**

Run: `npm --prefix door/server test -- tests/credential-migration.test.js tests/credential-refactor.routes.test.js`
Expected: PASS.

Run: `npm --prefix door run build`
Expected: PASS.

Run: `npm --prefix tool run build`
Expected: PASS.

**Step 3: Commit**

```bash
git -C door add src/views/admin/credential docs/plans/credential-direct-refactor-regression-checklist.md
git -C door commit -m "docs: add credential direct-refactor regression checklist"
```

### Task 8: Remove stale references and finalize the cutover

**Files:**
- Modify: `door/src/api/credential.js`
- Modify: `tool/src/services/credentialApi.ts`
- Modify: `door/docs/plans/2026-03-17-credential-race-selection-design.md`
- Modify: `door/docs/plans/2026-03-17-credential-race-selection-plan.md`

**Step 1: Write the minimal implementation**

```md
Mark the race-selection design/plan as superseded by the direct-refactor plan.
Leave only route-selection notes that still apply to /admin/credential/select-race.
Remove remaining active references to role templates, zones as badge semantics, applications review overrides, and defaultZoneCode from client docs.
```

**Step 2: Verify no stale active client contract remains**

Run: `rg -n "defaultZoneCode|zoneOverrides|roleTemplate|role-templates|zoneList|zoneLegend" door/src tool/src -S`
Expected: only intentional migration notes or obsolete-doc markers remain.

**Step 3: Commit**

```bash
git -C door add src/api/credential.js docs/plans/2026-03-17-credential-race-selection-design.md docs/plans/2026-03-17-credential-race-selection-plan.md
git -C door commit -m "chore: finalize credential direct-refactor cutover docs"
```
