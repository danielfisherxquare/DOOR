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

- Public: `22`, `80`, `443`
- Private/internal only: `3001`, `5432`

Temporary direct API setup:

- Public: `22`, `3001`
- Do not expose: `5173`, `5432`, `15432`

Notes:

- `5173` is a Vite dev port. It is not a production port.
- `5432` and `15432` are database-related ports and must not be exposed to the public internet.
- If a reverse proxy is used, it should expose `80/443` and forward API traffic to the backend app on internal `3001`.

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

