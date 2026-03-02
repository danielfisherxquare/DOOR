# DOOR 部署指南

## 1. 首次部署

```bash
# 1. 拉取代码
git clone <repo> && cd door/server

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置安全的密码和密钥

# 3. 启动所有服务
docker compose up -d --build

# 4. 执行数据库迁移
docker compose exec app npx knex migrate:latest --knexfile src/db/knex.js

# 5. 验证健康检查
curl http://localhost:3001/api/health/live   # → {"status":"ok"}
curl http://localhost:3001/api/health/ready  # → {"status":"ok","database":"connected"}
```

## 2. 常规更新

```bash
# 1. 备份数据库
bash scripts/backup-postgres.sh

# 2. 拉取新代码
git pull origin main

# 3. 重新构建镜像并启动
docker compose up -d --build

# 4. 执行 migration
docker compose exec app npx knex migrate:latest --knexfile src/db/knex.js

# 5. 验证健康检查
curl http://localhost:3001/api/health/ready
```

## 3. 回滚流程

```bash
# 1. 停止 app + worker
docker compose stop app worker

# 2. 恢复 PG 备份
bash scripts/restore-postgres.sh backups/door_backup_YYYYMMDD_HHMMSS.sql

# 3. 切回旧镜像（使用 git checkout 到上一个版本）
git checkout <previous-tag>
docker compose up -d --build app worker

# 4. 验证
curl http://localhost:3001/api/health/ready
```

## 4. 常用命令

| 命令 | 说明 |
|------|------|
| `docker compose ps` | 查看服务状态 |
| `docker compose logs -f app` | 查看 App 日志 |
| `docker compose logs -f worker` | 查看 Worker 日志 |
| `docker compose exec app sh` | 进入 App 容器 |
| `docker compose down` | 停止所有服务 |
| `docker compose down -v` | 停止并删除数据卷（⚠️ 数据丢失） |
