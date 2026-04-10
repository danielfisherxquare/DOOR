# DOOR 本地测试环境状态

## ✅ 已启动的服务

| 服务 | 端口 | 状态 | 访问地址 |
|------|------|------|----------|
| **前端开发服务器** | 5173 | ✅ 运行中 | http://localhost:5173 |
| **后端API服务器** | 3001 | ✅ 运行中 | http://localhost:3001 |
| **PostgreSQL数据库** | 5432 | ✅ 健康 | localhost:5432 |
| **Redis缓存** | 6379 | ✅ 健康 | 内部网络 |
| **Worker进程** | - | ✅ 运行中 | 后台服务 |

## 🔗 服务访问方式

### 前端应用
- **地址**: http://localhost:5173
- **说明**: Vite开发服务器，支持热更新
- **API代理**: `/api/*` 请求自动代理到 `http://localhost:3001`

### 后端API
- **地址**: http://localhost:3001
- **说明**: Node.js API服务器
- **数据库**: PostgreSQL (door:door_dev@localhost:5432/door)

## 🛠️ 管理命令

### 查看Docker服务状态
```bash
cd door/server && docker compose ps
```

### 查看服务日志
```bash
cd door/server && docker compose logs -f [服务名]
```

### 停止所有服务
```bash
cd door/server && docker compose down
```

### 重启特定服务
```bash
cd door/server && docker compose restart [服务名]
```

## 📝 环境配置

关键配置项（来自 `door/server/.env`）:
- `PORT=3001` - 后端服务端口
- `DATABASE_URL=postgres://door:door_dev@localhost:5432/door`
- `NODE_ENV=development`
- `DISABLE_REGISTRATION=false`

## 🚀 启动时间

**环境启动时间**: 2026-03-24 18:47:31

## ⚠️ 注意事项

1. **Nginx容器**: 在本地开发模式下未启动（已退出），因为使用Vite开发服务器而非构建后的静态文件
2. **Redis**: 仅在Docker内部网络可用，未暴露到主机端口
3. **数据库**: 已持久化存储在Docker volume `pgdata` 中