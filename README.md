# TiuAgent

TiuAgent v1.0.0 provides real-time infrastructure data from TiuServer to TiuOS.

## Runtime

- Ubuntu Server 24.04
- Docker
- Docker Compose
- Node.js 22
- TypeScript
- Fastify

Deployment path:

```bash
/opt/infra/tiu-agent
```

## Endpoints

### `GET /`

```json
{
  "service": "TiuAgent",
  "version": "1.0.0",
  "status": "online"
}
```

### `GET /api/v1/version`

```json
{
  "name": "tiu-agent",
  "version": "1.0.0"
}
```

### `GET /api/v1/health`

```json
{
  "status": "healthy",
  "hostname": "tiuserver",
  "timestamp": "2026-05-31T16:00:00.000Z"
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

### `GET /api/v1/storage`

```json
{
  "summary": {
    "path": "/",
    "totalGiB": 512,
    "usedGiB": 42,
    "freeGiB": 470,
    "usagePercent": 8.2
  },
  "folders": [],
  "timestamp": "2026-05-31T16:00:00.000Z",
  "cache": {
    "enabled": true,
    "ttlSeconds": 60,
    "refreshedAt": "2026-05-31T16:00:00.000Z"
  }
}
```

### `GET /api/v1/docker`

```json
{
  "summary": {
    "total": 8,
    "running": 8,
    "stopped": 0
  },
  "containers": [],
  "timestamp": "2026-05-31T16:00:00.000Z"
}
```

Unavailable response:

```json
{
  "status": "unavailable",
  "reason": "docker_connection_failed"
}
```

### `GET /api/v1/apps`

```json
{
  "summary": {
    "total": 8,
    "running": 8,
    "stopped": 0
  },
  "apps": [],
  "timestamp": "2026-05-31T16:00:00.000Z"
}
```

### `GET /api/v1/infrastructure`

```json
{
  "server": {
    "hostname": "tiuserver",
    "status": "online"
  },
  "system": {
    "cpu": {
      "usage": 2
    },
    "memory": {
      "used": 1.3,
      "total": 15.5
    }
  },
  "storage": {
    "usedPercent": 10.3
  },
  "docker": {
    "status": "online",
    "containers": 8,
    "running": 8
  },
  "applications": {
    "total": 8,
    "healthy": 8
  },
  "timestamp": "2026-05-31T16:00:00.000Z"
}
```

### `GET /api/v1/hanfin`

```json
{
  "name": "HanFin",
  "container": "hanfin",
  "status": "running",
  "healthy": true,
  "deployment": {
    "environment": "production"
  },
  "application": {
    "version": "unknown",
    "branch": "unknown",
    "commit": "unknown"
  },
  "database": {
    "status": "unavailable"
  },
  "timestamp": "2026-05-31T16:00:00.000Z"
}
```

### `GET /api/v1/automation`

```json
{
  "name": "n8n",
  "container": "n8n",
  "status": "running",
  "healthy": true,
  "deployment": {
    "environment": "production"
  },
  "automation": {
    "version": "unknown",
    "workflows": "unknown",
    "executions": "unknown"
  },
  "timestamp": "2026-05-31T16:00:00.000Z"
}
```

### `GET /api/v1/cloudflare`

```json
{
  "name": "Cloudflare Tunnel",
  "status": "running",
  "healthy": true,
  "source": "process",
  "network": {
    "publicAccess": true
  },
  "tunnel": {
    "status": "running"
  },
  "timestamp": "2026-05-31T16:00:00.000Z"
}
```

### `GET /api/v1/backups`

```json
{
  "status": "available",
  "summary": {
    "totalLocations": 3,
    "existingLocations": 1
  },
  "locations": [
    {
      "path": "/host/opt/backups",
      "exists": true
    }
  ],
  "timestamp": "2026-05-31T16:00:00.000Z"
}
```

## Status Values

Public `status` fields use these stable values:

```text
online
offline
running
stopped
healthy
unhealthy
available
unavailable
not_found
not_configured
```

Runtime module errors return:

```json
{
  "status": "unavailable",
  "reason": "runtime_error"
}
```

## Configuration

Copy `.env.example` to `.env` and adjust values as needed.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `production` | Runtime environment. |
| `HOST` | `0.0.0.0` | Bind address. |
| `PORT` | `8080` | HTTP port. |
| `LOG_LEVEL` | `info` | Fastify logger level. |
| `SERVER_HOSTNAME` | `tiuserver` | Hostname shown by health and infrastructure endpoints. |
| `STORAGE_PATHS` | `/host/opt/apps,/host/opt/infra,/home` | Storage folders to monitor. |
| `DOCKER_SOCKET_PATH` | `/var/run/docker.sock` | Docker Engine socket path. |

## Deployment

```bash
sudo mkdir -p /opt/infra/tiu-agent
sudo chown -R "$USER":"$USER" /opt/infra/tiu-agent
cd /opt/infra/tiu-agent
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
curl http://localhost:8080/api/v1/storage
curl http://localhost:8080/api/v1/docker
curl http://localhost:8080/api/v1/apps
curl http://localhost:8080/api/v1/infrastructure
curl http://localhost:8080/api/v1/hanfin
curl http://localhost:8080/api/v1/automation
curl http://localhost:8080/api/v1/cloudflare
curl http://localhost:8080/api/v1/backups
```

## Local Build

```bash
npm install
npm run build
npm start
```
