# 证件管理赛事选择流程设计 (Credential Race Selection Design)

## Overview

实现先选择机构、再进入赛事视角、最后管理该赛事的证件（如分区等页面）的层级化导航体验，解决当前侧边栏无法在各证件子页面之间共享赛事上下文（`raceId`）的问题。

## Architecture & Data Flow

1. **路由结构调整**
   - 证件管理入口栏的默认跳转：点击父级菜单“证件管理”时，不再跳向 `/admin/credential/zones`，而是跳向新页面 `/admin/credential/select-race`。
   - 各个证件配置子页（分区、模板、申请等）路径保持不变（仍是 `/admin/credential/:subpage`）。

2. **Sidebar 导航透传 `raceId`**
   - 当前的问题：`AdminLayout.jsx` 中的 `linkWithOrg` 助手函数只附加了 `orgId`。如果用户当前处于某个赛事的“分区管理”，当直接点击左侧“岗位模板”时，URL 中的 `raceId` 就会丢失，导致报错或状态清空。
   - 方案：重构助手函数为 `linkWithContext`，同时读取当前的 `orgId` 和 `raceId`，在内部跳转“证件管理”大类的菜单时，自动携带 `raceId` 从而保留赛事上下文。

3. **独立组件 `CredentialSelectRacePage.jsx`**
   - 依赖：当前激活的 `orgId`（从 URL Query Parameter 中获取）。
   - 数据获取：利用 `racesApi.getAll({ orgId })` 拿取对应机构下的赛事。
   - 操作逻辑：向用户展平列出属于该机构的赛事卡片。点击对应赛事卡片后，跳转至 `/admin/credential/zones?orgId=${orgId}&raceId=${race.id}`。

4. **子页面容错处理**
   - `CredentialZonePage`及其他证件关联页面在进入渲染时：
   - 检查是否有 `raceId`，如果没有，不再显示简陋的文字，而是渲染友好的空状态（包含“返回选择赛事”的按钮），指导用户回到 `select-race` 入口页面。
