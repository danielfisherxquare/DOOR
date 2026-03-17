# Credential Race Selection Implementation Plan

> Superseded on 2026-03-17 by `2026-03-17-credential-direct-refactor-implementation-plan.md`.

## Status

这份实现计划已经完成其中与赛事选择相关的部分，但其余命名和页面职责基于旧模型，现已不再作为执行依据。

## What Still Applies

- 保留 `/admin/credential/select-race` 作为入口。
- 在凭证管理子页面之间继续透传 `orgId` 与 `raceId`。
- 在缺少 `raceId` 时提供返回赛事选择页的兜底入口。

## What No Longer Applies

- 旧的 `/admin/credential/zones` 作为默认落点。
- 任何围绕 `zones / role templates / applications` 的页面契约说明。
- 把 race-selection 计划当作当前凭证模块重构的主计划。

## Canonical Plan

当前应以 [2026-03-17-credential-direct-refactor-implementation-plan.md](/Users/Xquare/.gemini/antigravity/scratch/door/docs/plans/2026-03-17-credential-direct-refactor-implementation-plan.md) 为准。
