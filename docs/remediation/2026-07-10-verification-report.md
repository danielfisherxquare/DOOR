# ArcSpro 赛事管理系统整改验收报告

**整改分支：** `codex/door-remediation-20260710`

**工作树：** `/Users/xquare/scratch/door/.worktrees/door-remediation-20260710`

**基线提交：** `225027def0189cdbc4999638eff6efd3d6e52434`

**复验日期：** 2026-07-11

**代码验收提交：** `c58f07d80a02559e23cd82be72380f93543900a6`

**当前完成度：** 98%

**状态：** 本地代码、PostgreSQL、容器、备份恢复、Nginx、登录/平台管理和十个关键业务界面已经通过。代码质量门禁为 0 error / 0 warning。真实付费 OCR、库存扫码 UI 最终方案、生产密钥轮换、远程 CI 和生产发布尚未完成，长期目标继续保持 active。

## 1. 本轮关闭的问题

| 问题 | 修复后的可观察结果 | 回归证据 |
| --- | --- | --- |
| 后端测试共享数据库，文件顺序变化会挂起或污染 | 每个 `*.test.js` 使用独立 `arcspro_test_<hash>` 数据库，执行后强制删除 | `npm test` 输出 `[isolated-db] PASS 100/100 files` |
| race 权限继承、显式降权和共享赛事 profile 不一致 | owner、race_admin、组织授权和显式 viewer 降权按同一投影规则生效 | `org-race-permissions` 6/6；`permissions` 18/18 |
| 姓名/电话/证件号搜索跨越加密边界 | 姓名保留模糊匹配；电话和证件号只走盲索引精确匹配；返回前按租户 AAD 解密 | `records-query` 18/18；`bib-tracking` 16/16 |
| 已绑定库存对象可被重复绑定 | 重复绑定被拒绝，跨位置变更必须使用 move 流程 | `inventory-twin.integration` 通过 |
| 后端反向导入前端 3D 导出实现 | 导出 manifest 移到 `@arcspro/studio-model/export-manifest`，前后端使用同一实现 | 3D parity 扫描全部 inventory 文件并通过 |
| Dockerfile 使用错误构建上下文和子目录锁文件 | 镜像从仓库根锁文件安装 server workspace，并复制 contracts/studio-model 运行依赖 | `docker compose build app` 成功；镜像审计 0 vulnerabilities |
| 全新数据库先启动 app、后执行迁移 | 一次性 `migrate` 服务先运行；app/worker 依赖 `service_completed_successfully` | 空 PGDATA 冷启动：migrate `Exited (0)`、91 条迁移、app healthy |
| 生产空库可使用内置密码创建超管 | 生产环境没有显式 `SUPER_ADMIN_PASSWORD` 时不创建；首次创建标记 `must_change_password=true` | `deployment-config` 合约测试 |
| 备份客户端版本高于数据库，恢复报 `transaction_timeout` | `pg_dump` 固定为 PostgreSQL 16，与 `postgres:16-alpine` 同主版本 | 新备份可恢复，旧 PG18 备份不作为证据 |
| 测试库恢复检查旧表名 `orgs` | 核心表改为 `users / organizations / races / records` | 恢复结果三项检查全为 `true` |
| 测试库恢复会覆盖运行中的 `.env` | `.env` 只作为快照记录，不复制、不加载、不替换宿主配置 | 恢复前后宿主 `.env` SHA-256 不变 |
| Nginx 缓存头覆盖安全头 | `index.html`、`assets` 和 `vite.svg` 明确保留安全头 | 首页和入口资产均返回 `Permissions-Policy` |
| 本地 HTTP override 仍发布无监听的 TLS 端口 | 本地 override 只发布 `8088 -> 80`，不挂载生产证书目录 | `docker compose config` 和 `docker port` 结果一致 |
| 登录后无 workspace session 时 React 空白页 | workspace helper 对 `null` 返回空状态，不再读取 `null.scopeType` | 浏览器复验从空根节点变为可见路由，CDP 无 exception |
| 初始密码账号被 app 工作区权限挡住 | 强制改密统一走顶层 `/change-password`，只要求已登录，不依赖组织或赛事 | 页面显示三个密码框和“保存新密码”，未执行最终改密 |
| 强制改密只在前端跳转，旧 JWT 可直接调用业务 API | JWT 认证后实时读取账号状态；待改密账号的业务 API 返回 `PASSWORD_CHANGE_REQUIRED`，停用账号的存量 JWT 返回 401 | `auth.test.js` 12/12；改密后同一 JWT 立即恢复 |
| 平台管理员缺少持久化 workspace session 时被误判无权限 | 仅对“super_admin + 已验证 platform profile”恢复平台会话 | 工作区选择后进入 `/admin`，指挥台可见 |
| 容器工作目录调整后，storage 与自动备份脚本仍指向旧路径 | storage 统一挂载 `/app/server/storage`；sidecar 调用 `/app/server/scripts/run-postgres-backup.sh` | 新镜像挂载检查；sidecar 启动即生成 `.dump` |
| app 与 sidecar 使用各自 `/tmp` 锁，可能并发备份/恢复 | 两者使用备份挂载中的 `/backups/.db-ops.lock` | 实际创建共享锁后，app 备份返回 `Another backup/restore operation is already running` |
| 上传压缩 SQL 可包含跨库语句 | 恢复只接受 PostgreSQL custom `.dump`，先读取 TOC 并拒绝数据库、表空间、函数、触发器等危险对象类型 | `.sql.gz` 被拒绝，目标库未创建；custom 归档恢复成功 |
| React Hook 依赖缺失导致旧状态、重复订阅和资源泄漏 | Hook 依赖全部显式稳定化；事件解绑使用同一函数；Blob URL 按本次加载结果回收 | ESLint `react-hooks/exhaustive-deps` 0 warning；根测试和浏览器 E2E 通过 |
| 地图和 DTO 边界保留 81 处显式 `any` | GeoJSON、Geoman、空间对象、地形工作区、场景导出任务均使用明确类型 | ESLint `@typescript-eslint/no-explicit-any` 0 warning；TypeScript 通过 |
| Push/Pull 高度标签把建模文档当成浏览器 DOM | 高度标签只访问 `globalThis.document`，不再接收建模文档参数 | 新增架构回归测试；根测试通过 |
| 同一 Knex 事务客户端通过 `Promise.all` 并发查询，升级 `pg` 9 将失败 | lottery V1/V2 事务查询改为串行执行，并新增全后端源码门禁禁止 `Promise.all` 内直接调用 `trx()` | `lottery-finalize-normalization`、`lottery-v2.service` 和架构测试通过；全量日志不再出现弃用警告 |
| 报销 OCR 元数据合并在主服务和预览服务重复实现 | `isPlainObject` 与 `mergeRecordOcrMeta` 收敛到 `reimbursement-ocr-meta.js` | 元数据单测 3/3；报销服务与预览集成测试通过 |
| 报销预览服务同时负责导出风险分析和 Excel 工作表渲染 | 214 行导出检查逻辑拆入 `reimbursement-export-checks.js`，预览服务由 1405 行降到 1193 行 | 导出检查单测 2/2；预览集成测试 14/14 |
| 报销主服务同时维护处理队列、状态统计和业务记录 | 处理记录职责拆入 `reimbursement-processing.service.js`，主服务由 1574 行降到 1442 行，并增加 1450 行回退门禁 | 处理 API 门面测试、报销集成测试 14/14、架构测试通过 |
| 赛事分布饼图导入完整 ECharts 和未使用的 React wrapper | 只注册 Pie、Legend、Tooltip、Canvas，并移除 `echarts-for-react` | `vendor-echarts` 由约 1118 kB 降至 443.08 kB；根测试通过；生产构建通过 |
| Excel、ZIP、Word 模板和下载工具被强制合并成一个 568 kB 文档包 | 移除未使用的 `docxtemplater`、`file-saver`，按实际格式拆为 XLSX 与 PizZip | `vendor-docs` 消失；`vendor-xlsx` 487.57 kB、`vendor-pizzip` 80.59 kB；构建门禁通过 |
| 登录首屏因手工 React-Three vendor 分块预加载约 959 kB 3D 运行时 | 取消 React-Three 强制共享块，按地图和 Studio 动态路由自然分块；新增产物边界检查 | `dist/index.html` 不再 preload React-Three、Three Core 或 Studio；地图生产 E2E 3/3 |
| 地形模型页面同时承载默认配置、保存配置归一化和范围几何转换 | 纯配置与几何转换拆入 `terrainModelPageConfig.js`，页面由 3612 行降至 3221 行，并把架构上限收紧到 3250 行 | 地形专项 128/128；新增配置单测 4/4；根测试与生产构建通过 |
| 地形建模核心同时维护默认值、旧字段兼容和全部网格建模 | 选项归一化拆入 `modelOptions.js`，建模核心由 3548 行降至 3255 行，架构上限从 3900 收紧到 3300；修复默认值遮蔽 `shape`、`qualityPreset`、`maxTerrainReliefMm` 等旧字段别名 | 新增选项契约测试 3/3；地形专项 131/131；根测试与生产构建通过 |
| Cesium 3D 地图组件同时计算重点区运行策略和加载状态文案 | 运行策略、摘要和场景状态拆入 `terrainRuntimePolicy.ts`，`MapView3D.tsx` 由 2634 行降至 2413 行，架构上限收紧到 2450 行 | 新增策略单测 3/3；地图专项 6/6；根测试与生产构建通过 |
| 设计协作工作台内联全部枚举、标签映射和格式化逻辑 | 静态配置与纯格式化拆入 `designRequestWorkspaceConfig.js`，页面由 1760 行降至 1527 行，并新增 1550 行架构门禁 | 新增配置与架构测试 5/5；根测试与生产构建通过 |
| 库存空间导出文件同时负责 GLB 二进制编码、几何构建、路径管理和导出任务 | GLB 与实例化编码拆入 `inventory.spatial.glb.js`，公共数值辅助拆入 `inventory.spatial.export-utils.js`，主导出文件由 1660 行降至 1274 行并新增 1300 行门禁 | 原有 GLB 测试 4 项纳入根门禁；3D Studio 针对性 9/9；后端隔离测试 100/100 |

## 2. 自动化门禁

### 2.1 前端与共享包

```text
npm run check:encoding                 PASS
npm run check:secrets                  PASS
npm run lint                           PASS，0 error / 0 warning
npm run typecheck                      PASS
npm run format:check                   PASS
npm test                               PASS，333/333
npm run build                          PASS，Vite 8
npm audit --audit-level=low            PASS，0 vulnerabilities
git diff --check                       PASS
```

ECharts 已按需注册，`vendor-echarts` 从约 1.12 MB 降到 443.08 kB；文档工具拆分为 `vendor-xlsx` 487.57 kB 和 `vendor-pizzip` 80.59 kB，均不再触发 500 kB 警告。构建产物仍对 `StudioProjectPage` 和 Three Core 报大 chunk，但它们已从首屏 preload 图中移除，只在地图或 3D Studio 路由加载。`npm run build` 会额外执行 `scripts/check-build-boundaries.mjs`，阻止 3D 包回流首屏，并限制 ECharts/XLSX 单块不超过 500 KiB。

### 2.2 后端

专用 PostgreSQL 16 容器只用于测试连接。测试 runner 为 100 个测试文件逐一创建隔离数据库：

```text
npm test
...
[isolated-db 100/100] tests/test-isolation-runner.test.js
[isolated-db] PASS 100/100 files

npm audit --workspace=arcspro-server --audit-level=low
found 0 vulnerabilities
```

后端 workspace 没有独立 lockfile；仓库使用根 `package-lock.json`。因此 `npm audit --prefix server` 会返回 `ENOLOCK`，不作为门禁命令。有效命令是 `npm audit --workspace server --audit-level=low`，结果为 0 vulnerabilities。

lottery V1/V2 原有的并发 `client.query()` 弃用警告已关闭；架构测试会阻止同一事务客户端再次在 `Promise.all` 中并发查询。

## 3. 容器、迁移和健康检查

本地验收项目：`arcspro-remediation-20260711`。

```text
docker compose build app               PASS
knex migrate:latest                    Batch 1 run: 91 migrations
GET /api/health/live                   {"status":"ok"}
GET /api/health/ready                  {"status":"ok","database":"connected","encryption":"ok"}
worker                                 10 handlers registered，持续轮询
nginx -t（本地配置）                    PASS
nginx -t（生产配置 + compose 网络）     PASS
```

最终复验镜像 ID：`sha256:d7c4904df3160dca125d21bab02b14d6cb1f4b083bfaf9a06f40a5352fe760a1`。

另用空目录 `/tmp/arcspro-coldstart-pgdata-20260711` 启动独立项目 `arcspro-coldstart-20260711`，没有预先执行迁移命令：

```text
migrate                                Exited (0)
knex_migrations                        91
app :3302                              healthy
GET :3302/api/health/ready             database=connected，encryption=ok
GET :8089/api/health/ready             database=connected，encryption=ok
worker                                 running
```

镜像回退演练中，探针镜像 ID 与基线不同；切回基线后：

```text
rollback_live={"status":"ok"}
rollback_ready={"status":"ok","database":"connected","encryption":"ok"}
app published ports=3001/tcp -> 3301
worker published ports=<empty>
```

## 4. 备份与数据库恢复

验收备份：`door_backup_20260711_035224.dump`。该文件由新镜像中的 `pg-backup` sidecar 启动后自动生成。

```json
{
  "sizeBytes": 617236,
  "format": "pg-custom",
  "trigger": "auto",
  "status": "success",
  "sha256": "7212cf1c78a3d6fdb4f53f2dc7dbf337a32d333ff794958b550a5031f0583678",
  "envFile": "door_backup_20260711_035224.env",
  "envSizeBytes": 1050
}
```

`pg_restore --list` 成功，文件 SHA-256 与 `.meta.json` 一致。最终镜像恢复到 `door_restore_custom_20260711` 后：

```json
{
  "envSnapshotProvided": true,
  "checks": {
    "connectivity": true,
    "migrationTablePresent": true,
    "tablesPresent": true
  }
}
```

源库和恢复库统计相同：

```json
{
  "publicTables": 133,
  "migrations": 91,
  "users": 1,
  "organizations": 0,
  "races": 0,
  "records": 0
}
```

这次演练验证了空业务库的结构、迁移和测试账号。生产恢复仍需对非空业务表做逐表行数、抽样解密和业务主键核对。

拒绝测试同时确认：历史 `.sql.gz` 不会被执行，且 `door_restore_reject_20260711` 未被创建。历史文件仍可在后台查看和下载，用于受控迁移，不再作为可直接恢复的输入。

## 5. Nginx 与浏览器验收

本地网关：`http://127.0.0.1:8088`。

### 5.1 网关

```text
GET /                                  200，index no-cache
GET /login                             200，与 index 内容一致
GET /assets/index-*.js                 200，一年 immutable cache
GET /api/health/ready                  database=connected，encryption=ok
Permissions-Policy                     camera=(self), microphone=(), geolocation=()
published ports                        80/tcp -> 8088；无 443/8443
app 单独重建后网关探测                20/20 通过，Nginx 容器未重建
```

### 5.2 真实浏览器路径

使用本地测试管理员完成以下只读路径：

1. `/login`：服务状态显示“服务连接正常”，账号、密码和登录按钮均唯一；
2. 登录后强制进入 `/change-password`：页面显示“修改密码”，浏览器 0 exception/0 warning；没有提交密码；
3. 临时关闭测试库账号的强制改密标志，进入 `/workspaces?redirect=%2Fadmin`；
4. 选择“系统平台 / 平台控制台”，进入 `/admin`；
5. `/admin/orgs`：机构管理页加载，空库显示 0 个机构；
6. `/admin/db-backups`：密钥指纹一致、三份备份可见、恢复按钮在未上传文件时禁用；
7. 验收结束后将测试管理员恢复为 `must_change_password=true`。

浏览器诊断在修复前捕获到 `Cannot read properties of null (reading 'scopeType')`；修复后上述页面没有 `Runtime.exceptionThrown`、`Network.loadingFailed` 或 DOM 密码表单警告。

### 5.3 带业务数据的运行时验收

最新前端产物构建后，通过 `http://127.0.0.1:8088` 执行 `scripts/verify-business-surfaces.mjs`。结果写入 `output/remediation-acceptance-20260711/business-surfaces/result.json`：

```json
{
  "credentialLifecycle": {
    "personName": "验收制证-20260711073754",
    "requestId": 4,
    "credentialId": 4,
    "requestStatus": "generated",
    "credentialStatus": "issued"
  },
  "consoleErrors": [],
  "pageErrors": [],
  "failedRequests": [],
  "resourceFailures": [],
  "ok": true
}
```

验收页面：服装物资、我的报销、证件中心、申请与建单、审核中心、领取管理、仓储作业台、3D 空间工作台、轨迹地形模型和 GIS 地图。服装库存卡合计 6 件、3 张非空卡；证件申请 4 完成 `generated -> issued`。

生产构建地图链路同时通过：登录保留 `projectId` 查询参数，6 个地图对象保存并同步，GIS 地图到 3D Studio 的生成与导出没有失败请求。

## 6. 尚未关闭的门禁

### 6.1 生产与外部系统

- OCR/API 旧密钥的真实撤销和重发尚无平台工单或截图；
- 生产 PII v2 密钥轮换、旧数据重加密和抽样解密尚未执行；
- 当前分支未推送，GitHub Actions 没有远程运行记录；
- 尚未部署远程服务器，远端 endpoint/chunk/health 三信号未复验。

### 6.2 仍缺的业务验收

1. 报销导入、匹配和导出已通过；`REIMBURSEMENT_OCR_API_KEY` 与 `DASHSCOPE_API_KEY` 均为空，因此真实付费模型调用仍缺证据；
2. 库存后端入库、绑定、出库、盘点及仓储作业台已通过；扫码操作 UI 仍等待“嵌入计划详情”方案确认；
3. GIS 地图保存、3D Studio 导入和白模导出已通过；远程候选环境尚未重跑；
4. 名单、审核、抽签和号码布已有自动化与后端隔离测试，仍可补充一轮人工业务操作录像，但不再是本地代码门禁。

## 7. 长期目标关闭条件

1. 确认并完成库存扫码 UI，逐条验证入库、绑定、出库和盘点；
2. 配置真实 OCR 密钥，保存一次发票和付款凭证识别结果及用量证据；
3. 完成生产密钥轮换并保存平台回执；
4. 推送分支，远程 CI 全绿；
5. 在远程候选环境重跑迁移、健康、备份恢复和镜像回退；
6. 生产切换后验证 endpoint、静态 chunk、健康检查和关键业务抽样；
7. 最终 HEAD 从全新检出重跑全部门禁。已在 `/Users/xquare/scratch/door/.worktrees/door-clean-verify-20260711` 对 `c58f07d` 执行 333/333、3D Studio 针对性测试、生产构建及边界检查；开发工作树使用专用 PostgreSQL 16 完成后端 100/100。该干净工作树在同一 lockfile 的上一代码节点执行 fresh `npm ci`，安装审计 0 vulnerabilities，且无跟踪改动。
