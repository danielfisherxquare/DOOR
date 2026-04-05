# DOOR Server README（端口统一版）

## Docker 镜像与容器命名

为避免与其他项目的 Docker 资源冲突，所有容器均使用 `door-` 前缀：

| 服务 | 镜像名称 | 容器名称 | 说明 |
|------|----------|----------|------|
| PostgreSQL | `postgres:16-alpine` | `door-postgres` | 主数据库 |
| Redis | `redis:7-alpine` | `door-redis` | 缓存/限流 |
| API 服务 | `door-server-app:latest` | `door-app` | Express API |
| Worker | `door-server-app:latest` | `door-worker` | 后台任务 |
| Nginx | `nginx:alpine` | `door-nginx` | SSL 网关 |
| 自动备份 | `postgres:16-alpine` | `door-pg-backup` | 每6小时 pg_dump |

> `app` 和 `worker` 共用同一个镜像 `door-server-app:latest`，仅启动命令不同。
> `pg-backup` 是轻量级 sidecar，复用 postgres 镜像仅执行 `pg_dump`。

## 本地环境配置文件

本地测试环境使用以下配置文件自动适配（无需 SSL 证书）：

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 基础配置（生产/本地共用） |
| `docker-compose.override.yml` | 本地环境覆盖配置（自动合并） |
| `nginx.local.conf` | 本地 HTTP 配置 |
| `nginx.conf` | 生产 HTTPS 配置 |

> `docker-compose.override.yml` 在执行 `docker compose` 命令时自动合并。
> 生产部署时删除此文件即可使用 HTTPS 配置。

## 服务与端口

- API 服务：`3001`
- PostgreSQL：`5432`
- Nginx（在 `docker-compose.yml` 中）：`80 -> app:3001`

默认数据库连接（代码兜底）：

- `postgres://door:door_dev@localhost:5432/door`

说明：旧端口 `15432` 已废弃。

## 目录内启动规则

所有 Docker 命令必须在 `door/server/` 目录执行。

```bash
cd door/server
```

## 本地运行（不走 Docker）

```bash
npm ci
cp .env.example .env
npm run migrate
npm run dev
```

健康检查：

```bash
curl http://localhost:3001/api/health/live
curl http://localhost:3001/api/health/ready
```

## Docker 运行（推荐）

```bash
cd door/server
cp .env.example .env
docker compose up -d --build
docker compose exec app npm run migrate
```

健康检查：

```bash
curl http://localhost/api/health/ready
curl http://localhost:3001/api/health/ready
```

## ⚠️ 数据保护机制

### 数据持久化（防止 `docker compose down -v` 误删）

PostgreSQL 数据**绑定挂载到宿主机目录**，而非 Docker 匿名卷：

```yaml
# docker-compose.yml
postgres:
  volumes:
    - ${PGDATA_HOST_DIR:-./pgdata}:/var/lib/postgresql/data
```

- 数据存储位置：`server/pgdata/`（宿主机）
- 执行 `docker compose down -v` **不会删除数据**
- 若需彻底清空数据库，需手动 `rm -rf pgdata/`

### 安全操作规范

| 操作 | 命令 | 数据影响 |
|------|------|----------|
| 停止服务 | `docker compose down` | ✅ 数据安全 |
| 停止+删卷 | `docker compose down -v` | ✅ 数据安全（已绑定挂载） |
| 重建服务 | `docker compose up -d --build` | ✅ 数据安全 |
| 删除数据目录 | `rm -rf pgdata/` | ❌ **数据丢失** |

### 自动备份 Sidecar

`pg-backup` 容器自动运行，无需额外配置：

- **频率**：每 6 小时执行一次 `pg_dump`
- **保留**：最近 20 份，自动清理旧备份
- **存储**：`server/backups/door_auto_YYYYMMDD_HHMMSS.sql`
- **日志**：`docker logs door-pg-backup`

### 手动立即备份

```bash
# 方式一：通过备份容器内的 pg_dump
docker exec door-postgres pg_dump -U door -d door --no-owner --no-acl > backups/manual_backup.sql

# 方式二：通过 app 容器内的脚本
docker compose exec -T app bash scripts/run-postgres-backup.sh --trigger manual
```

### 从备份恢复

```bash
# 1. 停止应用层（保留数据库运行）
docker compose stop app worker

# 2. 恢复备份
Get-Content backups/door_auto_XXXXXXXX_XXXXXX.sql | docker exec -i door-postgres psql -U door -d door
# Linux: cat backups/door_auto_XXXXXXXX_XXXXXX.sql | docker exec -i door-postgres psql -U door -d door

# 3. 重启应用层
docker compose up -d app worker

# 4. 验证
curl http://localhost:3001/api/health/ready
```

## 超级管理员初始化

```bash
docker compose exec \
  -e SUPER_ADMIN_PASSWORD="your_password" \
  -e SUPER_ADMIN_USERNAME="superadmin" \
  -e SUPER_ADMIN_EMAIL="admin@platform.local" \
  app node scripts/seed-super-admin.js
```

## 权限模型（简表）

| 角色 | 能力范围 |
|---|---|
| `super_admin` | 全平台（机构、用户、赛事） |
| `org_admin` | 本机构全部赛事与成员管理 |
| `race_admin` | 被授权赛事可读写 |
| `user` | 被授权赛事只读 |

## 重大更新部署说明

### Event Normalization (2026-03-07 更新)

本次更新将所有历史项目名称统一规范化为“马拉松”与“半程马拉松”。部署此版本时必须严格按以下顺序执行数据库结构与数据清洗迁移，以防止数据读取中断：

1. **执行数据清洗迁移**（清洗 `records.event` 字段和 `races.events` JSONB 字段）：
   ```bash
   # 本地模式
   npm run migrate

   # Docker 模式
   docker compose exec app npm run migrate
   ```
2. **前后端同时重启部署**（前后端的 Event Tools 函数已解耦独立，但通信枚举已严格统一，必须一同上线以免 UI 异常）。

### Schedule Management (2026-03-09 更新)

本次引入了全平台的行程与任务管理功能（包含大屏里程碑提醒和管理后台 OmniOutliner 视图）。涉及新表的前置创建，未执行迁移将引发 `Project not found` 或类似外键依赖的报错。

1. **执行建表迁移**（新增 `projects` 与 `project_tasks` 关联表）：
   ```bash
   # 本地模式
   npm run migrate

   # Docker 模式
   docker compose exec app npm run migrate
   ```
2. **验证创建**：
   在执行后，管理后台“项目计划”菜单应能正常打开并支持保存。

## 常见问题

1. `ECONNREFUSED 127.0.0.1:15432`  
原因：仍在使用旧端口配置。  
处理：改为 `5432`，并检查 `DATABASE_URL` 是否覆盖了默认值。

2. `database "door_test" does not exist`（跑测试时）  
原因：测试库未创建。  
处理：先创建 `door_test`，再执行 `node --test`。

3. `Missing orgId for super_admin`  
原因：访问 `/api/org/*` 时超管未提供 `orgId`。  
处理：请求参数追加 `?orgId=<机构ID>`。
---

## 数据库备份与恢复

### 备份体系总览

| 层级 | 方式 | 频率 | 保留 | 位置 |
|------|------|------|------|------|
| **L1 自动** | `pg-backup` sidecar 容器 | 每 6 小时 | 最近 20 份 | `server/backups/door_auto_*.sql` |
| **L2 手动** | `pg_dump` 或脚本 | 按需 | 不限 | `server/backups/` |
| **L3 后台** | Web 管理界面 | 按需 | 可配置 | `/admin/db-backups` |

### 目录与挂载

```
server/
├── pgdata/          ← PostgreSQL 数据文件（绑定挂载，不入 Git）
├── backups/         ← 所有备份文件（不入 Git）
│   ├── door_auto_20260405_143425.sql    ← 自动备份
│   ├── manual_backup.sql                ← 手动备份
│   └── uploads/                         ← Web 上传恢复的临时目录
```

### 环境变量（可选覆盖）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PGDATA_HOST_DIR` | `./pgdata` | PostgreSQL 数据宿主机路径 |
| `HOST_BACKUP_DIR` | `./backups` | 备份文件宿主机路径 |
| `BACKUP_DIR` | `/backups` | 容器内备份路径 |
| `BACKUP_RETENTION_COUNT` | `10` | Web 后台保留份数 |

### 自动备份（L1）

`pg-backup` sidecar 随 `docker compose up -d` 自动启动，无需额外配置。

```bash
# 查看备份日志
docker logs door-pg-backup

# 查看已有备份
ls -lht server/backups/door_auto_*.sql
```

### 手动备份（L2）

```bash
# 方式一：直接 pg_dump
docker exec door-postgres pg_dump -U door -d door --no-owner --no-acl > backups/manual_$(date +%Y%m%d).sql

# 方式二：通过 app 容器脚本
docker compose exec -T app bash scripts/run-postgres-backup.sh --trigger manual
```

### Web 后台（L3）

- 路径：`/admin/db-backups`（仅 `super_admin`）
- 支持：查看列表、生成备份、下载、上传恢复

### 恢复流程

```bash
# 1. 停应用层
docker compose stop app worker

# 2. 恢复（Windows PowerShell）
Get-Content backups/door_auto_XXXXXXXX_XXXXXX.sql | docker exec -i door-postgres psql -U door -d door

# 2. 恢复（Linux/macOS）
cat backups/door_auto_XXXXXXXX_XXXXXX.sql | docker exec -i door-postgres psql -U door -d door

# 3. 重启
docker compose up -d app worker

# 4. 验证
curl http://localhost:3001/api/health/ready
```

### 恢复规则

- Web 后台恢复只支持 `.sql.gz`，目标库命名 `door_restore_YYYYMMDD_HHMMSS`
- 命令行恢复支持 `.sql`，可直接覆盖生产库
- 恢复成功后仍需人工校验核心表数据量

详细说明见 `docs/backup-restore.md`。
