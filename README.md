# DOOR 系统 README（端口统一版）

本仓库中与 DOOR 相关的主要目录：

- `door/`：门户前端（Vite + React）
- `door/server/`：后端 API（Express + PostgreSQL + Knex）
- `tool/`：本地数据管理工具（Vite + Electron）

## 端口基线（当前统一）

| 服务 | 默认端口 | 说明 |
|---|---:|---|
| DOOR 后端 API | `3001` | `http://localhost:3001/api/...` |
| DOOR 前端 dev | `5173` | Vite dev server，`/api` 代理到 `3001` |
| TOOL 前端 dev | `5174` | Vite dev server，`/api` 代理到 `3001` |
| Nginx 网关 | `8080` | Docker 部署入口，`/api` 反代到 `app:3001` |
| PostgreSQL | `5432` | Docker 映射 `5432:5432` |

说明：`15432` 已废弃，不再作为默认端口使用。

## 云端部署配置（DOOR 生产）

已确认你的 DOOR 项目部署在云服务器 `http://47.251.107.41`（阿里云），且服务器不开放 `80/443`，因此统一使用 `8080` 作为对外入口端口。

- 主入口（IP）：`http://47.251.107.41:8080`
- 域名入口（可选）：`http://www.xquareliu.com:8080`

需要确保以下配置一致：

1. 前端（`door/.env`）

```env
VITE_API_BASE_URL=http://47.251.107.41:8080/api
```

2. 后端（`door/server/.env`）

```env
PORT=3001
PUBLIC_BASE_URL=http://47.251.107.41:8080
CORS_ORIGIN=http://47.251.107.41:8080,http://www.xquareliu.com:8080
```

3. 网关（`door/server/nginx.conf`）

```nginx
listen 8080;
server_name 47.251.107.41 www.xquareliu.com;
```

4. Docker 映射（`door/server/docker-compose.yml`）

```yaml
nginx:
  ports:
    - "8080:8080"
```

## 启动方式

### 1. Docker 一体部署（推荐）

在 `door/server/` 目录执行：

```bash
cd door/server
cp .env.example .env
docker compose up -d --build
docker compose exec app npm run migrate
```

健康检查：

```bash
curl -i http://127.0.0.1:8080/api/health/ready
curl -i http://127.0.0.1:3001/api/health/ready
```

### 2. 本地开发（分进程）

后端（`door/server`）：

```bash
npm ci
npm run dev
```

门户前端（`door`）：

```bash
npm ci
npm run dev
```

工具前端（`tool`）：

```bash
npm ci
npm run dev
```

### 3. 更新与发布（生产环境）

当功能更新后（例如增加了“应用下载”和管理页面），需要更新远程环境：

#### 方法 A. 如果使用 Docker 部署（推荐）

在 `door/server` 目录重新构建镜像并重启容器：

```bash
cd door/server
docker compose up -d --build
docker compose exec app npm run migrate  # （可选）如果有需要执行的数据迁移
```

#### 方法 B. 如果使用手动部署（非 Docker 环境）

**更新并构建前端：**

```bash
cd door
npm install
npm run build
# 构建完成后，将生成的 `dist/` 目录的内容上传到目标云服务器供 Nginx 等托管
```

**更新并重启后端：**

```bash
cd door/server
npm install          # 下拉新代码后，安装可能有新增加的依赖（例如 multer 等）
npm run migrate      # 执行可能的新数据库迁移

# 使用 pm2 等工具重启应用
pm2 restart door-api # 根据 pm2 配置重启名称
```

## 编码约定（必须）

- 所有源码统一 `UTF-8`（无 BOM）+ `LF`。
- 提交前执行：

```bash
npm run check:encoding
```

Windows 本地排查乱码时建议先切换终端编码：

```powershell
chcp 65001
Get-Content .\src\api\adminApi.js -Encoding utf8
```

## 管理后台操作流程（更新版）

以下流程适用于当前权限模型（`super_admin` / `org_admin` / `race_editor` / `race_viewer`）。

### 0. 发布后先执行迁移

在 `door/server` 执行：

```bash
npm run migrate
```

如果未迁移，机构赛事授权等接口会报错（例如缺少 `org_race_permissions` 表）。

### 数据库迁移变更记录

| 迁移文件 | 日期 | 变更内容 |
|---|---|---|
| `20260302000001` ~ `000006` | 2026-03-02 | 初始表结构（jobs, auth, races, records, column_mappings, import_sessions） |
| `20260303000001` | 2026-03-03 | Phase 5: 抽签/审核/服装库存表 |
| `20260304000001` (auth) | 2026-03-04 | 权限模型改版 |
| `20260304000001` (phase6) | 2026-03-04 | Phase 6: lottery_results, snapshots, bib 表 |
| `20260305000001` | 2026-03-05 | org_race_permissions 表 |
| `20260307000001` | 2026-03-07 | Bib Tracking 物资追踪表 |
| `20260307000002` | 2026-03-07 | **新增** `races.lottery_mode_default`（赛事默认抽签/直通模式）和 `race_capacity.lottery_mode_override`（项目级模式覆盖），支持 direct（直通）模式跳过随机抽签 |

### 1. 超管初始化组织与用户

1. 使用超管账号登录 `/admin`。
2. 在“机构管理”创建机构。
3. 在“用户管理”或“成员管理”创建/调整用户角色。
4. 非 `super_admin` 用户必须绑定机构。

### 2. 超管创建并管理赛事

1. 进入“赛事管理”。
2. 超管创建赛事时必须显式选择所属机构（`orgId`）。
3. 可在同页对赛事执行编辑、删除。

### 3. 超管给机构授权赛事

1. 进入“机构赛事授权”页面。
2. 选择目标机构。
3. 勾选可见赛事并设置级别：
4. `editor`：机构管理员可写。
5. `viewer`：机构管理员只读。

### 4. 给成员分配赛事权限

1. 进入“赛事授权”页面，选择目标成员。
2. 页面展示该成员所属机构的“可见赛事池”（机构自有 + 被超管授权）。
3. 为成员勾选赛事并设置 `editor/viewer`。
4. 当机构级别为 `viewer` 时，成员不能升为 `editor`。

### 5. 访问控制规则

1. `super_admin`：全平台管理，支持跨机构管理用户与赛事。
2. `org_admin`：可管理本机构成员；对被授权赛事按机构授权级别读写。
3. `race_editor`：仅可访问被分配赛事，且可写。
4. `race_viewer`：仅可访问被分配赛事，且只读（写请求返回 `403`）。

### 6. 删除操作说明

1. 成员删除：支持在“成员管理”执行。
2. 用户删除：支持在“用户管理”执行。
3. 机构删除：仅当该机构下无用户、无赛事时允许删除。
4. 系统会阻止删除当前登录账号，并防止删除最后一个 `super_admin`。

### 7. 常见问题排查

1. 提示“数据库缺少 `org_race_permissions` 表”：未执行迁移，先跑 `npm run migrate`。
2. 保存时报“服务器内部错误”：优先检查后端日志与数据库迁移状态。
3. 超管看不到某机构数据：确认 URL 是否带了 `orgId` 查询参数，或在侧边栏机构选择器中切换目标机构。

## 防止“自动拉起”导致冲突

1. `docker compose up` 只能在 `door/server/` 执行，不要在仓库根目录误执行。  
2. `door` 的 Vite 配置默认 `open: true`，会自动打开浏览器；如不需要自动打开，可用：
   `npm run dev -- --open false`
3. `tool` 的 Electron 联调使用 `npm run electron:dev`，内部会先等 `5174` 可用再拉起 Electron。  
4. 如果本机已有 PostgreSQL 占用 `5432`，请先释放端口，或修改 `door/server/docker-compose.yml` 的映射端口并同步更新相关文档与环境变量。  
5. `VITE_API_BASE_URL` 传“根地址”，不要手动追加 `/api`（代码会自动处理）。

## 常用地址

- 门户（dev）：`http://localhost:5173`
- 工具（dev）：`http://localhost:5174`
- API（直连）：`http://localhost:3001`
- 网关（Docker）：`http://localhost:8080`
- DOOR 云端入口（IP）：`http://47.251.107.41:8080`
- DOOR 云端入口（域名）：`http://www.xquareliu.com:8080`

## 参考

- 后端详细说明：[door/server/README.md](./server/README.md)
- 工具详细说明：[tool/README.md](../tool/README.md)
