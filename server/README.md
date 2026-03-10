# DOOR Server README（端口统一版）

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
| `race_editor` | 被授权赛事可读写 |
| `race_viewer` | 被授权赛事只读 |

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
