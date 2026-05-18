# DOOR 当前系统版本整理

整理时间：2026-05-18
整理对象：本机工作区 `/Users/xquare/scratch/door`

## 版本定位

当前 DOOR 正在从本机 working snapshot 整理为可 push 的发布候选分支。

| 项目 | 当前值 |
|---|---|
| Git 分支 | `release/door-current-2026-05-18` |
| 基线提交 | `1b46a2d feat: 库存系统升级、抽奖v2 beta、3D studio场景导出` |
| 远端基线 | `gitee/main@859bebf` |
| 分支状态 | 从本机 `main` 的当前快照整理出发布候选 |
| 前端包版本 | `door-workspace@0.0.1` |
| 后端包版本 | `door-server@1.0.0` |
| 当前工作区 | 正在排除备份、旧报告、测试结果等非发布文件 |

结论：整理完成并通过验证后，可称为 **DOOR 2026-05-18 内部发布候选版**；在完整运行态验证前，不应直接称为生产正式版。

## 系统形态

DOOR 当前是一个前后端分离的赛事运营管理系统：

| 层 | 技术栈 | 入口 |
|---|---|---|
| 前端 | Vite + React + React Router | `package.json`、`src/App.jsx` |
| 后端 API | Express + Knex + PostgreSQL | `server/package.json`、`server/src/index.js` |
| 后台任务 | Node worker + job queue + scheduler | `server/src/worker.js`、`server/src/services/scheduler.js` |
| 数据库 | PostgreSQL 16 | `server/src/db/migrations/` |
| 缓存/限流 | Redis 7 | `server/docker-compose.yml` |
| 网关 | Nginx | `server/nginx.conf`、`server/nginx.local.conf` |

本仓库不是只部署 `server/` 就能跑完整系统。后端会使用根目录里的前端构建产物和部分共享源码，例如 3D Studio 相关代码，所以部署时要保留完整仓库结构。

## 前端版本面貌

前端分为三个主入口：

| 入口 | 路由 | 当前能力 |
|---|---|---|
| 应用层 | `/app/*` | 我的工作台、名单导入、名单处理、抽签管理、选手排号、服装物资、报销、GIS 地图、空间工作台、证件流程、仓储治理、项目计划、考评、号牌布控、赛事大屏、面试、个人设置 |
| 执行端 | `/ops/*` | 执行工作台、扫码、扫码结果、号码布领取、证件发放、仓储作业台 |
| 管理后台 | `/admin/*` | 指挥台、机构管理、赛事管理、数据库备份、身份中心、团队管理、人事面试、报销管理、配色方案；部分旧后台入口已重定向到应用层 |

公开入口包括：

- `/login`
- `/forgot-password`
- `/reset-password/:token`
- `/tool/:id`
- `/app/assessment/public/:campaignId`

关键前端配置：

- 本地开发端口：`5173`
- API 代理：`/api -> http://127.0.0.1:3001`
- 生产构建：`npm run build`
- 主要依赖：React 19、Vite 5、Three.js、React Three Fiber、Cesium、Leaflet、ECharts、xlsx/docx 导出工具

## 后端版本面貌

后端 API 现在已经按入口层拆分：

| API 区域 | 路径前缀 | 说明 |
|---|---|---|
| 健康检查 | `/api/health` | live/ready |
| 认证 | `/api/auth` | 登录、注册、改密、授权相关 |
| 公开工具 | `/api/public/tools` | 公开工具详情 |
| 公开考评 | `/api/public/assessment` | 无登录考评入口 |
| 公开字典 | `/api/public/dict` | 前端下拉/状态字典 |
| 应用层 | `/api/app/*` | 报销、证件、3D Studio、面试、仓储 |
| 执行端 | `/api/ops/*` | 仓储、证件、号码布现场操作 |
| 管理后台 | `/api/admin/*` | 赛事、名单、抽签、服装、项目、身份、备份、OCR、品牌、字典、操作日志、定时任务 |

当前权限模型已经从零散中间件收敛到 `requirePermission()`：

- 支持入口层权限：`app` / `ops` / `admin`
- 支持角色白名单：如 `super_admin`、`org_admin`
- 支持模块权限：如 `admin:finance`、`app:inventory`
- 支持能力权限：如 `inventory:3d_studio`

## 数据库与平台能力

迁移目录显示当前版本已经覆盖以下业务域：

- 认证、用户、组织、赛事、名单记录
- 抽签、抽签 v2 beta、审计、服装、号码布
- 项目计划、日历、面试、考评
- 证件区域、类别、样式、申请、审核、发放、扫码日志
- 报销、附件、预览文件、OCR 识别结果
- 仓储、预入库、数字孪生、3D 项目、3D 场景导出
- 颜色方案、用户偏好、模块权限
- 系统备份与恢复

最近新增但尚未提交的系统层能力：

| 能力 | 证据 |
|---|---|
| 发票号码/代码字段扩容 | `server/src/db/migrations/20260505000001_expand_reimbursement_invoice_identifiers.js` |
| `sys_role` / `sys_user_role` 角色表与 `data_scope` | `server/src/db/migrations/20260506000001_create_sys_role_and_migrate_user_roles.js` |
| 数据字典表与启动种子 | `server/src/db/migrations/20260506000002_create_dict_tables.js`、`server/src/bootstrap/seed-dictionaries.js` |
| 操作日志表与查询 API | `server/src/db/migrations/20260506000003_create_operation_log_table.js`、`server/src/modules/operation-log/operation-log.routes.js` |
| 定时任务表、执行日志、调度器 | `server/src/db/migrations/20260506000004_create_sys_job_tables.js`、`server/src/modules/sys-job/sys-job.routes.js`、`server/src/services/scheduler.js` |

## 本地运行状态

本次整理时观察到的本机状态：

| 项目 | 状态 |
|---|---|
| Node.js | `v24.15.0` |
| npm | `11.12.1` |
| 前端端口 `5173` | 已监听，`http://127.0.0.1:5173/` 返回 200 |
| 后端端口 `3001` | 未监听 |
| Docker context | 当前为 `orbstack`，但 OrbStack socket 不存在 |
| 前端构建 | `npm run build` 已通过；仍有 Vite 大 chunk 与动态/静态混合导入警告 |
| 后端轻量测试 | `node --env-file-if-exists=.env --test --test-concurrency=1 tests/app-locals.test.js` 已通过 |
| 后端无数据库单测 | `node --env-file-if-exists=.env --test --test-concurrency=1 tests/full-chain-encryption.test.js tests/mapper.test.js` 已通过，42 项通过 |
| 后端完整测试 | `npm test` 已尝试，但当前机器没有监听 `5432` 的 PostgreSQL，也没有监听 `3001` 的 API，测试因 `ECONNREFUSED` 失败 |

前端构建存在两个常规警告：

- `tileCacheApi.ts` 同时被动态和静态导入，Vite 不会把它单独移出 chunk。
- 部分 chunk 超过 500 kB，主要来自 3D、地图、图表、文档处理依赖。

## 当前风险与待收口项

1. `server/src/app.js.bak`、旧视觉报告、旧修复计划、测试结果 JSON 不进入发布候选提交。
2. 新增字典、操作日志、定时任务后端接口已经挂载，但前端后台导航里暂未看到对应管理页面入口。
3. 后端 `3001` 未运行，Docker Desktop/OrbStack socket 当前都不可用，本机也没有 PostgreSQL 监听 `5432`，所以数据库迁移、真实登录、业务接口和后台页面联调尚未在本次整理中验证。
4. 若要做生产发布，应重新拉起完整栈，至少验证：`/api/health/ready`、登录、应用层/执行端/后台入口、报销 OCR、证件流程、仓储作业、3D Studio、备份恢复。

## 建议的版本命名

在未打 tag、未完成完整运行验证前，建议内部记录为：

```text
DOOR internal release candidate 2026-05-18
base: main@1b46a2d
state: cleanup branch, frontend build passed, backend lightweight test passed, full runtime verification blocked by missing local PostgreSQL/API
```

如果要对外或交付使用，建议先做一个正式收口版本：

```text
DOOR v0.1.0-internal
scope: 赛事运营 + 证件 + 仓储 + 报销 + 3D Studio + 管理后台
gate: full docker/local runtime smoke passed
```
