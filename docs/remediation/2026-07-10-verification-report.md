# ArcSpro 赛事管理系统整改验收报告

**整改分支：** `codex/door-remediation-20260710`

**工作树：** `/Users/xquare/scratch/door/.worktrees/door-remediation-20260710`

**基线提交：** `225027def0189cdbc4999638eff6efd3d6e52434`

**复验日期：** 2026-07-11

**当前完成度：** 94%

**状态：** 本地代码、PostgreSQL、容器、备份恢复、Nginx 和登录/平台管理关键路径已经通过。生产密钥轮换、远程 CI、生产发布和带真实业务数据的九条 UI 全链路尚未完成，长期目标继续保持 active。

## 1. 本轮关闭的问题

| 问题 | 修复后的可观察结果 | 回归证据 |
| --- | --- | --- |
| 后端测试共享数据库，文件顺序变化会挂起或污染 | 每个 `*.test.js` 使用独立 `arcspro_test_<hash>` 数据库，执行后强制删除 | `npm test` 输出 `[isolated-db] PASS 93/93 files` |
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

## 2. 自动化门禁

### 2.1 前端与共享包

```text
npm run check:encoding                 PASS
npm run check:secrets                  PASS
npm run lint -- --quiet                PASS
npm run typecheck                      PASS
npm run format:check                   PASS
npm test                               PASS，304/304
npm run build                          PASS，Vite 8
npm audit --audit-level=low            PASS，0 vulnerabilities
git diff --check                       PASS
```

构建产物仍有大 chunk 警告：`vendor-echarts` 约 1.12 MB、`vendor-react-three` 约 959 kB、`vendor-three-core` 约 635 kB。产物生成成功，但这些文件应继续按路由和编辑器能力拆分。

### 2.2 后端

专用 PostgreSQL 16 容器只暴露 `door_test`。测试 runner 为 93 个测试文件逐一创建隔离数据库：

```text
npm test
...
[isolated-db 93/93] tests/test-isolation-runner.test.js
[isolated-db] PASS 93/93 files

npm audit --workspace=arcspro-server --audit-level=low
found 0 vulnerabilities
```

测试日志还有一条升级提示：lottery-v2 测试触发 `pg` 的并发 `client.query()` 弃用警告。当前用例全部通过；升级到 pg 9 前应改为串行 await 或独立 client。

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

## 6. 尚未关闭的门禁

### 6.1 生产与外部系统

- OCR/API 旧密钥的真实撤销和重发尚无平台工单或截图；
- 生产 PII v2 密钥轮换、旧数据重加密和抽样解密尚未执行；
- 当前分支未推送，GitHub Actions 没有远程运行记录；
- 尚未部署远程服务器，远端 endpoint/chunk/health 三信号未复验。

### 6.2 带业务数据的 UI 全链路

后端服务测试已覆盖导入、审核、抽签、号码布、证件、报销、库存和 3D/GIS 的核心事务与权限；本地浏览器库没有机构、赛事和报名记录，因此以下 UI 链路还缺少真实页面证据：

1. 选择赛事 → 名单导入 → commit → records；
2. 审核步骤 → job polling → 结果；
3. 抽签 preview → finalize → rollback；
4. 号码布分配 → 导出 → 追踪；
5. 证件申请 → 审核 → 签发；
6. 报销导入 → OCR → 匹配 → 导出；
7. 库存入库 → 绑定 → 出库 → 盘点；
8. GIS 地图 → 3D Studio → 导出。

## 7. 长期目标关闭条件

1. 为浏览器验收库准备一套脱敏机构、赛事和报名数据，逐条补齐上面 8 条 UI 证据；
2. 完成生产密钥轮换并保存平台回执；
3. 推送分支，远程 CI 全绿；
4. 在远程候选环境重跑迁移、健康、备份恢复和镜像回退；
5. 生产切换后验证 endpoint、静态 chunk、健康检查和关键业务抽样；
6. 最终 HEAD 从全新检出重跑全部门禁。
