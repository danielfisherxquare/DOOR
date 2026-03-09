# DOOR 系统 README

本仓库中与 DOOR 相关的主要目录：

- `door/`：门户前端（Vite + React）
- `door/server/`：后端 API（Express + PostgreSQL + Knex）
- `tool/`：本地数据管理工具（Vite + Electron）

## 端口基线

| 服务 | 默认端口 | 说明 |
|---|---:|---|
| DOOR 后端 API | `3001` | `http://localhost:3001/api/...` |
| DOOR 前端 dev | `5173` | Vite dev server，`/api` 代理到 `3001` |
| TOOL 前端 dev | `5174` | Vite dev server，`/api` 代理到 `3001` |
| Nginx 网关 | `80` | Docker 部署入口，`/api` 反代到 `app:3001` |
| PostgreSQL | `5432` | Docker 映射 `5432:5432` |

## 云端部署配置

DOOR 部署在云服务器（阿里云），使用 HTTP `80` 端口对外服务。

- 主入口（IP）：`http://47.251.107.41`
- 域名入口：`http://www.xquareliu.com` / `http://xquareliu.com`

> [!IMPORTANT]
> **以下配置必须保持一致，任何端口或域名变更时需同步更新所有位置。**

### 1. 后端环境变量（`door/server/.env`）

```env
NODE_ENV=production
PORT=3001
PUBLIC_BASE_URL=http://47.251.107.41
CORS_ORIGIN=http://47.251.107.41,http://www.xquareliu.com,http://xquareliu.com
```

> [!CAUTION]
> **CORS_ORIGIN 中的域名不要带端口号**（80 端口在 HTTP 中是默认的，浏览器 origin 不会包含 `:80`）。
> 错误示例：`http://www.xquareliu.com:8080` ← 会导致浏览器报 Network Error。

### 2. 前端环境变量（`door/.env`，构建时使用）

```env
VITE_API_BASE_URL=http://47.251.107.41/api
```

> 如果不设置此变量，前端代码会 fallback 到 `/api`（相对路径），在同域部署时也能正常工作。

### 3. Nginx 网关（`door/server/nginx.conf`）

```nginx
listen 80;
server_name 47.251.107.41 www.xquareliu.com xquareliu.com;
```

### 4. Docker 端口映射（`door/server/docker-compose.yml`）

```yaml
nginx:
  ports:
    - "80:80"
```

---

## 首次部署（从零开始）

在 `door/server/` 目录执行：

```bash
# 1. 复制环境变量模板并编辑
cp .env.example .env
# 编辑 .env：设置 POSTGRES_PASSWORD、JWT_SECRET 等

# 2. 构建前端（在 door/ 目录）
cd ..
npm ci
npm run build
cd server

# 3. 启动所有服务
docker compose up -d --build

# 4. 执行数据库迁移
docker compose exec app npm run migrate

# 5. 创建超级管理员
docker compose exec app node scripts/seed-super-admin.js
# 默认账号: Xquareliu / lk930813（可通过环境变量覆盖）
```

健康检查：

```bash
curl -i http://127.0.0.1/api/health/ready
# 期望: {"status":"ok","database":"connected"}
```

---

## 更新与发布（生产环境）

代码更新后，需要在云端执行以下步骤：

### Docker 部署（推荐）

```bash
cd door/server

# 1. 拉取最新代码
git pull

# 2. 重新构建前端（如有前端变更）
cd ..
npm ci
npm run build
cd server

# 3. 重新构建并启动服务
docker compose up -d --build

# 4. 执行数据库迁移（如有新迁移文件）
docker compose exec app npm run migrate

# 5.（可选）更新超管凭证
docker compose exec app node scripts/seed-super-admin.js
```

> [!WARNING]
> **单页应用 (SPA) 路由 Fallback**
>
> 前端使用 React Router (BrowserRouter)，打包产物只有一个 `index.html`。
> 必须在 Nginx 中配置 `try_files $uri $uri/ /index.html`，否则深层链接（如 `/scan`、`/admin`）会 404。
> 当前 `nginx.conf` 已包含此配置。

### 仅重启服务（不重新构建）

```bash
# 修改了环境变量（如 CORS_ORIGIN）后仅需重启：
docker compose restart app worker
```

### 手动部署（非 Docker）

```bash
# 前端
cd door && npm ci && npm run build
# 将 dist/ 上传到服务器供 Nginx 托管

# 后端
cd door/server && npm ci && npm run migrate
pm2 restart door-api
```

---

## 数据库迁移记录

| 迁移文件 | 日期 | 变更内容 |
|---|---|---|
| `20260302000001` ~ `000006` | 2026-03-02 | 初始表结构（jobs, auth, races, records, column_mappings, import_sessions） |
| `20260303000001` | 2026-03-03 | Phase 5: 抽签/审核/服装库存表 |
| `20260304000001` (auth) | 2026-03-04 | 权限模型改版 |
| `20260304000001` (phase6) | 2026-03-04 | Phase 6: lottery_results, snapshots, bib 表 |
| `20260305000001` | 2026-03-05 | org_race_permissions 表 |
| `20260307000001` | 2026-03-07 | Bib Tracking 物资追踪表 |
| `20260307000002` | 2026-03-07 | `races.lottery_mode_default` + `race_capacity.lottery_mode_override`（直通模式） |

> [!IMPORTANT]
> 每次部署后务必执行 `docker compose exec app npm run migrate`。
> 未迁移会导致接口报错（如缺少 `org_race_permissions` 表）。

---

## 超级管理员

种子脚本位于 `door/server/scripts/seed-super-admin.js`，支持幂等执行（已存在则更新）。

| 参数 | 环境变量 | 默认值 |
|------|---------|--------|
| 用户名 | `SUPER_ADMIN_USERNAME` | `Xquareliu` |
| 邮箱 | `SUPER_ADMIN_EMAIL` | `admin@platform.local` |
| 密码 | `SUPER_ADMIN_PASSWORD` | `lk930813` |

```bash
# 使用默认凭证
docker compose exec app node scripts/seed-super-admin.js

# 或通过环境变量覆盖
docker compose exec \
  -e SUPER_ADMIN_USERNAME=NewAdmin \
  -e SUPER_ADMIN_PASSWORD=NewPass123 \
  app node scripts/seed-super-admin.js
```

---

## 工具门户入口

首页（`/`）展示工具卡片列表，数据来源于 `src/stores/toolsStore.js`：

| 工具 | 路径 | 说明 |
|------|------|------|
| 后台管理 | `/admin` | 需要 `org_admin` 或 `super_admin` 角色 |
| 扫码功能 | `/scan` | 需要登录，未登录时重定向到 `/scan/login` |
| 3D 机械计时钟 | `/tool/mechanical-clock-3d` | 公开访问 |
| 应用下载 | `/tool/app-download` | 公开访问 |

---

## 管理后台操作流程

权限模型：`super_admin` > `org_admin` > `race_editor` > `race_viewer`

### 1. 超管初始化

1. 使用超管账号登录 `/admin`
2. "机构管理"创建机构
3. "用户管理"/"成员管理"创建用户并分配角色
4. 非 `super_admin` 必须绑定机构

### 2. 赛事管理

1. 超管在"赛事管理"创建赛事（需选择所属机构）
2. "机构赛事授权"为机构分配赛事（`editor`/`viewer`）
3. "赛事授权"为成员分配赛事权限

### 3. 访问控制

| 角色 | 权限 |
|------|------|
| `super_admin` | 全平台管理，跨机构 |
| `org_admin` | 管理本机构成员，按机构授权级别读写赛事 |
| `race_editor` | 仅访问被分配赛事，可写 |
| `race_viewer` | 仅访问被分配赛事，只读 |

### 4. 常见问题

| 问题 | 解决 |
|------|------|
| 缺少 `org_race_permissions` 表 | 执行 `npm run migrate` |
| 登录报 Network Error | 检查 `.env` 中 `CORS_ORIGIN` 是否正确（不要带端口号） |
| 保存时服务器内部错误 | 检查后端日志 + 迁移状态 |
| 超管看不到某机构数据 | 在侧边栏切换目标机构 |

---

## 编码约定

- 所有源码 `UTF-8`（无 BOM）+ `LF`
- 提交前：`npm run check:encoding`

---

## 本地开发

```bash
# 后端
cd door/server && npm ci && npm run dev

# 门户前端
cd door && npm ci && npm run dev

# 工具前端
cd tool && npm ci && npm run dev
```

## 防止"自动拉起"导致冲突

1. `docker compose up` 只能在 `door/server/` 执行
2. `door` Vite 默认 `open: true`，不需要时用 `npm run dev -- --open false`
3. `tool` Electron 联调用 `npm run electron:dev`
4. 本机 PostgreSQL 占用 `5432` 时需先释放或修改映射

## 常用地址

| 环境 | 地址 |
|------|------|
| 门户（dev） | `http://localhost:5173` |
| 工具（dev） | `http://localhost:5174` |
| API（直连） | `http://localhost:3001` |
| 网关（Docker） | `http://localhost`（端口 80） |
| 云端（IP） | `http://47.251.107.41` |
| 云端（域名） | `http://www.xquareliu.com` |

## 参考

- 后端详细说明：[door/server/README.md](./server/README.md)
- 工具详细说明：[tool/README.md](../tool/README.md)
