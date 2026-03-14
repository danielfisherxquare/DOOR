# DOOR 数据库备份与恢复

## 目标

- 服务器本机保留最近 10 份 PostgreSQL 备份
- 支持后台手动生成备份并下载到本地
- 支持上传 `.sql.gz` 文件并恢复到新的测试数据库
- 不提供页面内直接覆盖生产库的能力

## 目录与挂载

- 宿主机目录：`/var/backups/door`
- 容器目录：`/backups`
- 上传恢复目录：`/backups/uploads`

`docker-compose.yml` 已将宿主机目录挂载到 `app` 容器。

## 环境变量

在 `door/server/.env` 中至少配置：

```env
HOST_BACKUP_DIR=/var/backups/door
BACKUP_DIR=/backups
BACKUP_RETENTION_COUNT=10
RESTORE_UPLOAD_DIR=/backups/uploads
```

初始化目录：

```bash
sudo mkdir -p /var/backups/door/uploads
sudo chown -R 1000:1000 /var/backups/door
```

## 自动备份

推荐在宿主机配置 cron，由宿主机进入项目目录后调用容器内脚本：

```cron
30 3 * * * cd /path/to/door/server && docker compose exec -T app bash scripts/run-postgres-backup.sh --trigger cron >> /var/log/door-backup.log 2>&1
```

## 手动备份

后台路径：

- `/admin/db-backups`

命令行方式：

```bash
cd door/server
docker compose exec -T app bash scripts/run-postgres-backup.sh --trigger manual
```

## 上传恢复

后台页面支持上传 `.sql.gz` 文件并恢复到新的测试数据库。

恢复目标库命名格式：

- `door_restore_YYYYMMDD_HHMMSS`

恢复流程：

1. 在 `/admin/db-backups` 上传本地备份文件
2. 点击“恢复到测试库”
3. 记录目标数据库名
4. 连接该数据库做人工校验

## 恢复后检查

至少确认以下内容：

- 能连接目标数据库
- `knex_migrations` 表存在
- `users`、`orgs`、`races`、`records` 表存在
- 关键业务数据条数基本合理

查看恢复库：

```bash
cd door/server
docker compose exec -T postgres psql -U door -d door_restore_YYYYMMDD_HHMMSS
```

## 风险边界

- 页面不会直接覆盖生产库
- 恢复成功不代表业务完全可用，仍需人工核验
- 本机备份不是异地备份，下载到本地后应继续保存
