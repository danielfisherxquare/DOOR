# ArcSpro 工作区与三入口重构设计

## 目标

把现在混在一起的赛事上下文、应用入口、执行入口、后台管理入口拆开。

本次采用中修方案：不拆成三个仓库，也不重写业务模块；先把同一个前端和同一个后端里的入口、路由、权限、API 边界拆清楚。用户登录后先进入工作区选择器，选定组织和赛事，再进入对应入口。

目标状态：

~~~text
登录
  -> 工作区选择器：组织 + 赛事
  -> 入口选择器：应用层 / 执行层 / 管理层
  -> 进入具体应用
~~~

进入应用后，页面内不再反复要求选择组织和赛事。组织、赛事、入口三个上下文来自同一个 workspace session。

## 成熟系统模式

参考系统给出的共同做法：

- Shopify 的 store switcher 在登录后让用户从顶部栏切换店铺，并展示最近访问店铺和可搜索列表。
- Atlassian Administration 把组织管理、用户、应用访问、备份、安全等治理能力放在独立管理入口。
- Jira 把具体项目空间和项目设置分开，日常工作在项目内完成，配置项进入项目管理或组织管理。
- Slack Enterprise 把 Enterprise organization 和 workspace 分层，一个组织下面多个 workspace，每个 workspace 有自己的成员、频道和应用安装。

落到 ArcSpro，不应该在每个应用里塞一套组织/赛事选择器。应该先确定当前组织和赛事，再进入应用。管理入口负责治理，应用入口负责业务处理，执行入口负责现场动作。

参考链接：

- Shopify store switcher: https://help.shopify.com/en/manual/your-account/logging-in/store-switcher
- Atlassian organization administration: https://support.atlassian.com/organization-administration/docs/explore-an-atlassian-organization/
- Atlassian admin permissions: https://support.atlassian.com/user-management/docs/give-users-admin-permissions/
- Jira navigation: https://support.atlassian.com/jira-software-cloud/docs/what-is-the-new-navigation-in-jira/
- Jira project configuration: https://support.atlassian.com/jira-cloud-administration/docs/configure-a-project/
- Slack Enterprise organizations: https://docs.slack.dev/enterprise/

## 当前系统证据

### 入口已经有雏形，但边界没有守住

`src/App.jsx` 已经把三层挂出来：

- `/app/*`: 应用层。
- `/ops/*`: 执行层。
- `/admin/*`: 管理层。

问题是三层内部继续互相引用：

- `src/components/ops/OpsLayout.jsx` 直接 import `src/views/admin/credential/CredentialIssuePage.jsx`，执行层证件发放用的是管理端页面。
- `src/components/admin/AdminLayout.jsx` 把 `/admin/import`、`/admin/records`、`/admin/lottery`、`/admin/bib`、`/admin/clothing`、`/admin/inventory/*` 等老入口 redirect 到 `/app/*`。
- `src/components/app/AppLayout.jsx` 把证件中心多个页面从 `src/views/admin/credential/*` 引入到应用层。
- `src/components/ops/OpsLayout.jsx` 的侧边栏里还有跳到应用层和管理层的跨入口链接。

这说明现在不是三个入口，而是一套混合导航。

### 赛事上下文重复实现

以下文件都在自己解析 orgId/raceId：

- `src/utils/surfaceContext.js`
- `src/components/app/AppLayout.jsx`
- `src/components/admin/AdminLayout.jsx`
- `src/components/ops/OpsLayout.jsx`

当前做法依赖 URL query、用户偏好和本地状态混合解析。结果是每个入口都像一个独立系统，每次进模块都容易重新选择组织和赛事。

### API 已经开始按入口拆，但旧映射还在

`server/src/app.js` 已经挂了三组接口：

- `/api/app/*`
- `/api/ops/*`
- `/api/admin/*`

但前端还有旧兼容映射：

- `src/utils/request.js` 会把 `/records`、`/lottery`、`/bib`、`/clothing`、`/import-sessions` 等业务接口映射到 `/admin/*`。
- `src/api/app/bibTracking.js` 仍把应用层 bib tracking 指到 `/admin/bibs`。

这会让应用层看起来在 `/app`，实际数据权限仍绕回管理端。

### 权限模型混了三类东西

现有模型同时存在：

- surface access: 能不能进 `/app`、`/ops`、`/admin`。
- module access: 能不能看到 `app:design-requests`、`ops:warehouse` 这种模块。
- capability: 能不能执行 `race:approve`、`credential:*` 这类动作。

问题在于管理端角色绕过太多模块限制：

- `server/src/utils/capability-policy.js` 里 `super_admin`、`org_admin` 默认能进三个入口。
- `src/components/ModuleProtectedRoute.jsx` 和 `server/src/middleware/requirePermission.js` 对管理角色有大量 bypass。
- `src/views/admin/identity/IdentityModuleMatrixPanel.jsx` 仍用“用户 x 模块”的大矩阵管理入口，已经不适合三入口模型。

旧权限页也已经下线：

- `/admin/users`
- `/admin/module-permissions`
- `/admin/race-permissions`
- `/admin/org-race-permissions`

`src/components/admin/adminConfig.js` 已经把这些标记为废弃入口。

### 本地数据能说明哪些模块正在动

本地库不是生产库，只能做开发态参考。当前样本里有真实数据的模块主要是：

- 设计需求和审批：`design_requests`、`approval_instances`、`approval_tasks`、`design_request_reviews` 等有数据。
- 人员/赛事/组织：`organizations`、`users`、`races`、`team_members` 有数据。
- 模块授权：`user_module_access` 里出现 `app:design-requests` 和 `ops:design-requests`。

本地样本里大量业务表为空，包括导入、记录、抽签、号码布、服装、证件、库存、报销、项目、考核等。这不能证明生产没人用，只能证明这批本地数据不能作为“删除模块”的依据。

## 目标入口定义

### 工作区选择器

路径建议：

- `/workspaces`: 登录后默认进入。
- `/workspaces/select`: 更换组织和赛事。
- `/launcher`: 已选工作区后的入口选择器。

workspace session 字段：

~~~json
{
  "orgId": "org_1",
  "orgName": "中奥资源",
  "raceId": "race_1",
  "raceName": "2026 成都定向赛",
  "surface": "app",
  "lastAppPath": "/app/design-requests",
  "lastOpsPath": "/ops/scan",
  "lastAdminPath": "/admin/races"
}
~~~

规则：

- 组织和赛事只在工作区选择器里选。
- 三入口顶部只显示当前组织和赛事，提供“切换工作区”按钮。
- 业务页面不再自己选择赛事。确实需要跨赛事查询的页面，必须进入管理层报表或明确使用筛选器。
- URL query `?orgId=&raceId=` 进入兼容期，只用于老链接迁移；新页面不再生成这类链接。

### 应用层 /app

面向办公室业务人员、设计师、赛事业务负责人。核心是计划、配置、处理、统计。

典型动作：

- 导入报名数据。
- 处理记录、抽签、服装、号码布编排。
- 查看赛事项目、进度、地图、3D、地形模型。
- 个人报销提交和状态查看。
- 设计师处理已审批设计需求。
- 证件申请、证件业务审核。
- 查看业务统计和追踪。

不做：

- 不管理组织、账号、角色。
- 不做现场扫码发放。
- 不维护系统备份、全局品牌、安全配置。

### 执行层 /ops

面向现场执行人员、仓库人员、发放人员。核心是单一任务、低学习成本、移动端可用。

典型动作：

- 通用扫码。
- 号码布领取。
- 证件发放。
- 仓库入库、出库、绑定、盘点。
- 现场部门提交设计需求或物资需求。
- 查看当前任务的异常和处理结果。

不做：

- 不创建组织和赛事。
- 不维护规则模板。
- 不审批复杂流程。
- 不进入管理报表。

### 管理层 /admin

面向平台管理员、组织管理员、赛事主管。核心是治理、配置、审计、授权。

典型动作：

- 组织、赛事、成员、团队、账号管理。
- 工作区访问、角色、入口权限、模块权限、动作权限管理。
- 审批流程定义、赛事岗位任命。
- 证件规则、分区、证件类型、样式模板。
- 设计需求模板、审核、分派策略。
- 报销规则、财务审核、导出。
- 库存主数据、仓库配置、预警规则、报表。
- 品牌色、系统备份、操作日志、系统任务。

不做：

- 不承载导入记录处理、抽签、号码布领取这类日常业务页面。
- 不直接复用应用层和执行层的页面组件作为路由页面。

## 模块归类

| 当前入口/模块 | 现状问题 | 目标归属 | 处理 |
| --- | --- | --- | --- |
| `/app` 首页、个人资料 | 应用层合理 | 应用层 | 保留，读取 workspace session |
| `/app/events/import` | 旧 admin 页面已废弃但仍有 admin redirect | 应用层 | 保留应用层页面，删除 admin 业务入口 |
| `/app/events/processing` | 同上 | 应用层 | 保留 |
| `/app/events/records` | 同上 | 应用层 | 保留 |
| `/app/events/lottery` | 同上 | 应用层 | 保留 |
| `/app/events/bib` | 计划编排和现场发放混淆 | 应用层 | 保留编排；发放迁到执行层 |
| `/app/events/clothing` | 业务配置，不是现场动作 | 应用层 | 保留 |
| `/app/race-dashboard` | 业务看板 | 应用层 | 保留 |
| `/app/projects` | 项目推进 | 应用层 | 保留；管理层只留项目配置或审计 |
| `/app/reimbursements` | 个人提交和财务审核可能混在一起 | 应用层 + 管理层 | 个人提交留应用层；规则、审核、导出进管理层 |
| `/app/design-requests` | 已按三入口设计，但权限和导航还不稳 | 应用层 | 设计师工作台留应用层 |
| `/ops/design-requests` | 部门提交入口可能被现场入口承载 | 执行层或应用层 | 若是现场部门提交，留执行层；若是办公室提需求，迁到应用层请求入口 |
| `/admin/design-requests` | 管理层合理 | 管理层 | 保留审核、模板、分派策略 |
| `/app/map` | 赛事业务工具 | 应用层 | 保留 |
| `/app/3d-studio` | 赛事业务工具 | 应用层 | 保留 |
| `/app/terrain-model` | 赛事业务工具 | 应用层 | 保留 |
| `/asset-designer` | 独立老入口 | 应用层 | 改成应用层内部入口或 redirect 到 `/app/3d-studio` |
| `/app/credential-center` | 从 admin 证件页面 import | 应用层 | 拆出业务组件，应用层只放申请/业务审核 |
| `/app/credential-access-areas` | 规则配置 | 管理层 | 从应用层移走 |
| `/app/credential-categories` | 规则配置 | 管理层 | 从应用层移走 |
| `/app/credential-styles` | 样式模板 | 管理层 | 从应用层移走 |
| `/app/credential-requests` | 证件申请池 | 应用层 | 保留，组件从 admin 目录移到 feature 目录 |
| `/app/credential-review` | 业务审核 | 应用层或管理层 | 默认放应用层；最终配置和越权审核放管理层 |
| `/app/credential-issue` | 发放动作 | 执行层 | 从应用层移走 |
| `/ops/credentials/issue` | 当前复用 admin 页面 | 执行层 | 重写为现场发放页面，不 import admin view |
| `/ops/scan` | 执行层合理 | 执行层 | 保留 |
| `/ops/bibs/pickup` | 执行层合理 | 执行层 | 保留 |
| `/ops/warehouse/*` | 通过 wrappers 复用 inventory 页面内容 | 执行层 | 抽 shared service，执行层只保留现场动作 UI |
| `/app/inventory/*` | 业务库存台和执行仓库混用 | 应用层 + 执行层 + 管理层 | 入出库动作进执行层；业务统计/看板进应用层；仓库规则/主数据进管理层 |
| `/admin/inventory/*` | redirect 到 app | 管理层 | 改为仓库配置和报表，不跳 app |
| `/admin/orgs` | 管理层合理 | 管理层 | 保留 |
| `/admin/races` | 管理层合理 | 管理层 | 保留赛事主数据 |
| `/admin/team` | 管理层合理 | 管理层 | 保留团队和岗位 |
| `/admin/identity-center` | 管理层合理但模型要改 | 管理层 | 重做为角色包、入口授权、赛事授权、动作授权 |
| `/admin/db-backups` | 管理层合理 | 管理层 | 保留 |
| `/admin/branding/colors` | 管理层合理 | 管理层 | 保留 |
| `/admin/bib-tracking` | 跟现场状态相关，但属于管理观察 | 管理层 + 应用层 | 管理层看全局审计；应用层看业务追踪 |
| `/app/bib-tracking` | API 仍打到 admin | 应用层 | API 改到 `/api/app/bibs` 或只读 app endpoint |
| `/admin/interview`、`/app/interview` | 双入口职责不清 | 管理层优先 | 如果用于 HR 记录和考核，归管理层；若是赛事工具，再另开应用层工具 |
| `/app/assessment` | 员工/组织考核倾向管理域 | 管理层 | 迁入管理层或下线 |
| `/app/mechanical-clock*` | 工具属性强，和赛事主流程弱 | 应用层工具或下线 | 若无明确业务场景，放入“实验工具”并默认隐藏 |
| `/admin/users` 等旧权限页 | 已标记下线 | 废弃 | 删除路由或保留只读迁移页 |
| `src/views/admin/import|processing|records|lottery|bib|clothing` | 未被当前路由 import | 候选删除 | 先加无引用检查，再删除 |

## 权限重构

不要再用一个大矩阵同时解决所有问题。拆成四层：

1. 入口权限：能不能进入应用层、执行层、管理层。
2. 工作区权限：能访问哪些组织和赛事。
3. 应用权限：在某个入口里能看到哪些应用。
4. 动作权限：在某个应用里能执行哪些动作。

示例：

~~~json
{
  "userId": "u_12",
  "workspaceScopes": [
    { "orgId": "org_1", "raceIds": ["race_1", "race_2"] }
  ],
  "surfaceAccess": ["app", "ops"],
  "appAccess": ["app:design-requests", "ops:scan", "ops:bib-pickup"],
  "capabilities": ["design_request:create", "bib_pickup:scan"]
}
~~~

管理层的 Identity Center 应改成三个页面：

- 角色包：赛事主管、设计师、仓库员、证件发放员、财务审核员等。
- 工作区授权：用户能访问哪些组织和赛事。
- 应用和动作授权：某个入口下能开哪些应用、做哪些动作。

旧页面处理：

- `/admin/module-permissions`: 迁到“应用授权”。
- `/admin/race-permissions`: 迁到“工作区授权”。
- `/admin/org-race-permissions`: 合并进“工作区授权”。
- `/admin/users`: 合并进 Identity Center 用户页。

角色原则：

- `super_admin` 只用于平台维护，不应该成为所有业务动作的默认绕过口。
- `org_admin` 可以管理组织和授权，但进入执行层也要有明确执行应用权限。
- `race_admin` 不是管理端管理员，默认应进入执行层或应用层，只管理被分配赛事的业务。
- 普通用户默认只进应用层，除非被授予执行层任务。

## API 边界

保留现有 `/api/ops/*` 兼容期，但目标语义改成 Execute App。

建议目标：

- `/api/app/*`: 应用层业务 API。
- `/api/execute/*`: 执行层 API，新接口使用这个前缀。
- `/api/ops/*`: 兼容旧执行层路径，逐步 redirect 或代理到 `/api/execute/*`。
- `/api/admin/*`: 管理层 API，只承载治理、配置、审计、授权。

迁移规则：

- 应用层不能调用 `/api/admin/*` 做业务读写。
- 执行层不能调用 `/api/admin/*` 做现场动作。
- 管理层可以读业务汇总，但不能复用应用层页面作为管理页面。
- `src/utils/request.js` 的 legacy remap 要逐项消除，每消一项加一条测试。

## 前端目录边界

目标目录：

~~~text
src/surfaces/app/
src/surfaces/execute/
src/surfaces/admin/
src/features/credential/
src/features/inventory/
src/features/designRequests/
src/features/workspace/
src/shared/
~~~

原则：

- `surfaces/*` 放路由、布局、导航、入口壳。
- `features/*` 放可复用业务组件和 hooks。
- `shared/*` 放纯 UI、请求封装、格式化工具。
- 禁止 `src/surfaces/execute` import `src/surfaces/admin`。
- 禁止 `src/surfaces/app` import `src/surfaces/admin`。
- 允许三层都 import `src/features/*`，但 feature 内要按 mode 暴露组件，不把管理按钮带进执行页面。

## 迁移阶段

### Phase 0: 冻结现状清单

- 生成路由清单、导航清单、API 调用清单。
- 标记所有跨入口 import。
- 标记所有 `/api/admin/*` 被应用层或执行层调用的位置。
- 给候选删除文件跑无引用检查。

输出：

- `docs/audits/workspace-surface-route-inventory.md`
- `docs/audits/workspace-surface-permission-inventory.md`

### Phase 1: 工作区选择器

- 新增 workspace session store。
- 登录后无 org/race 时进入 `/workspaces`。
- 选中组织和赛事后进入 `/launcher`。
- App/Admin/Execute 三个 layout 改为只读 workspace session，不再各自解析 query。
- 保留老 query 兼容入口，进入后写入 workspace session 并清理 URL。

验收：

- 用户选一次组织和赛事后，进入 `/app/design-requests`、`/ops/scan`、`/admin/races` 都显示同一工作区。
- 刷新页面后仍保持工作区。
- 退出登录后清空工作区。

### Phase 2: 三入口导航隔离

- 应用层只显示应用层导航。
- 执行层只显示执行层导航。
- 管理层只显示管理层导航。
- 跨入口跳转统一放到顶部入口切换器，不放进业务侧边栏。

验收：

- `/ops` 侧边栏不出现“进入应用层/管理层”业务链接。
- `/admin` 不再把业务模块当作管理菜单。
- `/app` 不再出现规则配置类证件页面。

### Phase 3: 证件和库存先拆

优先拆证件和库存，因为这两个模块最明显地横跨三层。

证件：

- 管理层：分区、类型、样式、审核规则。
- 应用层：申请、业务审核、状态。
- 执行层：扫码、发放、领取确认。

库存：

- 管理层：仓库主数据、规则、预警、报表。
- 应用层：库存看板、计划、需求、统计。
- 执行层：入库、出库、绑定、盘点。

验收：

- 执行层证件发放不 import admin credential view。
- 应用层不再出现证件规则配置页面。
- 执行层 warehouse 页面不直接复用 app inventory 页面 UI，只共享 service 和纯组件。

### Phase 4: API 反向依赖清理

- 为 app bib、events、inventory、credential 补齐 `/api/app/*`。
- 为 execute credential、warehouse、scan、pickup 补齐 `/api/execute/*`。
- 移除 `src/utils/request.js` 中业务到 admin 的 legacy remap。

验收：

- 应用层路由请求不命中 `/api/admin/*`。
- 执行层路由请求不命中 `/api/admin/*`。
- 管理层 API 的写接口都要求管理入口和管理能力。

### Phase 5: 权限中心重做

- 用角色包替代大矩阵默认页面。
- 工作区授权、入口授权、应用授权、动作授权分屏管理。
- `super_admin`、`org_admin` 的 bypass 缩小到治理动作，不再自动代表业务动作。
- 清理废弃权限页路由。

验收：

- 证件发放员只能进执行层证件发放，不能进管理层证件规则。
- 设计师只能进应用层设计需求，不能审批自己的待审需求。
- 赛事主管能访问分配赛事的应用层/执行层能力，但不能进入平台级管理能力。

### Phase 6: 删除死代码和老入口

- 删除无引用的 admin import/processing/records/lottery/bib/clothing 页面。
- 删除或迁移 `/asset-designer` 老入口。
- 删除废弃权限页。
- 删除 query 型赛事选择器 UI。

验收：

- 路由清单没有废弃入口。
- `rg "views/admin/.+" src/components/app src/components/ops` 不再出现跨入口 view import。
- `rg "/api/admin" src/api src/services src/views/app src/views/ops` 不再出现业务层直打管理 API。

## 第一批实现顺序

建议第一批只做边界，不碰所有业务细节：

1. 新增 workspace session 和 `/workspaces`、`/launcher`。
2. 三个 layout 统一读取 workspace，不再各自选择 org/race。
3. 清理导航跨入口链接。
4. 把证件中心按三层拆第一刀。
5. 把库存按三层拆第一刀。
6. 重做 Identity Center 的授权模型入口。

这批完成后，用户体感会先变：先选赛事，再进入应用；三个入口互不串门。后续再逐项清 API 和旧页面。

## 风险和决策点

### `/ops` 是否改名

代码和 API 里已经大量使用 `/ops`。用户侧可以命名为“执行端”，代码第一阶段保留 `/ops`，避免大范围破坏。新 API 可以逐步引入 `/api/execute/*`。

### 设计需求提交入口放哪里

当前设计是 `/ops/design-requests` 提交、`/admin/design-requests` 审核、`/app/design-requests` 设计师处理。如果提交人是现场部门人员，留在执行层。如果提交人是办公室业务人员，应迁到应用层，并让执行层只保留现场补单/临时需求。

### 报销和证件审核放哪里

审核不是天然等于管理层。规则、模板、越权审批、财务导出属于管理层；业务负责人按赛事处理申请，可以在应用层完成。执行层只做现场核验和交付。

### 哪些模块能删除

只能删除三类：

- 已经由配置标记下线的旧权限页。
- 无路由、无 import、无测试引用的旧重复页面。
- 明确迁移完成并有 redirect 覆盖的老入口。

本地数据库为空不能作为删除依据。

## 验收清单

- 登录后没有工作区时进入 `/workspaces`。
- 选中组织和赛事后进入 `/launcher`。
- `/app/*`、`/ops/*`、`/admin/*` 顶部都显示同一工作区。
- 应用层页面不再显示组织/赛事选择器。
- 执行层页面不再 import 管理层 view。
- 应用层页面不再 import 管理层 view。
- 应用层和执行层不再调用 `/api/admin/*` 做业务读写。
- Identity Center 能按角色包给用户分配入口、赛事、应用、动作。
- 旧权限页只有迁移提示或被删除。
- 老链接带 `?orgId=&raceId=` 时能进入并写入 workspace session。
