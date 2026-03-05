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
