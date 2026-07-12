# 中奥致远赛事管理系统部署指南

中奥致远赛事管理系统是一个赛事运营管理平台，包含前端（Vite + React）和后端（Express.js + PostgreSQL）。

---

## 目录

- [环境要求](#环境要求)
- [本地测试环境](#本地测试环境)
- [远程生产部署](#远程生产部署)
- [常用操作](#常用操作)
- [故障排查](#故障排查)

---

## 环境要求

| 组件 | 版本要求 |
|------|----------|
| Node.js | >= 18.x |
| npm | >= 9.x |
| PostgreSQL | >= 14.x (本地开发可选，可用 Docker) |
| Docker | >= 24.x (推荐) |
| Docker Compose | >= 2.x |

---

## 本地测试环境

### 目录职责与启动边界

`door/` 和 `door/server/` 不是同一个运行根目录，命令不能混用：

| 目录 | 职责 | 只应在这里执行的命令 |
|------|------|----------------------|
| `door/` | 前端工程（Vite + React） | `npm run dev`、`npm run build` |
| `door/server/` | 后端工程（Express + Worker + Docker Compose） | `npm run dev`、`npm run worker`、`npm run migrate`、`docker compose ...` |

> [!IMPORTANT]
> - `npm run dev` 在 `door/` 中启动的是前端 Vite 开发服务，默认端口 `5173`
> - `npm run dev` 在 `door/server/` 中启动的是后端 API 服务，默认端口 `3001`
> - `npm run worker` 只能在 `door/server/` 中执行
> - `docker compose` 只能在 `door/server/` 中执行，因为 compose 文件在这里

### 前端本地 API 配置

前端开发时，推荐使用 `door/.env.local` 覆盖 API 地址，让本地页面通过 Vite 代理访问本地后端：

```env
VITE_API_BASE_URL=/api
```

说明：

- `door/.env` 可以保留云端或正式环境地址
- `door/.env.local` 只用于本地开发，优先级更高
- 如果把 `VITE_API_BASE_URL` 写成线上地址，例如 `https://door.example.com/api`，本地前端会直接请求线上接口，不会走本地 `5173 -> 3001` 代理
- 因此做本地联调时，应优先检查 `door/.env.local` 是否为 `/api`

### Docker 镜像与 Compose 服务

容器名由 Compose 项目名和服务名生成，不再声明全局 `container_name`，多个 worktree 可以并行运行：

| 服务 | 镜像名称 | Compose 服务名 |
|------|----------|----------|
| PostgreSQL | `postgres:16-alpine` (公共镜像) | `postgres` |
| Redis | `redis:7-alpine` (公共镜像) | `redis` |
| API 服务 | `arcspro-server-app:latest` (本地构建) | `app` |
| Worker | `arcspro-server-app:latest` (复用) | `worker` |
| Nginx | `nginx:alpine` (公共镜像) | `nginx` |
| 自动备份 | `arcspro-server-app:latest` (复用) | `pg-backup` |

> [!IMPORTANT]
> `app` 和 `worker` 共用同一个镜像 `arcspro-server-app:latest`，仅启动命令不同。

### 本地环境配置文件

本地测试环境使用以下配置文件自动适配：

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 基础配置（生产/本地共用） |
| `docker-compose.override.yml` | 本地环境覆盖配置（自动合并） |
| `nginx.local.conf` | 本地 HTTP 配置（无 SSL） |
| `nginx.conf` | 生产 HTTPS 配置 |

> [!NOTE]
> `docker-compose.override.yml` 会在执行 `docker compose` 命令时自动与 `docker-compose.yml` 合并。
> 生产部署时删除或重命名此文件即可使用 HTTPS 配置。

### 端口说明

| 服务 | 默认端口 | 说明 |
|---|---:|---|
| 后端 API | `3001` | `http://localhost:3001/api/...` |
| 前端 dev | `5173` | Vite dev server，`/api` 代理到 `3001` |
| PostgreSQL | `5432` | Docker 映射 `5432:5432` |
| Nginx 网关 | `80` | 本地 HTTP 入口 |

---

### 方式一：Docker Compose（推荐）

适合一键拉起完整环境，包括数据库、缓存、后端服务。

#### 0. 前置条件

- **Docker Desktop** 已启动并完全就绪（系统托盘图标稳定显示）
- 如有其他 Node 进程占用文件，先关闭后再执行

```bash
# 检查 Docker 是否就绪
docker info
```

#### 1. 进入后端目录

```bash
cd door/server
```

#### 2. 配置环境变量

```bash
cp .env.example .env
```

本地测试环境可使用默认值：

```env
POSTGRES_PASSWORD=door_dev
JWT_SECRET=dev_secret
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost
```

#### 3. 构建前端

```bash
# 回到项目根目录
cd ..

# 安装依赖（如有锁定错误，先关闭其他 Node 进程）
npm ci

# 构建生产版本
npm run build

# 返回后端目录
cd server
```

#### 4. 启动所有服务

```bash
docker compose up -d --build
```

启动后的服务可用 `docker compose ps` 查看：`postgres`、`redis`、`app`、`worker`、`pg-backup`、`nginx`。

#### 5. 确认数据库迁移

```bash
docker compose ps -a migrate
# 预期：migrate 为 Exited (0)，app/worker 随后才会启动
```

`docker compose up` 会先运行一次性 `migrate` 服务；迁移失败时 app 和 worker 不会启动。

#### 6. 初始化超级管理员

```bash
docker compose exec app node scripts/seed-super-admin.js
# 默认账号: Xquareliu / lk930813
```

> [!IMPORTANT]
> 超级管理员账号不是只看 `.env` 就会自动生效，`users` 表中的实际登录账号以最近一次执行 `scripts/seed-super-admin.js` 的结果为准。
> 如果你修改了 `door/server/.env` 里的 `SUPER_ADMIN_USERNAME`、`SUPER_ADMIN_EMAIL` 或 `SUPER_ADMIN_PASSWORD`，需要重新执行一次 seed，数据库里的超管账号和密码才会同步更新。

#### 7. 访问应用

- 前端页面：http://localhost
- API 服务：http://localhost/api
- 健康检查：http://localhost/api/health/ready

---

### 方式二：本地开发模式（前后端分离）

适合开发调试，支持热重载。

#### 1. 启动后端服务

```bash
cd door/server

# 安装依赖
npm ci

# 配置环境变量
cp .env.example .env

# 需要本地 PostgreSQL 或修改 .env 指向远程数据库
# DATABASE_URL=postgres://door:door_dev@localhost:5432/door

# 执行迁移
npm run migrate

# 如果修改过 SUPER_ADMIN_*，同步更新本地超管账号
node --env-file-if-exists=.env scripts/seed-super-admin.js

# 启动开发服务（支持热重载）
npm run dev
```

后端运行在 http://localhost:3001

#### 2. 启动前端开发服务（新终端）

```bash
cd door

# 安装依赖
npm ci

# 建议在 door/.env.local 中使用本地代理
# VITE_API_BASE_URL=/api

# 启动 Vite 开发服务
npm run dev
```

前端运行在 http://localhost:5173

#### 3. 启动 Worker（第三个终端，建议同时开启）

```bash
cd door/server

# 启动后台任务处理
npm run worker
```

Worker 用于处理导入提交、清洗流水线、抽签等后台任务。本地联调这些功能时建议始终保持开启。

#### 4. 访问应用

- 前端页面：http://localhost:5173
- API 代理：Vite 会自动代理 `/api` 到 `http://localhost:3001`

#### 5. 本地开发推荐启动顺序

```bash
# 终端 1：后端 API
cd door/server
npm run dev

# 终端 2：Worker
cd door/server
npm run worker

# 终端 3：前端
cd door
npm run dev
```

如果页面能打开但登录、导入、抽签、排号等功能仍然异常，优先检查：

1. 前端是否真的从 `door/` 启动
2. 后端和 Worker 是否真的从 `door/server/` 启动
3. `door/.env.local` 是否使用了 `VITE_API_BASE_URL=/api`
4. 本地后端健康检查是否正常：`http://localhost:3001/api/health/ready`

---

### 仅启动数据库（用于本地开发）

如果只想用 Docker 管理数据库，后端跑在本地：

```bash
cd door/server

# 仅启动 postgres 和 redis
docker compose up -d postgres redis

# 本地连接数据库
# DATABASE_URL=postgres://door:door_dev@localhost:5432/door
```

---

### 本地开发常用地址

| 环境 | 地址 |
|------|------|
| 中奥致远赛事管理系统（dev） | `http://localhost:5173` |
| API（直连） | `http://localhost:3001` |
| 网关（Docker） | `http://localhost` |

---

## 远程生产部署

### 云端部署配置

生产域名和证书由环境变量提供。下面用 `door.example.com` 和文档专用 IP
`203.0.113.10` 演示；部署时必须替换成实际地址。

---

### 1. 服务器准备

确保服务器已安装：
- Docker >= 24.x
- Docker Compose >= 2.x
- Git

```bash
# 克隆代码
git clone <repository-url> door
cd door/server
```

---

### 2. 配置生产环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填写生产配置：

```env
# 数据库密码（必须修改）
POSTGRES_PASSWORD=your_secure_password_here

# JWT 密钥（必须修改，建议 32 位以上随机字符串）
JWT_SECRET=your_jwt_secret_here

# 运行环境
NODE_ENV=production
PORT=3001

# 公网访问地址
PUBLIC_BASE_URL=https://door.example.com
FRONTEND_URL=https://door.example.com

# CORS 允许的完整 origin（逗号分隔；非默认端口必须保留端口号）
CORS_ORIGIN=https://door.example.com,http://203.0.113.10

# Nginx 模板变量
NGINX_SERVER_NAME=door.example.com
NGINX_SSL_CERT=door.example.com.pem
NGINX_SSL_KEY=door.example.com.key

# 禁止公开注册
DISABLE_REGISTRATION=true

# 备份目录配置
HOST_BACKUP_DIR=/var/backups/door
BACKUP_DIR=/backups
BACKUP_RETENTION_COUNT=10
RESTORE_UPLOAD_DIR=/backups/uploads

# Redis 连接
REDIS_URL=redis://redis:6379

# 可选：DashScope API（报告生成）
DASHSCOPE_API_KEY=your_dashscope_api_key
DASHSCOPE_BASE_URL=https://coding.dashscope.aliyuncs.com/v1
```

> [!CAUTION]
> `CORS_ORIGIN` 必须和浏览器地址栏的 origin 完全一致。例如页面从
> `https://door.example.com:8443` 打开，就应填写 `https://door.example.com:8443`。

---

### 3. 初始化备份目录

```bash
sudo mkdir -p /var/backups/door/uploads
sudo chown -R 1000:1000 /var/backups/door
```

---

### 4. 配置 SSL 证书

证书文件存放在服务器 `/etc/nginx/ssl/` 目录：
- `door.example.com.pem` — 证书文件
- `door.example.com.key` — 私钥文件

```bash
sudo mkdir -p /etc/nginx/ssl
sudo cp your-cert.pem /etc/nginx/ssl/door.example.com.pem
sudo cp your-key.pem /etc/nginx/ssl/door.example.com.key
```

> [!NOTE]
> 阿里云免费证书有效期 1 年，到期前需在控制台重新申请并替换文件。

---

### 5. Nginx 网关配置

`door/server/nginx.conf` 关键配置：

```nginx
# HTTP → HTTPS 301 重定向
listen 80;
return 301 https://$host$request_uri;

# HTTPS 主配置
listen 443 ssl;
server_name ${NGINX_SERVER_NAME};
ssl_certificate     /etc/nginx/ssl/${NGINX_SSL_CERT};
ssl_certificate_key /etc/nginx/ssl/${NGINX_SSL_KEY};
```

Docker 端口映射（`docker-compose.yml`）：

```yaml
nginx:
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx.conf:/etc/nginx/templates/default.conf.template:ro
    - ../dist:/usr/share/nginx/html:ro
    - /etc/nginx/ssl:/etc/nginx/ssl:ro
```

---

### 6. 首次部署流程

```bash
cd door/server

# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 设置密码等

# 2. 构建前端（在 door/ 目录）
cd ..
npm ci
npm run build
cd server

# 3. 启动所有服务
docker compose up -d --build

# 4. 执行数据库迁移
docker compose run --rm migrate

# 5. 创建超级管理员
docker compose exec app node scripts/seed-super-admin.js
```

健康检查：

```bash
curl https://door.example.com/api/health/ready
# 期望: {"status":"ok","database":"connected"}
```

---

### 7. 生产更新流程

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
docker compose run --rm migrate

# 5. 验证
curl https://door.example.com/api/health/ready
```

---

### 8. 配置自动备份（可选）

在服务器 crontab 中添加：

```bash
sudo crontab -e
```

```cron
# 每天凌晨 3:30 自动备份
30 3 * * * cd /path/to/door/server && docker compose exec -T app bash scripts/run-postgres-backup.sh --trigger cron >> /var/log/door-backup.log 2>&1
```

---

## 常用操作

### 查看服务状态

```bash
# 使用 docker compose（推荐）
docker compose ps
docker compose logs -f app

docker compose logs -f worker
docker compose logs -f pg-backup
```

### 进入容器调试

```bash
# 使用 docker compose
docker compose exec app sh
docker compose exec postgres psql -U door -d door

```

### 手动备份数据库

```bash
docker compose exec app bash scripts/run-postgres-backup.sh --trigger manual
```

### 重启服务

```bash
# 使用 docker compose
docker compose restart app
docker compose restart nginx

```

### 仅重启服务（不重新构建）

```bash
# 修改了环境变量（如 CORS_ORIGIN）后仅需重启：
docker compose restart app worker
```

### 停止所有服务

```bash
docker compose down
```

---

## 故障排查

### 1. 数据库连接失败 `ECONNREFUSED`

**原因：** PostgreSQL 未启动或端口不对。

**解决：**
```bash
# 检查 postgres 容器状态
docker compose ps postgres

# 重启 postgres
docker compose restart postgres
```

### 2. 迁移失败 `relation "xxx" does not exist`

**原因：** 数据库迁移未执行。

**解决：**
```bash
docker compose run --rm migrate
```

### 3. 前端页面空白或 404

**原因：** 前端未构建或 dist 目录为空。

**解决：**
```bash
cd door
npm run build
# 确保 dist 目录存在且有内容
ls -la dist/
```

### 4. 登录报 Network Error

**原因：** CORS 配置不正确。

**解决：** 检查 `.env` 中 `CORS_ORIGIN` 是否正确（不要带端口号）。

### 5. 深层链接 404（如 `/app`、`/admin`）

**原因：** Nginx 未配置 SPA fallback。

**解决：** 确保 `nginx.conf` 包含 `try_files $uri $uri/ /index.html`。

### 6. 忘记管理员密码

**解决：** 重新运行超级管理员初始化脚本：

```bash
docker compose exec \
  -e SUPER_ADMIN_PASSWORD="new_password" \
  -e SUPER_ADMIN_USERNAME="your_admin" \
  -e SUPER_ADMIN_EMAIL="admin@your-domain.com" \
  app node scripts/seed-super-admin.js
```

### 7. Docker 命令报 `failed to connect to the docker API`

**原因：** Docker Desktop 未完全启动。

**解决：**
1. 确保 Docker Desktop 已启动（系统托盘图标稳定显示）
2. 等待几秒后重试
3. 验证：`docker info` 能正常输出

### 8. npm ci 报 `EPERM: operation not permitted`

**原因：** 其他 Node 进程占用文件。

**解决：**
```bash
# 关闭所有 Node 进程
taskkill //F //IM node.exe

# 重新安装
npm ci
```

### 9. nginx 容器启动后立即退出

**原因：** 本地环境没有 SSL 证书，但使用了生产配置。

**解决：** 确保 `docker-compose.override.yml` 文件存在，它会自动使用 `nginx.local.conf`（HTTP 配置）。

```bash
# 检查文件是否存在
ls docker-compose.override.yml nginx.local.conf

# 重新启动 nginx
docker compose up -d nginx
```

---

## 四层入口

中奥致远赛事管理系统采用 `public + app + ops + admin` 四层入口。

| 入口层 | 路径 | 说明 |
|------|------|------|
| 公开层 | `/login`、`/forgot-password`、`/reset-password/:token`、`/download` | 登录、下载中心 |
| 应用层 | `/app`、`/app/reimbursements`、`/app/settings` | 个人工作台、我的报销、我的设置 |
| 执行端 | `/ops`、`/ops/scan`、`/ops/bibs/pickup` | 扫码、发放、号牌领取 |
| 后台 | `/admin/*` | 组织治理、配置、审批、分析 |

默认登录跳转规则：

- `super_admin`、`org_admin` 进入 `/admin`
- `race_admin` 进入 `/ops`
- `user`、普通用户进入 `/app`

---

## 权限模型

| 角色 | 能力范围 |
|------|----------|
| `super_admin` | 全平台管理（机构、用户、赛事） |
| `org_admin` | 本机构全部赛事与成员管理 |
| `race_admin` | 被授权赛事可读写 |
| `user` | 被授权赛事只读 |

---

## 目录结构

```
door/
├── src/                    # 前端源码
├── dist/                   # 前端构建产物（nginx 挂载）
├── server/
│   ├── src/               # 后端源码
│   ├── docker-compose.yml # Docker 编排文件
│   ├── Dockerfile         # 后端镜像构建
│   ├── nginx.conf         # Nginx 配置
│   ├── .env.example       # 环境变量示例
│   └── knexfile.js        # 数据库迁移配置
├── package.json           # 前端依赖
└── vite.config.js         # Vite 配置
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
| `20260324000001` | 2026-03-24 | password_reset_tokens 表（忘记密码功能） |

> [!IMPORTANT]
> `docker compose up` 会先执行一次性 `migrate` 服务。发布后用 `docker compose ps -a migrate` 确认退出码为 0；需要手工重跑时使用 `docker compose run --rm migrate`。

---

## 参考

- 后端详细说明：[door/server/README.md](./server/README.md)
- 备份恢复详细说明：[door/server/docs/backup-restore.md](./server/docs/backup-restore.md)
