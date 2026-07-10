# ArcSpro 赛事管理系统整改验收报告

**整改分支：** `codex/door-remediation-20260710`

**基线提交：** `225027def0189cdbc4999638eff6efd3d6e52434`

**验收日期：** 2026-07-10

**状态：** 代码整改已完成主要阶段；数据库、部署和登录后业务验收仍受环境阻塞，长期目标不得关闭。

## 1. 原始问题与整改证据

| 原始问题 | 整改结果 | 主要证据 |
| --- | --- | --- |
| 原工作树混有大量历史 Agent 改动 | 使用独立 worktree 和分支整改，未覆盖原工作树 | `.worktrees/door-remediation-20260710`；分支 `codex/door-remediation-20260710` |
| 前端无法可复现安装 | 统一 npm workspace、根锁文件和依赖版本；移除失效的 `server/package-lock.json` | `npm ci` 在全新 detached worktree 成功 |
| 已跟踪开发密钥和测试数据库风险 | 删除跟踪的 `.env.dev`；增加密钥扫描和测试库名称硬保护 | `node scripts/check-tracked-secrets.mjs`；`server/npm run test:safety` 4/4 |
| 容器探针命中受保护接口 | 区分 `/api/health/live` 和 `/api/health/ready` | 部署配置测试；运行环境尚待容器验证 |
| 前端认证与请求循环依赖 | 请求层改为 session/context adapter，移除 store 反向依赖 | API/认证边界测试；`be20ba5`、`ef02242` |
| API 路径 remap、响应猜测和错误丢失 | 明确 surface API，统一响应 envelope 和结构化错误 | API 契约测试；`fb652f7` 至 `5a369c5` |
| 权限入口不统一 | 建立授权矩阵和单一 authorization adapter，清理旧请求上下文 | 授权矩阵与模块边界测试；`2b3aaea`、`30b04b2`、`0a60b95` |
| 路由/controller 直连数据库 | records、import、audit、lottery、bib、profile、team、credential、reimbursement、inventory、system、projects、races、backup 等模块按 schema/service/repository 收敛 | 后端架构 ratchet：直接数据库导入 0，原始 request 持久化 0 |
| 多写流程缺少事务/并发保护 | 名单提交、审核步骤、抽签 finalize/rollback、号码分配、报销匹配、库存/盘点/空间变更等增加事务或行锁 | 对应 workflow atomicity 测试 |
| 三套 surface 重复维护导航与路由 | app、ops、admin 各自使用单一 route registry | 路由注册表测试；`9226368`、`b17b06b`、`7eb123c` |
| 三套布局重复 | `SurfaceShell` 统一桌面侧栏、移动菜单和内容槽位，旧 `LayoutShell` 已删除 | surface shell 测试；`e9c643f` |
| 前后端各维护一份 3D Studio 模型 | 新建 `@arcspro/studio-model`，前后端兼容路径都转发到同一实现 | 共享导出引用一致、后端不再跨目录导入前端；3D/GIS 测试 56/56 |
| 3D/GIS 热点文件过大 | 编辑器拆出 value/plane/polygon/terrain mesh；地形拆出 numeric/geo/export/color/coordinates/print config；地图拆出 OSM 集成；地形页拆出状态和交付组件 | `editorDocument.js` 3304→3031 行；`model.js` 5733→3684 行；`MapView3D.tsx` 2858→2634 行；`TerrainModelPage.jsx` 4088→3675 行 |
| 依赖漏洞 | 更新 Vite、React 插件、SheetJS 官方发布包和 uuid；清理重复锁文件 | 根与 server 的 `npm audit --audit-level=low` 均为 0 vulnerabilities |
| LLM API Key 提示与真实存储不符 | 页面明确说明密钥经登录会话提交、服务端加密保存、浏览器只保留掩码 | 前后端密钥测试 5/5；`2c4b2cd` |
| 登录页静态声称服务正常 | 登录页调用 `/api/health/live`，离线时显示“服务暂不可用” | 浏览器实测后端关闭时状态正确；`f849e7f` |
| 构建和浏览器告警 | 启用 Router v7 future flags，移除瓦片缓存无效动态导入 | 新浏览器标签页 0 error/0 warning；构建无 `INEFFECTIVE_DYNAMIC_IMPORT` |

## 2. 已通过门禁

### 2.1 全新检出前端门禁

在 detached worktree、无既有 `node_modules` 的条件下执行：

```text
npm ci                                      PASS，833 packages，0 vulnerabilities
npm run check:encoding                      PASS
npm run lint                                PASS，0 errors，1067 warnings
npm run typecheck                           PASS
npm test                                    PASS，当前主工作树 301 tests
npm run build                               PASS，Vite 8
node scripts/check-tracked-secrets.mjs      PASS
npm audit --audit-level=low                 PASS，0 vulnerabilities
npm run format:check                        PASS
```

构建仍报告若干大于 500 kB 的第三方/3D chunk。这是性能债务，不影响产物生成，但应继续按路由和重型编辑器功能做按需加载。

### 2.2 服务端无数据库门禁

```text
npm run test:safety                         PASS，4/4
npm run test:architecture                   PASS，7/7
精选架构、HTTP、库存、UUID 回归             PASS，55 tests
npm audit --audit-level=low                 PASS，0 vulnerabilities
```

常规服务端测试已不再混入需要先启动 `:3001` 的多租户运行时脚本；该脚本由 `npm run test:runtime` 单独执行。

### 2.3 浏览器证据

本地 Vite 8 开发服务器：`http://127.0.0.1:5173`。

- `/` 正确进入统一登录页。
- 未登录访问 `/app`、`/ops`、`/admin` 均跳转 `/login`。
- 后端未启动时，登录页显示“服务暂不可用”，不再误报正常。
- 默认 1280px 视口：控制台 0 error、0 warning。
- 390×844 视口：登录表单可见，`scrollWidth === innerWidth === 390`，无横向溢出。

## 3. 未通过或未执行的门禁

### 3.1 PostgreSQL 集成测试 — BLOCKED

本机没有 PostgreSQL 客户端或服务。使用明确测试库 URL 执行：

```text
DATABASE_URL=postgres://door:door_dev@127.0.0.1:5432/door_test npm test
```

结果为 `ECONNREFUSED 127.0.0.1:5432`。测试库保护已先通过，因此没有连接生产式数据库的风险。必须在有独立 `door_test` 的 CI 或容器环境重跑全部迁移和集成测试。

### 3.2 登录后关键业务流 — BLOCKED

没有可用 API、测试数据库和验收账号，以下流程不能用浏览器假数据代替：

1. 登录 → workspace → app/ops/admin 权限切换；
2. 选择赛事 → 导入名单 → commit → records；
3. 审核五步 → job polling → 结果；
4. 抽签 preview/finalize/rollback；
5. 号码布分配、导出、追踪；
6. 证件申请、审核、签发；
7. 报销导入、OCR、匹配、导出；
8. 库存入库、绑定、出库、盘点；
9. GIS 地图 → 3D Studio → 导出。

### 3.3 容器、部署和回滚 — BLOCKED

本机没有 Docker、Podman 或 Colima，尚未执行：compose config/build/up、迁移、`/live`、`/ready`、备份和镜像/数据库回滚。

### 3.4 外部密钥轮换 — EXTERNAL BLOCKER

仓库已不再跟踪有效密钥，密钥扫描通过；但 OCR/API 密钥的真实撤销与重发、生产 PII v2 轮换和旧数据重加密需要外部服务与生产权限。当前没有轮换工单或平台截图，不能视为完成。

### 3.5 远程 CI — NOT RUN

本分支未推送、未创建 PR，因此 GitHub Actions 只完成了配置和静态测试，尚无远程执行记录。

## 4. 关闭条件

长期目标只能在以下证据全部补齐后关闭：

1. 独立 PostgreSQL `door_test` 上全量 server tests 通过；
2. 九条关键业务流逐条有 API 日志或截图；
3. Docker 部署、健康、迁移、备份、回滚通过；
4. 外部 OCR/API 和生产 PII 密钥轮换证据回填；
5. 远程 CI 全绿；
6. 最终 HEAD 再做一次全新检出门禁，工作树保持干净。
