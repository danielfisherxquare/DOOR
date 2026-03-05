# DOOR Server 部署指南（端口统一版）

## 端口标准

- API：`3001`
- PostgreSQL：`5432`
- Nginx 网关：`8080`（反代到 `app:3001`）

说明：`15432` 已废弃。

## 1. 首次部署

```bash
# 1) 获取代码并进入后端目录
git clone <repo>
cd door/server

# 2) 准备环境变量
cp .env.example .env

# 3) 启动服务
docker compose up -d --build

# 4) 执行迁移
docker compose exec app npm run migrate

# 5) 初始化超级管理员（首次必做）
docker compose exec \
  -e SUPER_ADMIN_PASSWORD="your_password" \
  -e SUPER_ADMIN_USERNAME="superadmin" \
  -e SUPER_ADMIN_EMAIL="admin@platform.local" \
  app node scripts/seed-super-admin.js
```

健康检查：

```bash
curl http://localhost:3001/api/health/live
curl http://localhost:3001/api/health/ready
curl http://localhost:8080/api/health/ready
```

## 2. 常规更新

```bash
cd door/server

# 可选：先备份
bash scripts/backup-postgres.sh

# 拉取更新
git pull origin main

# 重建并启动
docker compose up -d --build

# 迁移
docker compose exec app npm run migrate

# 验证
curl http://localhost:3001/api/health/ready
```

## 3. 回滚流程

```bash
cd door/server

# 1) 停止计算服务
docker compose stop app worker

# 2) 恢复数据库备份
bash scripts/restore-postgres.sh backups/door_backup_YYYYMMDD_HHMMSS.sql

# 3) 切回历史版本并重新拉起
git checkout <previous-tag-or-commit>
docker compose up -d --build app worker nginx

# 4) 验证
curl http://localhost:3001/api/health/ready
```

## 4. 运维常用命令

| 命令 | 作用 |
|---|---|
| `docker compose ps` | 查看服务状态 |
| `docker compose logs -f app` | 查看 API 日志 |
| `docker compose logs -f worker` | 查看 Worker 日志 |
| `docker compose exec app sh` | 进入 app 容器 |
| `docker compose down` | 停止全部服务 |
| `docker compose down -v` | 停止并删除卷（会清空数据） |

## 5. 自动拉起风险提示

1. 必须在 `door/server` 目录执行 `docker compose`。  
2. 若宿主机已有 PostgreSQL 占用 `5432`，先处理端口冲突再启动。  
3. 若需要改端口，必须同步修改：
   `docker-compose.yml`、Nginx 配置、前端代理配置、运维文档。  
