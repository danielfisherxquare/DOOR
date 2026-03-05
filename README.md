# DOOR 部署文档（单仓库）

本仓库在 `door/` 目录下包含两套工程，请务必区分：

- `door/`：前端门户（Vite + React），构建产物在 `door/dist/`
- `door/server/`：后端服务（Express + Postgres + Knex），通过 Docker Compose 部署

后端部署命令必须在 `door/server/` 下执行，不要在 `door/` 根目录执行后端相关命令。

## 生产架构（推荐）

1. 用户访问：`http(s)://<domain>:8080`
2. Nginx（容器）：
   - `/`：静态文件（挂载 `../dist`）
   - `/api/*`：反代到 `app:3001`
3. Node 后端：`app:3001`
4. Postgres：`postgres:5432`

对应配置文件：

- `door/server/docker-compose.yml`
- `door/server/nginx.conf`

## 首次部署（Docker Compose）

在服务器上执行（建议在 `door/server/`）：

### 1. 初始化后端环境变量

```bash
cd door/server
cp .env.example .env
# 编辑 .env：至少设置 POSTGRES_PASSWORD / JWT_SECRET / NODE_ENV
# 可选：CORS_ORIGIN / DISABLE_REGISTRATION
```

说明：

- `CORS_ORIGIN` 支持逗号分隔多 origin，例如 `https://a.com,http://localhost:5173`
- `DISABLE_REGISTRATION=true` 建议在生产关闭公开注册

### 2. 构建前端（生成 door/dist）

```bash
cd door
npm ci
npm run build
```

### 3. 启动后端 + 数据库 + Nginx

```bash
cd door/server
docker compose up -d --build
```

### 4. 运行数据库迁移

```bash
docker compose exec app npm run migrate
```

### 5. 创建或更新超级管理员（平台超管）

平台超管的特点：`org_id = NULL`，角色为 `super_admin`。

```bash
# 必填: SUPER_ADMIN_PASSWORD
docker compose exec \
  -e SUPER_ADMIN_PASSWORD="your_password" \
  -e SUPER_ADMIN_USERNAME="superadmin" \
  -e SUPER_ADMIN_EMAIL="admin@platform.local" \
  app node scripts/seed-super-admin.js
```

### 6. 验证健康检查

```bash
curl -i http://127.0.0.1:8080/api/health/ready
curl -i http://127.0.0.1:3001/api/health/ready
```

期望：HTTP 200，且包含 `{"status":"ok","database":"connected"}`。

## 常规更新

```bash
cd door/server
git pull
docker compose up -d --build
docker compose exec app npm run migrate
```

如果前端也更新了，记得重新构建 `door/dist/`（见“构建前端”步骤）。

## 回滚（基于备份）

```bash
cd door/server
bash scripts/backup-postgres.sh

# 回滚时：
docker compose stop app worker
bash scripts/restore-postgres.sh backups/door_backup_YYYYMMDD_HHMMSS.sql
git checkout <previous-tag-or-commit>
docker compose up -d --build app worker nginx
```

## 登录与权限排查

### 超管无法登录（优先）

后端提供诊断脚本，可在容器内查看迁移状态、`users` 关键字段是否齐全、以及是否存在重复的“平台用户”记录：

```bash
cd door/server
docker compose exec app node scripts/diagnose-auth.js
```

常见原因：

- 迁移没跑全：尤其是 `20260304000001_auth_permission_overhaul.js`（角色枚举、`org_id` nullable、登录安全字段等）
- seed 重复导致 `org_id = NULL` 的平台用户重复，从而登录命中非预期记录
- 账号被锁定（多次失败登录）或被禁用（`status = disabled`）

### 门户登录后白屏

优先查看浏览器 Console 的第一条报错，以及 Network 里 `/api/auth/me` 是否 401 循环或 5xx。

## tool 系统对接 door/server

推荐让 `tool` 走与生产一致的入口（Nginx 8080），避免直连 `3001` 带来的 CORS 问题：

- 推荐：`http://<domain>:8080`（前端 + API 都经 Nginx）
- 直连 API（临时）：`http://<host>:3001`（需要正确配置 `CORS_ORIGIN`）

注意：`tool` 的 `VITE_API_BASE_URL` 建议配置成后端“根地址”（例如 `http://47.251.107.41:3001`），不要在末尾再加 `/api`。

## 端口建议

生产建议：

- 对外：`22`, `80/443`, `8080`
- 仅内网：`3001`, `5432`

不应对外暴露：

- `5173`（Vite dev）
- `5432`（数据库）

## 参考

- 后端部署与命令：`door/server/docs/deployment.md`
- 后端权限模型与角色说明：`door/server/README.md`
