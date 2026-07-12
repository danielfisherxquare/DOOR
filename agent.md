# ArcSpro Project Agent Rules

> 本文件是 ArcSpro 项目的项目级 Agent 操作指南，基于 2026-06-24 全量代码审计生成。

## 项目边界

- 仓库根目录: `/Users/xquare/scratch/door`
- 前端根目录: 仓库根目录, Vite + React 19 + Zustand
- 后端根目录: `server/`, Express 4 + PostgreSQL + Knex 3
- 不要从前端根目录运行后端命令，也不要从 `server/` 运行前端命令

### 命令边界

| 工作内容 | 目录 | 命令 |
| --- | --- | --- |
| 前端开发服务器 | 仓库根 | `npm run dev` |
| 前端构建 | 仓库根 | `npm run build` |
| 编码检查 | 仓库根 | `npm run check:encoding` |
| Surface/Workspace 测试 | 仓库根 | `npm run test:surfaces` |
| 地形模型测试 | 仓库根 | `npm run test:terrain-model` |
| 3D Studio 测试 | 仓库根 | `npm run test:3d-studio` |
| 地图测试 | 仓库根 | `npm run test:map` |
| 全量前端测试 | 仓库根 | `npm run test` |
| 后端 API 开发服务器 | `server/` | `npm run dev` |
| 后端 Worker | `server/` | `npm run worker` |
| 数据库迁移 | `server/` | `npm run migrate` |
| 后端测试 | `server/` | `npm run test` |
| Docker 编排 | `server/` | `docker compose ...` |

仓库根目录提供 `lint`。后端 lint 使用
`cd server && npx eslint src/ tests/ --ext .js`。`tsconfig.json` 当前供编辑器渐进检查，
全量 strict typecheck 仍受旧地图类型和 JS/TS 混用阻断。只有实际运行成功后才能声称检查通过。

## 编码与文本文件

- 仓库文本文件使用 UTF-8 无 BOM 和 LF 行尾
- 现有 `npm run check:encoding` 仅扫描 `src`、`server/src` 和 `server/tests`
- 如果编辑这些路径之外的文件，需自行验证编码
- 不要引入 CRLF 或 BOM

## 前端架构

### 三层 Surface 架构

前端有三个认证入口层:

- `/app/*`: 应用工作台
- `/ops/*`: 执行端
- `/admin/*`: 管理后台

Surface 和 Workspace 代码位于:

- `src/App.jsx` — 顶层路由与布局
- `src/features/workspace/workspaceSession.js` — 工作区会话管理
- `src/features/workspace/workspaceStore.js` — 工作区 Zustand store
- `src/features/workspace/useSurfaceWorkspace.js` — Surface 工作区 hook
- `src/utils/surfaceApi.js` — Surface 前缀检测
- `src/utils/moduleAccess.js` — 模块访问权限检查

### 添加或修改模块时的全链路更新

1. 前端导航配置:
   - `src/components/app/appConfig.js`
   - `src/components/ops/opsConfig.js`
   - `src/components/admin/adminConfig.js`
2. 前端路由守卫:
   - `SurfaceProtectedRoute` — 入口层权限
   - `ModuleProtectedRoute` — 模块权限
   - `CapabilityProtectedRoute` — 能力策略（如需要）
3. 后端模块注册表:
   - `server/src/modules/module-access/module-access.registry.js`
4. 后端路由挂载与守卫:
   - `server/src/app.js`
   - `requirePermission` 或 `requireAuthz`
5. 专项测试:
   - surface/workspace 测试覆盖导航和认证上下文变更
   - 模块级前端/后端测试

不要在未匹配路由保护和后端权限的情况下添加可见导航项。

## 代码风格规范

### 缩进

- 前端 (JSX/JS/TS/CSS): **2 空格**
- 后端 (JS): **4 空格**
- 不要在单个文件内混用缩进级别
- 现有使用错误缩进的文件（如 `assetDesignerStore.js` 使用 4 空格）是技术债务，不要在新文件中复制此模式

### 分号

- 前端: **不使用分号**（与 `App.jsx`、`authStore.js`、`Navbar.jsx` 一致）
- 后端: **必须使用分号**（与 `app.js`、`auth.service.js` 一致）
- `.prettierrc.json` 已配置此规则，新代码必须遵循

### 引号

- 统一使用**单引号**（与 `.prettierrc.json` 配置一致）
- JSX 属性使用双引号

### 导出风格

- 前端 API 模块: 仅使用 `export default`。不要在同一 API 文件中混用 `export const` + `export default`
- 前端 Store: 使用 `export default useXxxStore`
- 前端工具模块: 使用命名导出 (`export function` / `export const`)
- 后端模块: 使用命名导出 (`export async function`, `export function`)
- 不要在同一文件中混用 `module.exports` 与 ESM `export`

### 注释语言

- 前端用户可见字符串和注释: **中文**（面向中国市场的产品）
- 后端代码注释: 业务逻辑用**中文**，API 级文档（Swagger JSDoc）用**英文**
- 不要在单个注释块中混用语言

### 命名规范

- 文件: `camelCase.js` 用于工具，`PascalCase.jsx` 用于组件，`kebab-case.js` 用于后端模块
- 变量/函数: `camelCase` 用于 JS/TS，`PascalCase` 用于 React 组件和 TypeScript 类型/接口
- 后端数据库列: `snake_case`（PostgreSQL 惯例），在 API 响应中使用 mapper 转换为 `camelCase`
- 常量: `UPPER_SNAKE_CASE` 用于模块级常量
- CSS 类名: BEM (`block__element--modifier`)
- Zustand store hook: `useXxxStore`

### CSS 与样式

- 优先使用 `src/styles/design-tokens.css` 中的设计 token
- 避免内联样式，除非是无法用类名表达的小型动态值。使用内联样式时引用 CSS 自定义属性（如 `var(--font-size-sm)`），不要硬编码像素值
- 页面级 CSS（如 `login.css`、`command-console.css`）应在使用的组件中导入，不在 `src/main.jsx` 中全局导入
- 只有全局设计系统 CSS 应在 `main.jsx` 中导入
- 构建类名字符串时统一使用模板字面量（`` `class ${active ? 'class--active' : ''}` ``），不要混用字符串拼接

## 前端 API 规则

### 统一 API 客户端

- 默认使用 `src/utils/request.js` 进行认证 API 调用
- 仅在确实需要长超时请求（如 OCR）时使用 `requestWithLongTimeout`
- 公开评估调用使用 `src/utils/assessmentPublicRequest.js`
- 直接 `fetch` 仅允许用于 axios 无法处理的情况：blob 下载、流式传输、HEAD 探测、Service Worker/缓存检查、原始 `FormData`
- 直接 `fetch` 必须共享 auth token 提取和 401 处理逻辑。不要直接读取 `localStorage.getItem('accessToken')`；当前 auth store 持久化在 `auth-storage` 键下
- 新的 blob 下载或上传流程应使用共享 helper，不要在组件中重复 token 解析逻辑

### API 模块规范

- 每个 API 模块文件应仅使用 `export default` 导出一个 API 对象
- API 方法命名: 使用动词前缀（`get`、`list`、`create`、`update`、`delete`、`save` 等）
- 不要在 API 方法中做参数验证 — 验证应在调用方或后端完成
- 不要在 API 模块中添加 `try-catch` — 错误处理由 `request` 拦截器统一完成
- 不要在 API 模块中硬编码路径前缀 — 使用 `resolveSurfacePrefix` 或直接使用正确的后端路径

### 路径重映射（技术债务）

- 不要向 `remapApiPath` 添加新的路径重映射规则。新 API 模块应直接使用正确的后端路径
- 现有重映射是历史债务，逐步迁移

### unwrapData 一致性

- 新 API 模块应统一使用 `unwrapData` 或统一不使用。当前混用是技术债务
- 推荐: 新模块不使用 `unwrapData`，由调用方处理 `response.data`

## 前端状态与存储

### Zustand Store 规范

- Zustand store 持久化应用状态
- Workspace 状态持久化在 `workspace-session` 键下
- Auth 状态持久化在 `auth-storage` 键下
- 不要从页面组件创建新的 localStorage/sessionStorage 键，除非是局部 UI 状态且有明确的清理路径
- 不要在页面中重复解析 workspace `orgId` 和 `raceId`。使用 `useSurfaceWorkspace`、`buildSurfaceHref` 和 workspace helper

### Store 使用规范

- 在组件中使用 Zustand store 时，使用**选择器函数**（如 `useAuthStore((state) => state.token)`），不要解构整个 store。解构会导致不必要的重渲染
- 不要从工具文件直接调用 `useAuthStore.setState(...)`（如 `request.js` 中的 `forceLocalLogout`）。如需跨 store 通信，在 store 中添加专用 action
- Store 方法返回数据时应返回一致的形状。如果方法成功时返回数组，失败时必须返回空数组，不是 `undefined`
- 异步 action 应返回一致的 `{ success, error }` 或 `{ success, data }` 格式

### Store 文件规范

- 新 Store 文件使用 `.js` 扩展名（与现有大多数 store 一致），除非有明确的 TypeScript 类型安全需求
- 如果使用 `.ts`，必须为所有 state 和 action 提供完整的类型定义
- Store 缩进统一使用 2 空格

## 前端组件规范

### 路由守卫组件

- `SurfaceProtectedRoute` 是主路由守卫，用于入口层权限检查
- `ModuleProtectedRoute` 用于模块级权限检查
- `CapabilityProtectedRoute` 用于能力策略检查
- `AuthRoute` 用于通用已登录守卫
- `AdminProtectedRoute` 和 `ScanProtectedRoute` 是历史遗留组件，新代码应使用 `SurfaceProtectedRoute`
- 所有路由守卫组件应使用 CSS 类名，不使用内联样式

### 组件文件规范

- 组件文件使用 `.jsx` 扩展名
- 仅当组件有明确 TypeScript 类型安全需求时使用 `.tsx`
- 组件文件使用 `PascalCase` 命名
- 组件内不要直接读取 `window.location.pathname`，使用 `useLocation()` from `react-router-dom`
- 组件内不要直接读写 `localStorage`，通过 store 或 hook 完成

### 大文件管理

- 现有大文件是历史债务，不是可复制的模式
- 不要向已超过 1000 行的文件添加实质性新行为，除非是窄范围 bug 修复
- 优先提取 hooks、纯工具函数、子组件或 CSS 模块/分区
- 需要控制大小的文件:
  - `src/utils/terrainModel/model.js`
  - `src/views/app/terrain-model/TerrainModelPage.jsx`
  - `src/components/map/MapView3D.tsx`
  - `src/components/map/map.css`
  - `src/views/reimbursement/reimbursement.css`
  - `src/3d-studio/model/editorDocument.js`
  - `src/stores/mapStore.ts`
  - `src/components/app/AppLayout.jsx` (670 行)

## TypeScript 与 JavaScript

- 项目混用 JS/JSX 和 TS/TSX
- 当前有 `tsconfig.json`，但 TypeScript 文件由 Vite 转译，没有项目级类型检查脚本
- 新 TS/TSX 代码中避免使用 `any`。如果外部库强制 `any`，保持转换局部化
- 不要使用 `as any` 类型断言。如果类型确实未知，使用 `unknown` 并用类型守卫收窄
- 具有多个可选字段的接口（如 `MapTreeNode` 有 40+ 字段）应拆分为更小的、聚焦的接口。新类型不应累积超过 10 个可选字段
- `@types/react` 和 `@types/react-dom` 版本必须与安装的 React 版本匹配。当前 `@types/react: ^18` 与 `react: ^19` 不匹配 — 这是待修复的债务
- 不要添加新的 TypeScript 专用约定，除非同时添加配置和验证命令

## 后端架构

### 入口文件

- HTTP 入口: `server/src/app.js`
- 启动入口: `server/src/index.js`
- Worker 入口: `server/src/worker.js`

### 模块结构

新非平凡后端模块的默认结构:

- `*.routes.js`: HTTP 解析、响应格式、中间件装配
- `*.service.js`: 业务规则和编排
- `*.repository.js`: Knex 查询和数据库映射
- `*.validation.js`: 请求负载验证（从路由中提取）
- 共享 helper 文件仅当能消除真实重复时才创建

### 路由处理规则

- 路由处理应保持精简: 解析输入、调用 service、返回响应。将验证移到 `*.validation.js` 或 service 顶部
- 不要在路由文件中直接导入 `knex`。所有数据库访问必须通过 repository 层
- 不要将 `req.body` 直接展开到数据库负载中（`{ ...req.body, ...normalized }`）。只应传递明确白名单的字段给 repository
- 当路由需要多个数据库写入时（如删除记录再删除赛事），使用 Knex 事务（`knex.transaction(async (trx) => { ... })`）

### 上下文对象

- 使用 `req.authContext` 作为认证用户上下文的唯一来源
- 不要在新代码中读取 `req.tenantContext`、`req.user` 或 `req.orgAccess` — 这些是遗留兼容别名
- 添加新上下文属性时，只添加到 `req.authContext`

## 后端权限

### 路由权限规则

- 公开路由必须在 `app.use(requireAuth)` 之前挂载
- 认证路由必须挂载在正确的 surface 前缀下:
  - `/api/app/...`
  - `/api/ops/...`
  - `/api/admin/...`
- 使用 `requirePermission` 进行角色/surface/模块/能力检查
- 使用 `requireAuthz` 进行 OpenFGA/authz 支持的 surface/模块检查
- 保持 deny-by-default 的 `/api/*` 404 行为
- 不要在没有匹配权限决策的情况下暴露新的后端路由

### 权限中间件选择

- `requirePermission`: 用于基于角色的权限检查（surface + role + module + capability 组合）
- `requireAuthz`: 用于基于 OpenFGA 的授权检查（surface + module + scope 组合）
- 新路由应优先使用 `requirePermission`，除非需要 OpenFGA 的细粒度关系检查
- 不要在同一路由上同时使用 `requirePermission` 和 `requireAuthz`

## 后端错误与日志

### 错误处理

- 让 `server/src/middleware/error-handler.js` 处理意外错误
- 对于预期的客户端错误，设置 `err.status` 和 `err.expose = true`，或返回已建立的 `{ success: false, message, code }` 格式
- 不要在路由处理中直接 `console.error` 后返回 — 使用 `next(err)` 传递给错误中间件

### 日志规范

- 避免记录密钥、token、完整 PII 负载或原始上传文件内容
- 直接 `console.*` 在脚本、迁移、本地诊断、启动、worker 生命周期和现有模块中可接受。新的生产请求路径应使用有作用域的最小化消息
- 日志消息应使用一致格式: `[ModuleName] message`。新代码中不要在日志消息中使用 emoji
- 记录变量值时，统一使用模板字面量。不要在同一模块中混用 `console.error('msg:', value)` 和 `console.error(\`msg: ${value}\`)`
- `operationLog` 中间件的 `sanitizeParams` 必须覆盖所有敏感字段名。添加带有敏感字段的新端点时，必须更新 sanitizer
- 非致命的启动错误（如种子数据、调度器加载）应在 `warn` 级别记录清晰消息，不要静默吞掉

## 数据库与迁移

### 迁移规范

- 迁移文件位于 `server/src/db/migrations/`
- 迁移一旦共享或应用就是只追加的。不要编辑旧迁移，除非用户明确要求历史手术
- 新迁移文件名必须使用唯一的时间戳前缀。不要重复历史重复的前缀
- 尽可能包含 `down` 迁移
- 对于 schema 变更，更新引用该 schema 的 mapper/repository、种子数据、测试和文档
- 在声称迁移有效之前，运行 `cd server && npm run migrate` 针对目标数据库

### Repository 规范

- Repository 方法执行多个写入时必须使用 `knex.transaction()`
- Repository 方法必须始终应用租户隔离（`org_id` 过滤），除非调用方明确是 `super_admin`。当 `orgId` 为假值时不要跳过 `org_id` 过滤 — 应返回空结果
- `knexfile.js` 池设置应与 `server/src/db/knex.js` 池设置匹配。不要使 CLI 和运行时池配置分歧

## 环境与外部服务

### 前端环境变量

- 通过 `src/utils/request.js` 或小型配置 helper 集中处理前端 API 基础 URL
- 不要在页面组件中分散新的 `import.meta.env` 读取
- 不要在组件文件中添加硬编码的生产 token、公共服务 token、API 密钥或云源

### 后端环境变量

- 后端环境默认值位于 `server/src/config/env.js`；生产专用密钥必须使用 `requireEnv` 或等效的快速失败检查
- 不要在源文件中硬编码生产 IP 或域名。使用环境变量
- 不要在后端中间件或路由处理中直接读取 `process.env`。从 `server/src/config/env.js` 导入
- 密钥回退值不得使用弱默认值如 `'admin123'` 或 `'dev_secret'`。在开发中使用明确标记为 dev-only 的值，在生产中失败
- `bcrypt.hash` 盐轮数在生产中应为 12，开发中 10 可接受
- Access token 过期时间不应超过 30 分钟。Refresh token 过期时间不应超过 7 天

## 测试与验证

选择最小的有意义门禁，然后在影响范围共享时添加更广泛的门禁。

默认运行:

- 编码或广泛源码编辑: `npm run check:encoding`
- 前端路由/workspace/auth 变更: `npm run test:surfaces`
- 地形模型变更: `npm run test:terrain-model`
- 3D Studio 变更: `npm run test:3d-studio`
- 地图变更: `npm run test:map` 或聚焦的地图测试
- 前端行为或构建影响变更: `npm run build`
- 后端路由/service/db 变更: `cd server && npm run test`，加上可用的聚焦服务器测试
- 迁移变更: `cd server && npm run migrate`

如果命令因数据库、Docker、浏览器或服务不可用而无法运行，报告该确切阻塞原因。

## 依赖管理

- 不要在 `package.json` 中为不存在的版本添加 `overrides`（如 `lodash: ^4.18.1` — lodash 最新版本是 4.17.21）
- `@types/*` 包必须匹配运行时包的主版本号（如 `react: ^19` 对应 `@types/react: ^19`）
- 后端 `package.json` 脚本必须使用与 `Dockerfile` 中 Node.js 版本兼容的标志（当前 `node:20-alpine`）
- 添加新依赖时，检查是否与现有功能重复（如已存在 `xlsx` 和 `exceljs` — 不要添加第三个电子表格库）

## Docker 与部署

- `Dockerfile` 应使用多阶段构建以从生产镜像中排除 devDependencies
- 在 Dockerfile 或 docker-compose 中为生产 app 服务设置 `NODE_ENV=production`
- 不要在 `nginx.conf` 或 `docker-compose.yml` 中硬编码生产 IP、域名或 SSL 证书路径。使用环境变量替换
- `docker-compose.yml` 不得将 `JWT_SECRET` 默认为弱值如 `dev_secret`。省略默认值以便容器在没有正确密钥时启动失败
- `express.json()` body 限制不应超过 10MB，除非特定端点需要更大的负载。对文件上传端点使用路由特定限制
- Dockerfile 应创建非 root 用户运行应用
- Dockerfile 应设置 `HEALTHCHECK` 指令

## 文档

- 保持文档具体: 路径、命令、路由名、负载示例、数据库表名和可观察行为
- 不要写模糊的流程建议，当命令或文件引用更清晰时
- 变更本地开发行为时，更新根 `README.md` 或 `server/README.md`

## 当前技术债务清单（不可复制）

以下来自 2026-06-24 审计的已知问题。不要将它们用作模式。

> **2026-06-25 更新**: 标记 ✅ 的项目已在 P0-P3 修复中解决。

### 前端 API 层

- 至少 7 种不同的 API 调用模式（纯 request / request+unwrapData / request+resolveSurfacePrefix / request+resolveSurfacePrefix+unwrapData / 独立 axios 实例 / 混合 request+fetch / request+resolveSurfacePrefix+自定义 unwrap）
- ✅ `pollJobResult` 在 `audit.js` 和 `lottery.js` 中几乎完全重复 — 已提取到 `src/utils/jobPolling.js`
- `bibTracking.js` 与 `app/bibTracking.js` 几乎完全重复
- `getClothingBasePath` 在 `pipeline.js` 和 `clothing.js` 中重复
- 自定义 `unwrap` 函数在 `column-mappings.js` 和 `import-session.js` 中重复
- ✅ `profile.js` 使用原生 `fetch` 绕过 axios，手动解析 localStorage token — 已改用 `useAuthStore.getState().token`
- `adminApi.js` 的 `getTeamMemberPhoto` 仍使用原生 `fetch`（合理的 blob 下载场景）
- ✅ `colorSchemeApi.js` 和 `adminApi.js` 手动拼接查询参数未使用 `encodeURIComponent` — 已改用 params 对象
- ✅ `profile.js` 的 `JSON.parse(localStorage.getItem('auth-storage'))` 无 try-catch 保护 — 已修复
- ✅ 缩进不一致: `audit.js`、`bib.js`、`clothing.js`、`credential.js`、`lottery.js`、`pipeline.js`、`raceDashboard.js` 使用 4 空格 — 已统一为 2 空格
- ✅ 分号不一致: `profile.js`、`raceDashboard.js` 使用分号 — 已统一为不使用分号
- 导出风格不一致: 部分文件仅默认导出，部分混用命名+默认导出
- 注释语言不一致: 部分文件中文注释，部分英文，部分无注释

### 前端 Store 层

- ✅ `assetDesignerStore.js` 使用 4 空格缩进 — 已统一为 2 空格
- Store 文件混用 `.js` 和 `.ts`（`mapStore.ts`、`modelStore.ts` 为 TS，其余为 JS）
- `authStore.js` 直接读取 `window.localStorage` 获取 workspace session
- 异步 action 返回格式不完全一致

### 前端组件层

- ✅ 6 个路由守卫组件功能重叠 — 已删除未使用的 `AdminProtectedRoute` 和 `ScanProtectedRoute`，保留 4 个
- `ModuleProtectedRoute.jsx` 使用分号，其他组件不使用
- `Navbar.jsx` 解构整个 auth store 而非使用选择器
- `ToolCard.jsx` 导入 `@heroicons/react/24/solid` 但该包未在 `package.json` 依赖中声明
- `AppLayout.jsx` 有 670 行，包含过多逻辑
- `AppLayout.jsx` 的 `useEffect` 有 0 缩进破坏组件结构
- `AppLayout.jsx` 检查不存在的 CSS 变量（`--designer-shell`、`--designer-panel`、`--designer-text`）
- `Login.jsx` 直接读写 `localStorage` 而非通过 store
- `main.jsx` 全局导入页面级 CSS（`login.css`、`command-console.css`）

### 前端工具层

- `ensureArray`、`pickNumber`、`pickString` 在多个 focusZone 文件中重复定义
- `focusZoneStudioScene.js` 有 728 行
- `mapStore.ts` 使用 `as any` 类型断言
- `MapTreeNode` 接口有 40+ 可选字段
- `modelStorageService.ts` 的 `JSON.parse(localStorage.getItem(...))` 缺少 try-catch
- `studioProjectApi.js` 直接读取 `window.localStorage.getItem('auth-storage')` 获取 token
- `gb2260_all.json` 末尾包含误包含的 CSV 表头数据

### 后端

- ✅ `error-handler.js` 直接读取 `process.env.NODE_ENV` — 已改为从 `env.js` 导入
- `require-auth.js` 设置四个上下文对象（`req.authContext`、`req.tenantContext`、`req.user`、`req.orgAccess`）— 新代码只应使用 `req.authContext`
- `require-auth.js` 包含角色迁移映射（`ROLE_MIGRATION_MAP`），计划 2026-07-01 后移除
- `rate-limiter.js` — `loginLimiter` 和 `registerLimiter` 不使用 Redis store，而 assessment limiter 使用
- `capability-policy.js` 硬编码模块列表，应与 `module-access.registry.js` 同步
- `worker.js` 在日志中使用 emoji，`index.js` 不使用
- `worker.js` 关闭超时不使用 `.unref()`，`index.js` 使用
- `worker.js` 未处理 `uncaughtException` 和 `unhandledRejection`（与 `index.js` 不同）
- `auth.service.js` — `ACCESS_TOKEN_EXPIRES = '1h'`（超过 30 分钟建议），`REFRESH_TOKEN_DAYS = 30`（超过 7 天建议）
- `auth.service.js:393` — `forgotPassword` 在 `if (!user)` 分支中始终记录"用户不存在"
- ✅ `race.routes.js` 将 `req.body` 展开到数据库负载中 — 已改为仅使用验证后的字段
- `race.repository.js` 删除操作已使用事务（无需修复）
- `env.js` 开发环境默认 `JWT_SECRET` 为 `'dev-only-do-not-use-in-production'`
- `env.js` 默认 `SUPER_ADMIN_PASSWORD` 为 `'change-me-in-dev'`
- `knexfile.js` 池配置（`min: 2, max: 10`）与 `db/knex.js` 动态池配置不匹配
- ✅ `docker-compose.yml` worker 服务默认 `JWT_SECRET` 为 `dev_secret` — 已改为强制要求设置
- `docker-compose.yml` `POSTGRES_PASSWORD` 默认为 `door_dev`
- ✅ `Dockerfile` 未创建非 root 用户 — 已添加非 root 用户
- ✅ `Dockerfile` 未设置 `HEALTHCHECK` — 已添加 HEALTHCHECK
- ✅ `nginx.conf` `client_max_body_size 500M` 过大 — 已降为 50M
- ✅ `express.json({ limit: '50mb' })` 限制过大 — 已降为 10MB
- `server/package.json` `devDependencies` 仅有 `supertest`，缺少 ESLint、Prettier、TypeScript
- `server/package.json` 无 `engines` 字段
- ✅ `package.json` `overrides` 包含 `lodash: ^4.18.1`（不存在的版本）— 已确认为 `^4.17.21`（正确）
- ✅ `@types/react: ^18` 与 `react: ^19` 不匹配 — 已更新为 `^19.0.0`
- ✅ 无项目级 lint/typecheck 门禁 — 已添加 `lint`、`lint:fix`、`format`、`format:check`、`typecheck` 脚本
- `request.js` 拦截器逻辑在 `request` 和 `requestWithLongTimeout` 实例间重复
- `remapApiPath` — 前端 API 路径与后端路径不匹配，需要运行时重写
