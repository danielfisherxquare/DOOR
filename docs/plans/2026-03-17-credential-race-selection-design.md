# Credential Race Selection Design

> Superseded on 2026-03-17 by `2026-03-17-credential-direct-refactor-implementation-plan.md`.

## Status

这份设计里关于凭证模块内部语义的内容已经失效。
原先围绕 `zones / role templates / applications` 的页面命名和数据流，已经被新的 `access areas / categories / requests` 模型替换。

## Still Applicable

以下内容仍然有效，并已并入当前实现：

- `/admin/credential/select-race` 仍然是凭证管理入口页。
- 侧边栏在凭证管理子页面间切换时，需要保留 `orgId` 和 `raceId`。
- 当子页面缺少 `raceId` 时，应引导用户返回赛事选择页，而不是停留在无上下文页面。

## Current Navigation

- `/admin/credential/select-race`
- `/admin/credential/access-areas`
- `/admin/credential/categories`
- `/admin/credential/requests`
- `/admin/credential/review`
- `/admin/credential/styles`

## Notes

如果后续还需要补充赛事选择交互，应直接在 direct-refactor 方案或新的增量方案中继续，不再回到这份旧设计文档。
