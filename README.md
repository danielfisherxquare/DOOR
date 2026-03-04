# DOOR Project Rules

This repository contains two different projects under the `door` directory. Automation must distinguish them correctly.

## Structure

- `door/`
  Frontend portal project. This is a Vite React app.
- `door/server/`
  Actual DOOR backend service. This is the deployable server project.

## Critical Rule

Backend deployment commands must run in `door/server`, not in `door`.

Wrong:

```bash
cd door
npm install
npm run start
docker compose up -d
```

Correct:

```bash
cd door/server
cp .env.example .env
docker compose up -d --build
docker compose exec app npx knex migrate:latest --knexfile src/db/knex.js
```

## Current Architecture

- `door/server` runs on the remote server as the system backend.
- `tool` is the local client application.
- `tool` should connect to the backend API exposed by the remote `door/server`.
- If not otherwise specified, treat the current backend host as `http://47.251.107.41:3001`.

## Port Rules

Preferred production setup:

- Public: `22`, `80`, `443`, `8080`
- Private/internal only: `3001`, `5432`

Temporary direct API setup:

- Public: `22`, `3001`
- Do not expose: `5173`, `5432`, `15432`

Notes:

- `5173` is a Vite dev port. It is not a production port.
- `5432` and `15432` are database-related ports and must not be exposed to the public internet.
- If a reverse proxy is used, it should expose `80/443` and forward API traffic to the backend app on internal `3001`.

## Nginx Reverse Proxy Setup (Production)

This section describes how to configure Nginx to serve both static files and proxy API requests.

### Architecture

```
User Access: www.xquareliu.com:8080
    ↓
Nginx (Docker container, port 80 inside, exposed as 8080)
    ↓
├── Static Files: /usr/share/nginx/html (mapped from dist/)
└── API Proxy: /api/* → app:3001 → Express Backend
    ↓
PostgreSQL Database
```

### Configuration Steps

#### 1. Build Frontend First

```bash
cd door
npm run build
# Build output will be in door/dist/
```

#### 2. Update docker-compose.yml

Ensure the Nginx service includes the dist volume mount:

```yaml
nginx:
  image: nginx:alpine
  ports:
    - "8080:80"  # Expose port 8080 for public access
  volumes:
    - ./nginx.conf:/etc/nginx/conf.d/default.conf
    - ../dist:/usr/share/nginx/html:ro  # Mount frontend build
  depends_on:
    - app
```

#### 3. Update nginx.conf (if needed)

The Nginx config should handle both static files and API proxy:

```nginx
upstream app_backend {
    server app:3001;
}

server {
    listen 80;
    server_name _;

    # API Reverse Proxy
    location /api {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static Files (served from dist/)
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

#### 4. Deploy

```bash
cd door/server
docker compose up -d --build
```

### Verify Deployment

| Check | Command |
|-------|---------|
| Nginx running | `docker compose ps nginx` |
| Port 8080 listening | `ss -ltnp | grep 8080` |
| Static files accessible | `curl -I http://127.0.0.1:8080/` |
| API accessible | `curl -I http://127.0.0.1:8080/api/health/live` |

## Health Checks

Run these checks on the server from `door/server` context:

```bash
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 nginx
docker compose logs --tail=200 postgres

curl -i http://127.0.0.1:3001/api/health/live
curl -i http://127.0.0.1:3001/api/health/ready

ss -ltnp | grep 3001
ss -ltnp | grep 5432
```

Expected:

- `/api/health/live` returns HTTP `200` with `{"status":"ok"}`
- `/api/health/ready` returns HTTP `200` with database connected

If public `3001` returns `502` or empty reply:

- confirm the deployment is running from `door/server`
- confirm the container named `app` is healthy
- confirm port `3001` is served by the Node app, not by a wrong proxy
- confirm migrations completed successfully

## Files To Trust

For backend deployment, use these files in `door/server`:

- `package.json`
- `.env.example`
- `docker-compose.yml`
- `Dockerfile`
- `nginx.conf`
- `docs/deployment.md`

For frontend portal behavior in `door`, use:

- `package.json`
- `vite.config.js`
- `src/`

## Automation Guidance

OpenClaw or any other automation should follow these rules:

- Never assume `door` root is the backend deploy directory.
- Always inspect `door/server/package.json` before backend operations.
- Only run Docker deployment commands inside `door/server`.
- Treat root `door/package.json` as frontend-only.
- Before changing network settings, preserve the `tool -> door/server` API relationship.

