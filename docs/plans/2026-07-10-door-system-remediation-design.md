# DOOR 系统大规模整改设计

**日期：** 2026-07-10

**目标仓库：** `/Users/xquare/scratch/door`

**整改分支：** `codex/door-remediation-20260710`

**基线提交：** `225027def0189cdbc4999638eff6efd3d6e52434`

## 1. 结论

DOOR 不做推倒重写。系统已经承载名单导入、审核、抽签、号码布、证件、仓储、报销、GIS/3D 等真实业务，直接重写会丢失大量隐含规则和兼容逻辑。

整改采用“止血、建立可信基线、收敛架构、逐模块迁移、全链路验收”的方式。每一批只解决一类问题，必须有测试或运行证据，完成后再进入下一批。

## 2. 当前基线

审查时确认了以下事实：

- 原发布工作树有 57 个已修改文件和 405 个未跟踪文件，不能作为整改工作区。
- 隔离 worktree 已从 `225027def018` 创建。
- 后端 `npm ci --ignore-scripts` 成功，但报告 3 个 high、8 个 moderate 漏洞。
- 前端 `npm ci --ignore-scripts` 失败：`@pascal-app/core@0.3.2` 要求 `three@^0.182`，项目声明 `three@^0.183.2`。
- Git 跟踪的 `server/.env.dev` 含 OCR 和 PII 相关密钥。
- 后端测试会加载 `.env`，部分测试可能连接并清理非测试数据库。
- 当前未提交 Dockerfile 探测 `/api/health`，实际返回 401；`/api/health/live` 返回 200。
- 前端静态依赖存在 `api/auth -> authStore -> request -> authStore` 循环。
- 后端大部分路由使用 `requirePermission`，少量路由使用 `requireAuthz`，授权逻辑不统一。

这些问题决定了整改顺序：先保证密钥、安装、测试和部署探针安全，再处理业务架构。

## 3. 设计原则

### 3.1 后端始终是权限最终裁决者

前端可以根据授权 profile 隐藏导航，但不能决定请求是否有权执行。所有受保护请求必须经过一个统一的授权入口。

目标调用链：

```text
HTTP request
  -> authenticate
  -> resolve workspace scope (platform | org | race)
  -> authorize(action, resource, context)
  -> validate input
  -> application service
  -> repository / transaction
  -> normalized response
```

### 3.2 保留模块化单体

本阶段不拆微服务。API、Worker 和 Web 可以分包、分进程，但继续共享一个仓库和 PostgreSQL。模块必须有明确边界，不能通过跨目录导入数据库实现或页面内部状态互相调用。

### 3.3 契约先行

请求、响应、错误、moduleId、surface 和 workspace scope 必须有共享契约。前端不再依靠 `unwrapData`、路径重映射或字符串错误判断适配后端。

### 3.4 迁移优先于重写

旧入口和旧字段先加可观测迁移路径，再删除。删除前必须有调用点扫描、自动化测试和一次运行时验证。

### 3.5 每一批都可回滚

每个整改批次只包含一个主题，使用 Conventional Commits。数据库迁移必须向前兼容；部署变更要保留健康检查和回滚命令。

## 4. 目标目录

目录调整分两步完成，先创建共享包，再移动现有应用，避免一次性大搬迁。

```text
apps/
  web/                  # React/Vite，后续由当前 src/ 迁入
  api/                  # Express HTTP 入口
  worker/               # Job worker 入口
packages/
  contracts/            # Zod schema、DTO、ApiError、module catalog
  studio-model/         # 前后端共享 3D/GIS 纯模型
  test-support/         # 测试数据库保护、fixture、应用测试工厂
```

第一阶段不移动 `src/` 和 `server/`；只建立 workspace 与共享包，确认构建和测试稳定后再逐步迁移。

## 5. 后端模块规范

每个非平凡模块采用同一结构：

```text
module.routes.js        # 路由、中间件、HTTP 状态
module.controller.js    # HTTP 输入输出适配
module.schema.js        # 请求参数白名单与校验
module.service.js       # 业务规则、事务边界
module.repository.js    # Knex 查询和数据库映射
```

约束：

- route 和 controller 不得导入 Knex。
- repository 不接收原始 `req.body`。
- 多表写入由 service 显式开启事务并把 `trx` 传给 repository。
- 业务错误使用稳定的 `code`，例如 `RACE_CONTEXT_REQUIRED`、`MODULE_DENIED`。
- 响应统一为：

```json
{
  "success": false,
  "error": {
    "code": "MODULE_DENIED",
    "message": "无权访问该模块",
    "requestId": "req-...",
    "details": null
  }
}
```

## 6. 权限模型

保留现有三 Surface：`/app`、`/ops`、`/admin`，以及 `platform | org | race` 工作区范围。

整改后只暴露一个应用级接口：

```js
await authorization.assert(authContext, {
  action: 'records:update',
  resource: { type: 'race', id: raceId },
  workspace: { scopeType: 'race', orgId, raceId },
})
```

实现可以使用 OpenFGA，也可以在测试中使用同模型的本地 checker。角色默认权限、模块授权和资源关系不能再由三套代码分别推导。

迁移顺序：

1. 为现有 `requirePermission` 和 `requireAuthz` 建立行为矩阵测试。
2. 引入统一 `authorization` 适配器。
3. 按模块迁移路由。
4. 前端 profile 改为读取统一授权结果。
5. 删除 `req.user`、`req.orgAccess`、`req.tenantContext` 和过期角色映射。

## 7. 前端结构

### 7.1 解除认证循环依赖

HTTP client 不再直接导入 Zustand store。token 读取和会话失效处理通过可注入的 session adapter 完成：

```text
authStore -> authApi -> requestClient -> authSessionAdapter
     ^                                      |
     +------------- auth-expired event -----+
```

### 7.2 单一 Surface 路由注册表

导航、路由、标题、moduleId、needsRace 和 capability 从同一注册表生成。一个模块不得在 `appConfig.js` 和 `AppLayout.jsx` 中分别维护两套定义。

### 7.3 统一外壳

新 `SurfaceShell` 提供桌面侧栏、顶部上下文、移动菜单和内容插槽。迁移顺序为 ops、admin、app。现有未使用的 `LayoutShell` 在迁移完成后删除。

### 7.4 大文件拆分

优先拆分：

- `src/utils/terrainModel/model.js`
- `src/views/app/terrain-model/TerrainModelPage.jsx`
- `src/components/map/MapView3D.tsx`
- `src/3d-studio/model/editorDocument.js`
- `server/src/modules/inventory`
- `server/src/modules/reimbursement`

拆分按行为和数据边界进行，不按行数机械切文件。纯算法先提取并补单元测试，UI 再拆 hook 和 section component。

## 8. 安全与密钥

### 8.1 立即动作

- 撤销并轮换已提交的 OCR/API 密钥。
- 确认 PII 密钥是否用于生产；如果使用，创建 `v2` 并保留 `v1` 解密窗口。
- `server/.env.dev` 从 Git 跟踪中移除，只保留无秘密的 `.env.example`。
- CI 加入 secret scan 和 push protection。

### 8.2 PII 密钥轮换

```text
部署 v1+v2 解密能力
  -> 设置 active=v2
  -> 新写入使用 v2
  -> 后台批量重加密旧数据
  -> 校验盲索引和读取
  -> 退役 v1
```

外部服务密钥轮换需要服务账号权限；仓库整改可以先完成代码和历史治理，真实撤销动作必须由有权限的负责人执行并回填证据。

## 9. 测试与门禁

### 9.1 测试分层

```text
unit        不访问网络或数据库
integration 使用独立 door_test PostgreSQL
contract    校验请求、响应和授权矩阵
e2e         浏览器验证关键业务路径
deploy      镜像、迁移、/live、/ready、回滚
```

### 9.2 测试数据库硬保护

任何集成测试在导入应用模块前执行：

```js
assertSafeTestDatabase(process.env.DATABASE_URL)
```

数据库名不满足 `(^test$|_test$|test_)` 时进程必须退出。测试脚本不加载普通 `.env`，只接收 CI 或 `.env.test`。

### 9.3 必跑门禁

```bash
npm ci
npm run check:encoding
npm run lint
npm run typecheck
npm test
npm run build

cd server
npm ci
npm run test:unit
DATABASE_URL=postgres://door:door_dev@127.0.0.1:5432/door_test npm run test:integration
```

## 10. 分阶段交付

### 阶段 A：止血与可信基线

- 密钥文件治理
- 前端依赖和锁文件修复
- 测试数据库保护
- Docker/Nginx 健康检查
- CI 与 clean-install 门禁

### 阶段 B：契约和错误模型

- workspaces 与 `packages/contracts`
- 统一响应和 `ApiError`
- 删除路径重映射
- 关键赛事 API 契约测试

### 阶段 C：权限统一

- 授权矩阵
- 单一 authorization adapter
- 路由逐模块迁移
- 前端 module catalog 和 workspace profile 对齐

### 阶段 D：模块边界

- routes/controller/service/repository 规范化
- 名单、审核、抽签、号码布优先
- 仓储、报销、证件、设计协同随后迁移

### 阶段 E：前端和 3D/GIS

- 解除循环依赖
- Surface route registry
- SurfaceShell
- `studio-model` 共用包
- 大文件拆分和按需加载

### 阶段 F：完整验收

- 自动化门禁
- 三 Surface 权限矩阵
- 名单导入到审核、抽签、排号全链路
- 报销、证件、仓储专项链路
- Docker 部署、迁移、健康和回滚

## 11. 完成标准

只有以下条件全部满足，长期目标才可以标记完成：

- 干净克隆后，前后端 `npm ci` 无额外参数成功。
- Git 历史和当前树无有效密钥，外部密钥完成轮换并有记录。
- 测试命令无法连接非测试数据库。
- CI 中 lint、typecheck、unit、integration、build、secret scan 全部通过。
- `/api/health/live` 和 `/api/health/ready` 在部署环境按预期返回。
- 后端只有一个授权决策入口，旧权限别名和过期角色映射清零。
- 路由不直接访问数据库，关键写入有事务测试。
- 前端无静态循环依赖，路由和导航来自同一注册表。
- 前后端不再维护两份 `studioProjectUtils`。
- 关键业务全链路逐项通过，并保存命令输出、API 结果或截图证据。
