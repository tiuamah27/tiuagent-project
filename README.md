# TiuAgent

TiuAgent v0.1 provides real-time infrastructure data from TiuServer to TiuOS.

## Runtime

- Ubuntu Server 24.04
- Docker
- Docker Compose
- Node.js 22
- TypeScript
- Fastify

Expected deployment path:

```bash
/opt/infra/tiu-agent
```

## Endpoints

### `GET /`

```json
{
  "service": "TiuAgent",
  "version": "0.1.0",
  "status": "online"
}
```

### `GET /api/v1/version`

```json
{
  "name": "tiu-agent",
  "version": "0.1.0"
}
```

### `GET /api/v1/health`

```json
{
  "status": "healthy",
  "hostname": "tiuserver",
  "timestamp": "2026-05-31T13:00:00.000Z"
}
```

### `GET /api/v1/system`

```json
{
  "cpu": {
    "usage": 8
  },
  "memory": {
    "used": 1.4,
    "total": 15
  },
  "disk": {
    "used": 42,
    "total": 512
  }
}
```

Memory and disk values are reported in GiB. CPU usage is a percentage sampled over a short interval.

## Configuration

Copy `.env.example` to `.env` and adjust values as needed.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `production` | Runtime environment. |
| `HOST` | `0.0.0.0` | Bind address. |
| `PORT` | `8080` | HTTP port. |
| `LOG_LEVEL` | `info` | Fastify logger level. |
| `SERVER_HOSTNAME` | `tiuserver` | Hostname shown by `/health`. |

## Installation

```bash
sudo mkdir -p /opt/infra/tiu-agent
sudo chown -R "$USER":"$USER" /opt/infra/tiu-agent
cd /opt/infra/tiu-agent
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm start
```

## Deployment

```bash
cp .env.example .env
docker compose up -d --build
```

## Verification

```bash
docker compose ps
curl http://localhost:8080/
curl http://localhost:8080/api/v1/version
curl http://localhost:8080/api/v1/health
curl http://localhost:8080/api/v1/system
```

This release intentionally does not include Docker, Storage, HanFin, or n8n integrations.
