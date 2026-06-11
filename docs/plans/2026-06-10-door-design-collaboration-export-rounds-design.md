# ArcSpro Design Collaboration Export Rounds Design

## Goal

Add a multi-round collaboration spreadsheet workflow to the design request app. Designers can export the standard spreadsheet as a reference, while requester uploads are diffed against prior rounds to identify new rows, changed rows, unchanged rows, and new categories.

## Data Model

- Keep uploaded spreadsheets as immutable import batches.
- Add a current snapshot table keyed by a stable row key per race. The stable key comes from the exported `系统行键` column when present, otherwise from `使用区域 + 类别 + 项目 + 供方 + 搭建尺寸 + 数量 + 单位`.
- Store `first_seen_at` as the demand submission time and `last_changed_at` as the latest content change time.
- Add export rounds with `round_no`, `mode`, baseline export, row counts, and frozen export items so later downloads reproduce the same round.

## Import Diff Rules

- First upload for a race marks rows as `new`.
- Later uploads compare stable key and content hash:
  - missing stable key in history: `new`
  - missing prior area/category combination: `new_category`
  - same stable key, different content hash: `changed`
  - same stable key and same content hash: `unchanged`
- Existing design sync rules remain unchanged: only rows with `设计=✅` and complete requester fields can sync to supervisor review.

## Export Modes

- `blank_template`: standard headers and helper columns, no data rows.
- `incremental`: only rows that are new, changed, or new category relative to the baseline export.
- `full_marked`: all current rows, with a `变更标记` helper column.

## UI

- Designer/app surface gets a compact `标准清单导出` panel above the task table.
- Requester/ops surface gets diff metrics and filters in the existing import workbench.

## Validation

- Backend route test covers first export, second upload, diff classification, incremental export, and downloadable xlsx contents.
- Frontend build validates API integration and UI wiring.
- Browser visual check validates both designer export controls and ops diff labels.
