# ArcSpro Reimbursement Mobile H5 Design

## Context

Current checkout:

- Repository: `/Users/xquare/scratch/door`
- Branch: `release/door-current-2026-05-18`
- Local commit during review: `8224810`
- Target route: `/app/reimbursements/*`

Hot frontend files:

- `src/views/reimbursement/ReimbursementTool.jsx`
- `src/views/reimbursement/components/PreviewWorkspace.jsx`
- `src/views/reimbursement/components/ReimbursementTable.jsx`
- `src/views/reimbursement/components/MatchingCenterModal.jsx`
- `src/views/reimbursement/components/AttachmentManager.jsx`
- `src/views/reimbursement/reimbursement.css`

Hot backend/API files:

- `server/src/modules/app/app-reimbursement.routes.js`
- `server/src/modules/reimbursement/preview.controller.js`
- `server/src/modules/reimbursement/reimbursement.controller.js`
- `server/src/modules/reimbursement/ocr.service.js`

The app already has an H5/PWA shell. The reimbursement module has started using shared H5 page primitives, and the mobile dock already prioritizes the reimbursement entry. The missing work is inside the reimbursement workflow: the current core interactions still assume a desktop operator with a wide table, a mouse, and drag-and-drop.

## Reference Products

The mature product pattern is consistent across SAP Concur ExpenseIt, Expensify SmartScan, Zoho Expense, Ramp Mobile, HoseCloud/合思, and Feishu AI invoice flows:

- Mobile starts from capture: take a photo, select a receipt file, or forward/import a digital receipt.
- OCR creates a draft expense. The user checks a few fields instead of filling a long form.
- Duplicate, policy, or matching problems become focused review tasks.
- Desktop remains better for bulk correction, finance review, export, policy configuration, and audit.
- Offline or weak-network capture should queue work instead of losing files.

Useful source handles:

- SAP Concur ExpenseIt: `https://www.concur.com/products/expenseit`
- Expensify receipt scanning: `https://use.expensify.com/receipt-scanning-app`
- Zoho Expense mobile: `https://www.zoho.com/us/expense/mobile-apps/`
- Ramp mobile app: `https://support.ramp.com/ramp-mobile-app/`
- 合思 App Store listing: `https://apps.apple.com/cn/app/id996028722`
- Feishu invoice AI workflow: `https://www.feishu.cn/content/539956127009`

## Product Goal

Make the reimbursement module feel like a complete mobile H5 app without splitting the product into a second mobile system.

Success looks like this on a phone:

1. The user opens `/app/reimbursements`.
2. The first visible actions are `拍发票`, `导入文件`, and `查看待复核`.
3. A receipt photo becomes an OCR draft.
4. The user checks amount/date/company/reporter/category and submits.
5. The user can see which items need review, which are ready to export, and which have been reimbursed.
6. Every desktop capability still exists, but batch-heavy actions move behind cards, drawers, or a desktop-first view.

## Scope

In scope:

- Employee/self-service mobile flow for capture, OCR, review, record editing, attachment viewing, conflict resolution, and status tracking.
- Finance/operator mobile flow for lightweight review and approval-style actions.
- Desktop-compatible table and export flow.
- Rendered mobile QA at 390px and 430px widths.
- API-compatible additions only. Existing `/api/app/reimbursements` routes remain the main contract.

Out of scope for this pass:

- Replacing the current reimbursement database model.
- Building native iOS or Android apps.
- Full corporate card integrations.
- Payment execution or bank transfer automation.
- Rewriting OCR provider selection.

## Recommended Approach

Use one authenticated app route with device-specific UI composition:

- Desktop: preserve project selector, preview workspace, table editing, batch actions, export, and configuration.
- Mobile: render a task-oriented shell with capture actions, queue cards, review cards, detail drawers, and bottom-safe sticky actions.
- Backend: keep current endpoints; add small metadata needed for queue/resume and rendered mobile states.

Do not fork a second `/mobile/reimbursements` product. That would double route guards, permissions, tests, and API wiring. The existing `/app/*` surface is the correct boundary.

## Mobile Information Architecture

Mobile tabs:

- `拍票据`: camera/file capture, OCR queue, recent uploads.
- `待复核`: OCR low-confidence items, duplicate files, missing fields, risky export records.
- `明细`: reimbursement record cards with filters and search.
- `票据`: invoice/payment gallery and attachment replacement.
- `项目`: project switch/create, project summary, export jobs.

Desktop tabs can stay close to the current structure:

- `导入与识别`
- `报销明细`
- `票据管理`
- `项目管理`

## Core Mobile Flows

### Flow 1: Capture and OCR

```text
Open /app/reimbursements
-> tap 拍发票
-> browser camera opens with rear camera hint
-> photo enters local upload queue
-> upload creates preview file
-> OCR runs one file at a time
-> draft appears as a review card
```

Required visible states:

- `等待上传`
- `上传中`
- `待识别`
- `识别中`
- `需复核`
- `已入表`
- `失败，可重试`

### Flow 2: Draft Review

Mobile record review card:

```text
¥128.00
杭州某某餐饮有限公司
2026-07-05
餐饮 / 工作餐
报销人：张三
状态：需复核 2 项

[查看票据] [编辑字段] [确认入表]
```

Only high-value fields appear on the card. Full fields move into a detail drawer.

### Flow 3: Conflict Matching

Current problem: `MatchingCenterModal` is a desktop two-column decision surface.

Mobile target:

```text
待分配付款凭证
金额：¥128.00
日期：2026-07-05

候选发票 1
杭州某某餐饮有限公司 / ¥128.00 / 2026-07-05
[确认关联]

候选发票 2
...

[独立作为新记录] [稍后处理]
```

The user should compare one payment against a vertical list of invoice cards. No horizontal comparison layout on phones.

### Flow 4: Record List

Desktop keeps a table. Mobile renders cards through `AppH5DataTable mobileCards`:

```jsx
<AppH5DataTable mobileCards={records.map((record) => (
  <AppH5DataCard
    key={record.id}
    eyebrow={record.payment_date || '未填日期'}
    title={record.description || record.company || '未命名报销'}
    meta={<AppH5StatusTag tone={record.has_invoice ? 'success' : 'warning'}>
      {record.has_invoice ? '有发票' : '缺发票'}
    </AppH5StatusTag>}
    fields={[
      { key: 'amount', label: '金额', value: formatCurrency(record.expense || record.income) },
      { key: 'reporter', label: '报销人', value: record.reporter },
      { key: 'category', label: '类别', value: [record.category, record.sub_category].filter(Boolean).join(' / ') },
      { key: 'company', label: '开票公司', value: record.company },
    ]}
    actions={<button className="btn btn--ghost btn--sm">编辑</button>}
  />
))}>
  <table>...</table>
</AppH5DataTable>
```

## Component Design

New or refactored frontend pieces:

- `ReimbursementMobileHome`: mobile-first tab composition and capture actions.
- `MobileCaptureActions`: camera/file/PDF entry.
- `MobileOcrQueue`: upload and recognition queue cards.
- `MobileReviewCard`: OCR draft and record review card.
- `MobileRecordDrawer`: field edit drawer for one record.
- `MobileMatchingWizard`: payment-to-invoice conflict resolution.
- `MobileAttachmentGallery`: thumbnail gallery and full-screen preview.

These should reuse existing store actions first. Add store methods only when the UI needs a clean queue abstraction.

Existing components to preserve:

- `PreviewWorkspace`: desktop batch import and recognition.
- `ReimbursementTable`: desktop table and export controls.
- `AttachmentManager`: desktop/full gallery path, refactored to share mobile card primitives where possible.
- `ProjectManagementPage`: desktop project CRUD, with a compact mobile project switch/create mode.

## Data and API Contract

Keep using:

- `POST /api/app/reimbursements/projects/:id/preview/import`
- `POST /api/app/reimbursements/projects/:id/preview/:fileId/recognize`
- `GET /api/app/reimbursements/projects/:id/preview/list`
- `GET /api/app/reimbursements/projects/:id/records`
- `PUT /api/app/reimbursements/records/:id`
- `POST /api/app/reimbursements/pending-matches/:id/resolve`
- `POST /api/app/reimbursements/pending-matches/:id/reject`
- `GET /api/app/reimbursements/attachments/:id/thumbnail`
- `GET /api/app/reimbursements/attachments/:id/image`

Add only if needed:

- `clientUploadId`: browser-generated idempotency key for mobile retry.
- `sourceDevice`: `mobile-camera`, `mobile-gallery`, `desktop-upload`.
- `captureMode`: `invoice` or `payment`.
- `queueStatus`: server-normalized status for mobile queue rendering.
- `lastErrorCode` and `lastErrorMessage`: short retry explanations.

Example upload payload:

```http
POST /api/app/reimbursements/projects/123/preview/import
Content-Type: multipart/form-data

files: receipt.jpg
documentType: invoice
clientUploadId: mobile-20260705-153001-abc123
sourceDevice: mobile-camera
```

## Error Handling

Replace browser `alert()` and `confirm()` in mobile paths with app UI:

- paid OCR warning: bottom sheet with estimated pages and token/cost hint.
- duplicate upload: review card showing the existing record or preview file.
- failed upload: retry button on the queue card.
- failed OCR: keep the file in queue; do not lose the image.
- risky export: show warnings and a deliberate confirm button.

Desktop can keep a faster confirmation flow, but should gradually move to shared app dialogs for consistency.

## Offline and Weak Network Behavior

Minimum viable mobile behavior:

- If upload fails before reaching the server, keep the file in browser memory during the session and show retry.
- If the page reloads before upload, the file may be lost, but the UI must say so plainly.
- If upload succeeds and OCR fails, the server preview file remains visible and retryable.

Later PWA behavior:

- Persist queue metadata in IndexedDB.
- Use Background Sync when available.
- Keep only short-lived local copies, because receipts can contain sensitive data.

## Security and Privacy

- Keep `requirePermission({ surface: 'app', capability: { scope: 'self', name: 'operate' } })` on app reimbursement routes.
- Keep `requireReimbursementAccess` around project, record, attachment, pending-match, and export endpoints.
- Do not cache receipt images in the service worker.
- Do not include OCR payloads, invoice images, or tax identifiers in route query strings.
- Avoid long-lived local image blobs unless an explicit offline queue is added.

## Testing and Acceptance

Static and unit tests:

- `node --test tests/pwa/appShell.test.mjs`
- `node --test tests/app-h5/mobileDataCards.test.mjs`
- `node --test tests/reimbursement/reimbursement-ui.test.mjs`
- targeted backend reimbursement/OCR tests under `server/tests`

Rendered mobile QA:

- viewport widths: 390, 430, 768, 1440
- route: `/app/reimbursements`
- checks:
  - no page-wide horizontal overflow
  - first meaningful mobile action visible without scrolling past desktop-only controls
  - all primary mobile controls at least 44px high
  - mobile record cards visible instead of the 14-column table
  - bottom dock does not cover sticky reimbursement actions
  - OCR queue and error states remain readable

Done means a phone user can complete the whole self-service reimbursement path without switching to desktop, while finance users still have the existing desktop power tools.
