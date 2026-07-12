# TeamListPage Boundary Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce `TeamListPage.jsx` from 1075 lines to at most 925 without changing its route, DOM, CSS, API calls, import format, photo rules, or operator workflow.

**Architecture:** Keep page state and API orchestration in `TeamListPage.jsx`. Move deterministic member data logic to `teamListPageData.js`, all `xlsx` access to `teamMemberWorkbook.js`, and authenticated photo loading plus preview-file lifecycle helpers to a typed `TeamMemberPhoto.tsx` component.

**Tech Stack:** React 19, TypeScript/TSX, Vite 8, SheetJS `xlsx`, Node test runner, ESLint, Prettier.

---

## Execution rules

- Work only in `/Users/xquare/scratch/door/.worktrees/door-remediation-20260710`.
- Preserve the existing JSX tree, CSS classes, text, `adminApi` method signatures, and response handling.
- Follow red-green-refactor for every task.
- Use `apply_patch` for source and test edits.
- Do not push or deploy.
- Before each commit, run `git diff --check` as a standalone command and stop if it fails.

### Task 1: Extract deterministic team-list data helpers

**Files:**

- Create: `src/views/admin/teamListPageData.js`
- Create: `tests/admin/teamListPageData.test.mjs`

**Step 1: Write the failing data tests**

Create tests that import the missing module and assert:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

test('team employee codes fill numeric gaps and preserve occupied state', async () => {
  const data = await import('../../src/views/admin/teamListPageData.js')
  const options = data.buildEmployeeCodeOptions(['STA001', 'STA003'], 'MANUAL')

  assert.deepEqual(options.find((item) => item.code === 'STA001'), {
    code: 'STA001',
    occupied: true,
  })
  assert.deepEqual(options.find((item) => item.code === 'STA002'), {
    code: 'STA002',
    occupied: false,
  })
  assert.ok(options.some((item) => item.code === 'MANUAL' && item.occupied === false))
})

test('team import rows map template titles and remove empty rows', async () => {
  const data = await import('../../src/views/admin/teamListPageData.js')
  const rows = data.normalizeTeamImportRows(
    [{ 姓名: '张三', 部门: '执行' }, { 姓名: ' ', 部门: '' }],
    [{ title: '姓名', key: 'employeeName' }, { title: '部门', key: 'department' }],
  )

  assert.deepEqual(rows, [{ employeeName: '张三', department: '执行' }])
  assert.equal(data.EMPTY_TEAM_MEMBER_FORM.memberType, 'employee')
})
```

**Step 2: Run the tests and observe RED**

Run:

```bash
node --test tests/admin/teamListPageData.test.mjs
```

Expected: FAIL because `teamListPageData.js` does not exist.

**Step 3: Implement the minimal data module**

Move, without semantic changes:

- `MEMBER_TYPE_LABELS`
- `EXTERNAL_TYPE_LABELS`
- `emptyForm` as `EMPTY_TEAM_MEMBER_FORM`
- `PAGE_LIMIT`, `EMPLOYEE_CODE_PAGE_SIZE`, `EMPLOYEE_CODE_SUGGESTION_LIMIT`
- `parseEmployeeCode`
- `buildEmployeeCodeOptions`

Add the extracted import normalization:

```js
export function normalizeTeamImportRows(rows, columns) {
  const titleToKeyMap = new Map(columns.map((item) => [item.title, item.key]))
  return rows
    .map((row) => Object.fromEntries(
      Object.entries(row).map(([title, value]) => [titleToKeyMap.get(title) || title, value]),
    ))
    .filter((row) => Object.values(row).some((value) => String(value || '').trim()))
}
```

Do not wire the page yet.

**Step 4: Verify GREEN and formatting**

Run:

```bash
node --test tests/admin/teamListPageData.test.mjs
npx prettier --check src/views/admin/teamListPageData.js tests/admin/teamListPageData.test.mjs
git diff --check
```

Expected: 2/2 tests pass and both checks exit 0.

**Step 5: Commit**

```bash
git add src/views/admin/teamListPageData.js tests/admin/teamListPageData.test.mjs
git commit -m "refactor(team): extract team list data helpers"
```

### Task 2: Isolate XLSX parsing and template generation

**Files:**

- Create: `src/views/admin/teamMemberWorkbook.js`
- Create: `tests/admin/teamMemberWorkbook.test.mjs`

**Step 1: Write the failing workbook tests**

Build a real workbook through the public helper, inspect its first sheet, write it to an array, then parse it back:

```js
test('team workbook preserves titles, field descriptions, and sample rows', async () => {
  const workbook = await import('../../src/views/admin/teamMemberWorkbook.js')
  const columns = [
    { key: 'employeeCode', title: '工号', required: true },
    { key: 'employeeName', title: '姓名', required: false },
  ]
  const book = workbook.createTeamImportWorkbook(columns, [
    { employeeCode: 'STA001', employeeName: '张三' },
  ])

  assert.deepEqual(workbook.readFirstSheetRows(book), [
    ['工号', '姓名'],
    ['employeeCode（必填）', 'employeeName（选填）'],
    ['STA001', '张三'],
  ])
})

test('team workbook parses the first sheet through the shared row contract', async () => {
  const workbook = await import('../../src/views/admin/teamMemberWorkbook.js')
  const columns = [{ key: 'employeeCode', title: '工号', required: true }]
  const book = workbook.createTeamImportWorkbook(columns, [{ employeeCode: 'STA001' }])
  const buffer = workbook.writeTeamImportWorkbookBuffer(book)

  assert.deepEqual(workbook.parseTeamImportWorkbook(buffer, columns), [
    { employeeCode: 'employeeCode（必填）' },
    { employeeCode: 'STA001' },
  ])
})
```

The parser intentionally preserves the current behavior: an uploaded server template includes the field-description row as data unless the operator removes it.

**Step 2: Run the tests and observe RED**

```bash
node --test tests/admin/teamMemberWorkbook.test.mjs
```

Expected: FAIL because `teamMemberWorkbook.js` does not exist.

**Step 3: Implement the workbook boundary**

The module may import `xlsx`; no other new module may do so.

```js
import * as XLSX from 'xlsx'
import { normalizeTeamImportRows } from './teamListPageData.js'

export function createTeamImportWorkbook(columns, sampleRows) {
  const titleRow = columns.map((item) => item.title)
  const descriptionRow = columns.map(
    (item) => `${item.key}${item.required ? '（必填）' : '（选填）'}`,
  )
  const samples = sampleRows.map((row) => columns.map((item) => row[item.key] ?? ''))
  const worksheet = XLSX.utils.aoa_to_sheet([titleRow, descriptionRow, ...samples])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '团队成员模板')
  return workbook
}

export function writeTeamImportTemplate({ columns, sampleRows, fileName }) {
  XLSX.writeFile(createTeamImportWorkbook(columns, sampleRows), fileName)
}

export function parseTeamImportWorkbook(buffer, columns) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
  return normalizeTeamImportRows(rows, columns)
}
```

Export small test seams for first-sheet rows and array writing instead of mocking SheetJS.

**Step 4: Verify GREEN**

```bash
node --test tests/admin/teamListPageData.test.mjs tests/admin/teamMemberWorkbook.test.mjs
npx prettier --check src/views/admin/teamMemberWorkbook.js tests/admin/teamMemberWorkbook.test.mjs
git diff --check
```

Expected: 4/4 tests pass.

**Step 5: Commit**

```bash
git add src/views/admin/teamMemberWorkbook.js tests/admin/teamMemberWorkbook.test.mjs
git commit -m "refactor(team): isolate member workbook IO"
```

### Task 3: Extract the typed photo component and wire page boundaries

**Files:**

- Create: `src/views/admin/TeamMemberPhoto.tsx`
- Create: `tests/admin/teamListPageArchitecture.test.mjs`
- Modify: `src/views/admin/TeamListPage.jsx`

**Step 1: Write the failing architecture tests**

Assert the intended dependency graph and page limit:

```js
const pageSource = await readFile('src/views/admin/TeamListPage.jsx', 'utf8')
const photoSource = await readFile('src/views/admin/TeamMemberPhoto.tsx', 'utf8')

assert.doesNotMatch(pageSource, /from ['"]xlsx['"]/)
assert.match(pageSource, /from ['"]\.\/teamListPageData\.js['"]/)
assert.match(pageSource, /from ['"]\.\/teamMemberWorkbook\.js['"]/)
assert.match(pageSource, /from ['"]\.\/TeamMemberPhoto['"]/)
assert.doesNotMatch(pageSource, /function TeamMemberPhoto/)
assert.ok(pageSource.split('\n').length <= 925)
assert.match(photoSource, /interface TeamMemberPhotoProps/)
assert.match(photoSource, /URL\.revokeObjectURL/)
```

**Step 2: Run the test and observe RED**

```bash
node --test tests/admin/teamListPageArchitecture.test.mjs
```

Expected: FAIL because the component does not exist and the page still imports `xlsx`.

**Step 3: Implement `TeamMemberPhoto.tsx`**

Move the current component without changing its load/fallback behavior. Use the approved props contract:

```ts
interface TeamMemberPhotoProps {
  teamMemberId: string | number
  hasPhoto: boolean
  orgId?: string
  alt: string
  style?: CSSProperties
  placeholder: ReactNode
}
```

Also export `revokePreviewUrl` and `validatePortraitPhotoFile` with the current error messages and `0.015` ratio tolerance.

**Step 4: Wire the page**

- Remove the direct `xlsx` import.
- Import constants and helpers from `teamListPageData.js`.
- Import parse/write functions from `teamMemberWorkbook.js`.
- Import `TeamMemberPhoto`, `revokePreviewUrl`, and `validatePortraitPhotoFile` from `TeamMemberPhoto.tsx`.
- Replace `emptyForm` references with `EMPTY_TEAM_MEMBER_FORM`.
- Replace inline download XLSX construction with `writeTeamImportTemplate`.
- Replace inline upload parsing/normalization with `parseTeamImportWorkbook`.
- Delete the moved functions and component.

Do not alter JSX, CSS, API calls, response messages, or dialog state transitions.

**Step 5: Verify GREEN**

```bash
node --test tests/admin/teamListPageData.test.mjs \
  tests/admin/teamMemberWorkbook.test.mjs \
  tests/admin/teamListPageArchitecture.test.mjs
npm run typecheck
npm run lint -- --quiet
npx prettier --check src/views/admin/TeamListPage.jsx \
  src/views/admin/TeamMemberPhoto.tsx \
  src/views/admin/teamListPageData.js \
  src/views/admin/teamMemberWorkbook.js \
  tests/admin/teamListPageData.test.mjs \
  tests/admin/teamMemberWorkbook.test.mjs \
  tests/admin/teamListPageArchitecture.test.mjs
git diff --check
```

Expected: all targeted tests pass, TypeScript and ESLint exit 0, and the page is at most 925 lines.

**Step 6: Commit**

```bash
git add src/views/admin/TeamListPage.jsx \
  src/views/admin/TeamMemberPhoto.tsx \
  tests/admin/teamListPageArchitecture.test.mjs
git commit -m "refactor(team): split team list page boundaries"
```

### Task 4: Run full verification and independent review

**Files:**

- Review only: all files from Tasks 1-3

**Step 1: Run repository gates**

```bash
npm run format:check
npm run lint -- --quiet
npm run typecheck
npm test
npm run check:encoding
npm run check:secrets
npm run build
git diff --check
```

Expected: 0 failures; root tests remain 333/333 unless the new tests are added to the root test glob, in which case record the new exact count.

**Step 2: Run backend isolation as a cross-surface regression gate**

Use the dedicated PostgreSQL 16 container password to construct the test URL, then run:

```bash
DATABASE_URL="postgres://door:<encoded-password>@127.0.0.1:55432/door_test" npm --prefix server test
```

Expected: `[isolated-db] PASS 105/105 files`.

**Step 3: Request read-only code review**

Use `requesting-code-review`. The reviewer must check:

- behavior parity for template rows and import mapping;
- Blob URL cleanup and stale-request behavior;
- no API/DOM/CSS drift;
- new modules are used by production;
- tests fail for real boundary regressions.

Fix Critical and Important issues before proceeding. Re-run affected and full gates after any production change.

### Task 5: Clean-worktree verification and remediation evidence

**Files:**

- Modify: `docs/remediation/2026-07-10-verification-report.md`

**Step 1: Verify the code commit from the clean worktree**

In `/Users/xquare/scratch/door/.worktrees/door-clean-verify-20260711`:

```bash
git checkout --detach <team-list-code-commit>
node --test tests/admin/teamListPageData.test.mjs \
  tests/admin/teamMemberWorkbook.test.mjs \
  tests/admin/teamListPageArchitecture.test.mjs
npm run format:check
npm run lint -- --quiet
npm run typecheck
npm test
npm run check:encoding
npm run check:secrets
npm run build
git status --short
```

Expected: all commands pass and `git status --short` prints nothing.

**Step 2: Record evidence**

Add the exact code commit, before/after line count, targeted test count, root/backend test counts, build result, and clean-worktree HEAD to the remediation report.

**Step 3: Commit documentation**

```bash
git add docs/remediation/2026-07-10-verification-report.md
git diff --cached --check
git commit -m "docs(remediation): record team page split evidence"
```
