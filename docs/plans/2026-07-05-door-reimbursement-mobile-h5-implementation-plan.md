# ArcSpro Reimbursement Mobile H5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the ArcSpro reimbursement module into a phone-friendly H5 workflow while preserving the desktop batch-processing and export tools.

**Architecture:** Keep `/app/reimbursements/*` as the authenticated route and keep the existing reimbursement API surface. Add mobile-specific React composition around the current store actions, use shared AppH5 table/card primitives for data-heavy views, and introduce small backend metadata only where mobile retry and queue states need it.

**Tech Stack:** React 19, Vite, Zustand, plain CSS, Express, Node built-in test runner, Playwright for rendered mobile QA.

---

## Product Decisions

- Mobile primary user: employee/operator submitting and checking reimbursements.
- Desktop remains the best place for batch edit, finance export, project cleanup, and model configuration.
- No separate `/mobile` app. Use responsive composition inside `/app/reimbursements/*`.
- Mobile does not rely on drag-and-drop. It uses camera/file capture, queue cards, detail drawers, and vertical review wizards.
- OCR cost, token usage, page count, duplicate warnings, and export readiness stay visible.
- Receipt images and OCR data must not be service-worker cached.

## Task 1: Lock Current Scope With Tests

**Files:**
- Modify: `tests/reimbursement/reimbursement-ui.test.mjs`
- Modify: `tests/pwa/appShell.test.mjs`

**Step 1: Write the failing reimbursement mobile assertions**

Add this test to `tests/reimbursement/reimbursement-ui.test.mjs`:

```js
test('reimbursement module exposes mobile capture and card-first surfaces', () => {
  const page = read('src/views/reimbursement/ReimbursementTool.jsx');
  const mobileShell = read('src/views/reimbursement/components/ReimbursementMobileHome.jsx');
  const table = read('src/views/reimbursement/components/ReimbursementTable.jsx');
  const css = read('src/views/reimbursement/reimbursement.css');

  assert.ok(page.includes('ReimbursementMobileHome'), 'ReimbursementTool should render a mobile workflow surface');
  assert.ok(mobileShell.includes('capture="environment"'), 'mobile capture should hint rear camera capture');
  assert.ok(mobileShell.includes('MobileOcrQueue'), 'mobile flow should render an OCR queue');
  assert.ok(mobileShell.includes('MobileReviewCard'), 'mobile flow should render review cards');
  assert.ok(table.includes('AppH5DataTable'), 'record table should use the shared responsive table primitive');
  assert.ok(table.includes('mobileCards='), 'record table should provide mobile cards');
  assert.ok(css.includes('.reimbursement-mobile-home'), 'mobile reimbursement shell should have concrete styles');
});
```

**Step 2: Write the mobile dock assertion**

In `tests/pwa/appShell.test.mjs`, extend the existing mobile shell test:

```js
assert.match(appLayout, /primaryKeys = \['dashboard', 'reimbursement', 'import', 'inventory-workbench'\]/);
```

**Step 3: Run tests to verify RED**

Run:

```bash
node --test tests/reimbursement/reimbursement-ui.test.mjs tests/pwa/appShell.test.mjs
```

Expected: FAIL because `ReimbursementMobileHome.jsx`, mobile cards, and mobile capture controls do not exist yet.

**Step 4: Commit**

```bash
git add tests/reimbursement/reimbursement-ui.test.mjs tests/pwa/appShell.test.mjs
git commit -m "test(reimbursement): cover mobile h5 workflow contract"
```

## Task 2: Add Mobile Workflow Shell

**Files:**
- Create: `src/views/reimbursement/components/ReimbursementMobileHome.jsx`
- Modify: `src/views/reimbursement/ReimbursementTool.jsx`
- Modify: `src/views/reimbursement/reimbursement.css`
- Test: `tests/reimbursement/reimbursement-ui.test.mjs`

**Step 1: Create `ReimbursementMobileHome.jsx`**

```jsx
import { useRef, useState } from 'react';
import MobileOcrQueue from './MobileOcrQueue';
import MobileReviewCard from './MobileReviewCard';
import useReimbursementStore from '../../../stores/reimbursementStore';

function ReimbursementMobileHome({ projectId, records = [], pendingMatches = [], onOpenRecord }) {
  const invoiceInputRef = useRef(null);
  const paymentInputRef = useRef(null);
  const [captureNotice, setCaptureNotice] = useState('');
  const importToPreview = useReimbursementStore((state) => state.importToPreview);
  const fetchPreviewFiles = useReimbursementStore((state) => state.fetchPreviewFiles);
  const fetchRecords = useReimbursementStore((state) => state.fetchRecords);
  const previewFiles = useReimbursementStore((state) => state.previewFiles);

  const handleCapture = async (event, documentType) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setCaptureNotice('正在上传票据...');
    try {
      await importToPreview(projectId, files, documentType, { sourceDevice: 'mobile-camera' });
      await Promise.all([fetchPreviewFiles(projectId), fetchRecords(projectId)]);
      setCaptureNotice('已加入识别队列');
    } catch (error) {
      setCaptureNotice(error?.message || '上传失败，请重试');
    } finally {
      event.target.value = '';
    }
  };

  const reviewRecords = records.filter((record) => record.preview_file_id);

  return (
    <section className="reimbursement-mobile-home" aria-label="手机报销工作台">
      <div className="reimbursement-mobile-home__actions">
        <button type="button" className="btn btn--primary" onClick={() => invoiceInputRef.current?.click()}>
          拍发票
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => paymentInputRef.current?.click()}>
          拍付款凭证
        </button>
      </div>

      <input ref={invoiceInputRef} type="file" accept="image/*,.pdf" capture="environment" multiple hidden onChange={(event) => handleCapture(event, 'invoice')} />
      <input ref={paymentInputRef} type="file" accept="image/*,.pdf" capture="environment" multiple hidden onChange={(event) => handleCapture(event, 'payment')} />

      {captureNotice ? <div className="reimbursement-mobile-home__notice">{captureNotice}</div> : null}
      <MobileOcrQueue projectId={projectId} files={previewFiles} />

      <div className="reimbursement-mobile-home__section">
        <h3>待复核</h3>
        {pendingMatches.length > 0 ? (
          <div className="reimbursement-mobile-home__warning">{pendingMatches.length} 笔付款凭证需要确认匹配</div>
        ) : null}
        {reviewRecords.slice(0, 5).map((record) => (
          <MobileReviewCard key={record.id} record={record} onOpen={() => onOpenRecord?.(record.id)} />
        ))}
      </div>
    </section>
  );
}

export default ReimbursementMobileHome;
```

**Step 2: Render it from `ReimbursementTool.jsx`**

Add import:

```jsx
import ReimbursementMobileHome from './components/ReimbursementMobileHome';
```

Render it beside the desktop preview workspace:

```jsx
<div className="reimbursement-tool__mobile-content">
  <ReimbursementMobileHome
    projectId={activeProjectId}
    records={records}
    pendingMatches={pendingMatches}
    onOpenRecord={(recordId) => {
      setFocusRecordId(recordId);
      setShowRecords(true);
      setShowAttachments(false);
    }}
  />
</div>
<div className="reimbursement-tool__desktop-content">
  <PreviewWorkspace ... />
</div>
```

**Step 3: Add responsive visibility styles**

```css
.reimbursement-tool__mobile-content { display: none; }
.reimbursement-tool__desktop-content { display: block; }
.reimbursement-mobile-home { display: grid; gap: 14px; }
.reimbursement-mobile-home__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.reimbursement-mobile-home__actions .btn { min-height: 48px; }
.reimbursement-mobile-home__notice,
.reimbursement-mobile-home__warning {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

@media (max-width: 768px) {
  .reimbursement-tool__mobile-content { display: block; }
  .reimbursement-tool__desktop-content { display: none; }
}
```

**Step 4: Run focused tests**

Run:

```bash
node --test tests/reimbursement/reimbursement-ui.test.mjs
```

Expected: still FAIL until queue/card components exist.

**Step 5: Commit**

```bash
git add src/views/reimbursement/ReimbursementTool.jsx src/views/reimbursement/components/ReimbursementMobileHome.jsx src/views/reimbursement/reimbursement.css tests/reimbursement/reimbursement-ui.test.mjs
git commit -m "feat(reimbursement): add mobile h5 capture shell"
```

## Task 3: Add Mobile Queue and Review Cards

**Files:**
- Create: `src/views/reimbursement/components/MobileOcrQueue.jsx`
- Create: `src/views/reimbursement/components/MobileReviewCard.jsx`
- Modify: `src/views/reimbursement/reimbursement.css`
- Modify: `src/stores/reimbursementStore.js`
- Test: `tests/reimbursement/reimbursement-ui.test.mjs`

**Step 1: Create `MobileOcrQueue.jsx`**

```jsx
import useReimbursementStore from '../../../stores/reimbursementStore';

function statusLabel(file) {
  if (file.status === 'ocr_processing') return '识别中';
  if (file.status === 'preview' && file.isDuplicate) return '重复待确认';
  if (file.status === 'preview') return '待识别';
  if (file.status === 'failed') return '失败，可重试';
  return file.status || '等待处理';
}

function MobileOcrQueue({ projectId, files = [] }) {
  const recognizeFromFile = useReimbursementStore((state) => state.recognizeFromFile);
  const fetchPreviewFiles = useReimbursementStore((state) => state.fetchPreviewFiles);
  const fetchRecords = useReimbursementStore((state) => state.fetchRecords);
  const pendingFiles = files.filter((file) => file.status === 'preview' || file.status === 'ocr_processing');

  const recognize = async (file) => {
    await recognizeFromFile(projectId, file.id, false, { refresh: false });
    await Promise.all([fetchPreviewFiles(projectId), fetchRecords(projectId)]);
  };

  return (
    <section className="mobile-ocr-queue" aria-label="识别队列">
      <header className="mobile-ocr-queue__header"><h3>识别队列</h3><span>{pendingFiles.length} 个文件</span></header>
      {pendingFiles.length === 0 ? (
        <div className="mobile-ocr-queue__empty">暂无待识别票据</div>
      ) : pendingFiles.map((file) => (
        <article key={file.id} className="mobile-ocr-queue__item">
          <div><strong>{file.originalName || file.fileName || file.file_name || '未命名票据'}</strong><span>{statusLabel(file)}</span></div>
          <button type="button" className="btn btn--ghost btn--sm" disabled={file.status === 'ocr_processing'} onClick={() => recognize(file)}>
            {file.status === 'ocr_processing' ? '识别中' : '识别'}
          </button>
        </article>
      ))}
    </section>
  );
}

export default MobileOcrQueue;
```

**Step 2: Create `MobileReviewCard.jsx`**

```jsx
import { getRecordExportIssueLabels, getOcrReviewStatus } from '../utils/ocrMetrics';

function formatAmount(record) {
  const value = Number(record.expense || record.income || 0);
  return value ? `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '未填金额';
}

function MobileReviewCard({ record, onOpen }) {
  const reviewStatus = getOcrReviewStatus(record);
  const exportIssues = getRecordExportIssueLabels(record, 0, [record]);

  return (
    <article className="mobile-review-card">
      <header className="mobile-review-card__header">
        <div><strong>{formatAmount(record)}</strong><span>{record.company || record.description || '未命名报销'}</span></div>
        <span className={reviewStatus.needsReview ? 'badge badge--review' : 'badge badge--success'}>
          {reviewStatus.needsReview ? `复核 ${reviewStatus.issueCount}` : '可入表'}
        </span>
      </header>
      <dl className="mobile-review-card__fields">
        <div><dt>日期</dt><dd>{record.payment_date || '-'}</dd></div>
        <div><dt>报销人</dt><dd>{record.reporter || '-'}</dd></div>
        <div><dt>类别</dt><dd>{[record.category, record.sub_category].filter(Boolean).join(' / ') || '-'}</dd></div>
      </dl>
      {exportIssues.length > 0 ? <div className="mobile-review-card__issues">{exportIssues.slice(0, 3).map((issue) => <span key={issue}>{issue}</span>)}</div> : null}
      <footer className="mobile-review-card__actions"><button type="button" className="btn btn--primary btn--sm" onClick={onOpen}>查看明细</button></footer>
    </article>
  );
}

export default MobileReviewCard;
```

**Step 3: Extend store upload metadata safely**

In `src/stores/reimbursementStore.js`, find `importToPreview`. Add optional metadata without breaking current callers:

```js
importToPreview: async (projectId, files, documentType = 'invoice', metadata = {}) => {
  // existing FormData setup
  if (metadata.sourceDevice) formData.append('sourceDevice', metadata.sourceDevice);
  if (metadata.clientUploadId) formData.append('clientUploadId', metadata.clientUploadId);
  // existing request
}
```

**Step 4: Run focused tests**

Run:

```bash
node --test tests/reimbursement/reimbursement-ui.test.mjs
```

Expected: PASS for the mobile shell contract.

**Step 5: Commit**

```bash
git add src/views/reimbursement/components/MobileOcrQueue.jsx src/views/reimbursement/components/MobileReviewCard.jsx src/views/reimbursement/reimbursement.css src/stores/reimbursementStore.js tests/reimbursement/reimbursement-ui.test.mjs
git commit -m "feat(reimbursement): add mobile ocr queue cards"
```

## Task 4: Convert Record Table to Desktop Table Plus Mobile Cards

**Files:**
- Modify: `src/views/reimbursement/components/ReimbursementTable.jsx`
- Modify: `src/views/reimbursement/reimbursement.css`
- Test: `tests/reimbursement/reimbursement-ui.test.mjs`

**Step 1: Import shared H5 primitives**

```jsx
import { AppH5DataCard, AppH5DataTable, AppH5StatusTag } from '../../../components/app/AppH5Surface';
```

**Step 2: Add `ReimbursementMobileRecordCard`**

```jsx
function ReimbursementMobileRecordCard({ record, selected, quality, onToggle, onEdit, onDelete }) {
  const amount = Number(record.expense || record.income || 0);
  const tone = quality.reviewStatus.needsReview || quality.exportIssues.length > 0 ? 'warning' : 'success';

  return (
    <AppH5DataCard
      className={selected ? 'reimbursement-mobile-record-card is-selected' : 'reimbursement-mobile-record-card'}
      eyebrow={record.payment_date || '未填日期'}
      title={record.description || record.company || '未命名报销'}
      meta={<AppH5StatusTag tone={tone}>{tone === 'success' ? '可导出' : '需处理'}</AppH5StatusTag>}
      fields={[
        { key: 'amount', label: '金额', value: amount ? `¥${amount.toLocaleString()}` : '-' },
        { key: 'reporter', label: '报销人', value: record.reporter },
        { key: 'category', label: '类别', value: [record.category, record.sub_category].filter(Boolean).join(' / ') },
        { key: 'company', label: '开票公司', value: record.company },
      ]}
      actions={<><button type="button" className="btn btn--ghost btn--sm" onClick={() => onToggle(record.id)}>{selected ? '取消选择' : '选择'}</button><button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(record)}>编辑</button><button type="button" className="btn btn--danger btn--sm" onClick={() => onDelete(record.id)}>删除</button></>}
    />
  );
}
```

**Step 3: Wrap the existing table**

Use:

```jsx
<AppH5DataTable
  className="reimbursement-table__container"
  mobileCards={sortedRecords.map((record) => {
    const quality = recordQualityMap.get(record.id) || {
      reviewStatus: getOcrReviewStatus(record),
      exportIssues: getRecordExportIssueLabels(record, 0, records),
    };
    return <ReimbursementMobileRecordCard key={record.id} record={record} selected={selectedIds.has(record.id)} quality={quality} onToggle={toggleSelect} onEdit={startEdit} onDelete={handleDelete} />;
  })}
>
  <table>...</table>
</AppH5DataTable>
```

**Step 4: Run focused tests**

Run:

```bash
node --test tests/reimbursement/reimbursement-ui.test.mjs tests/app-h5/mobileDataCards.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/views/reimbursement/components/ReimbursementTable.jsx src/views/reimbursement/reimbursement.css tests/reimbursement/reimbursement-ui.test.mjs
git commit -m "feat(reimbursement): render mobile record cards"
```

## Task 5: Replace Mobile Conflict Modal With Wizard Layout

**Files:**
- Modify: `src/views/reimbursement/components/MatchingCenterModal.jsx`
- Modify: `src/views/reimbursement/reimbursement.css`
- Test: `tests/reimbursement/reimbursement-ui.test.mjs`

**Step 1: Add test assertions**

```js
test('matching center supports mobile wizard layout', () => {
  const modal = read('src/views/reimbursement/components/MatchingCenterModal.jsx');
  const css = read('src/views/reimbursement/reimbursement.css');

  assert.ok(modal.includes('matching-modal__wizard-step'), 'matching modal should expose wizard sections');
  assert.ok(css.includes('.matching-modal--mobile-wizard'), 'matching modal should have mobile wizard class');
  assert.ok(css.includes('bottom: 0'), 'mobile matching modal should behave like a bottom sheet');
});
```

**Step 2: Add mobile class and wizard sections**

```jsx
<div className="matching-modal matching-modal--mobile-wizard" onClick={(e) => e.stopPropagation()}>
  ...
  <section className="matching-modal__wizard-step matching-modal__wizard-step--payment">...</section>
  <section className="matching-modal__wizard-step matching-modal__wizard-step--candidates">...</section>
</div>
```

**Step 3: Add mobile bottom-sheet CSS**

```css
@media (max-width: 768px) {
  .matching-modal-overlay { align-items: flex-end; }
  .matching-modal--mobile-wizard {
    width: 100%;
    max-width: none;
    max-height: min(86dvh, 720px);
    border-radius: 16px 16px 0 0;
    bottom: 0;
  }
  .matching-modal__content { display: grid; grid-template-columns: 1fr; gap: 14px; }
  .matching-modal__wizard-step { display: grid; gap: 10px; }
  .matching-modal__match-btn,
  .matching-modal__reject-btn,
  .matching-modal__nav-btn { min-height: 44px; }
}
```

**Step 4: Run focused tests**

```bash
node --test tests/reimbursement/reimbursement-ui.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/views/reimbursement/components/MatchingCenterModal.jsx src/views/reimbursement/reimbursement.css tests/reimbursement/reimbursement-ui.test.mjs
git commit -m "feat(reimbursement): adapt matching conflicts for mobile"
```

## Task 6: Add Rendered Mobile QA

**Files:**
- Create: `tests/reimbursement/reimbursement-mobile-render.test.mjs`
- Modify: `package.json`

**Step 1: Create a Playwright smoke test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

test('reimbursement mobile route has no page-wide overflow', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    await page.goto(`${BASE_URL}/app/reimbursements`, { waitUntil: 'networkidle' });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      hasMobileHome: Boolean(document.querySelector('.reimbursement-mobile-home')),
      hasDock: Boolean(document.querySelector('.workspace-mobile-dock')),
    }));
    assert.ok(metrics.scrollWidth <= metrics.innerWidth + 1, 'mobile page should not overflow horizontally');
    assert.equal(metrics.hasMobileHome, true, 'mobile reimbursement home should render');
    assert.equal(metrics.hasDock, true, 'app mobile dock should render');
  } finally {
    await browser.close();
  }
});
```

**Step 2: Add script**

```json
"test:reimbursement:mobile": "node --test tests/reimbursement/reimbursement-mobile-render.test.mjs"
```

If auth bootstrap is not ready, keep this as `tmp/reimbursement-mobile-qa.mjs` during implementation and commit only after the test can authenticate reliably.

**Step 3: Run app and rendered QA**

```bash
npm run dev -- --host 127.0.0.1
npm run test:reimbursement:mobile
```

Expected: PASS after auth/test setup is available; otherwise record the blocker and keep the temporary script output as QA evidence.

**Step 4: Commit**

```bash
git add tests/reimbursement/reimbursement-mobile-render.test.mjs package.json
git commit -m "test(reimbursement): add mobile render smoke coverage"
```

## Task 7: Full Verification Gate

**Files:**
- No code changes unless failures expose bugs.

**Step 1: Run static and unit gates**

```bash
node --test tests/reimbursement/reimbursement-ui.test.mjs tests/app-h5/mobileDataCards.test.mjs tests/pwa/appShell.test.mjs
npm run build
```

Expected: all pass.

**Step 2: Run backend reimbursement tests**

From `server`:

```bash
npm test -- --test-name-pattern='reimbursement|ocr|invoice'
```

Expected: PASS. If local Postgres access fails with `EPERM ::1:5432` or `127.0.0.1:5432`, rerun in an environment with the expected local DB instead of weakening the tests.

**Step 3: Run rendered viewport QA**

Check 390, 430, 768, and 1440 widths for:

- no horizontal overflow
- first visible mobile action is `拍发票` or `拍付款凭证`
- mobile dock does not cover reimbursement actions
- record list uses mobile cards at phone width
- desktop still renders the table and export controls

**Step 4: Final commit if verification fixes were needed**

```bash
git add <changed-files>
git commit -m "fix(reimbursement): close mobile h5 verification gaps"
```

## Completion Evidence

The implementation is complete only when the final response can name:

- the exact commit(s)
- the files changed
- the focused tests that passed
- the build result
- rendered mobile QA evidence path or the exact blocker
- confirmation that desktop export/table workflow still exists
