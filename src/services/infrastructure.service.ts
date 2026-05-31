import { hostname as osHostname } from 'node:os';
import { getAppsOverview } from './apps.service.js';
import { getDockerOverview } from './docker.service.js';
import { getStorageOverview } from './storage.service.js';
import { getSystemMetrics } from './system.service.js';
import type { InfrastructureResponse } from '../types/infrastructure.types.js';

export async function getInfrastructureOverview(): Promise<InfrastructureResponse> {
  const [system, storage, docker] = await Promise.all([
    getSystemMetrics(),
    getStorageOverview(),
    getDockerOverview()
  ]);

  const apps = await getAppsOverview();

  return {
    server: {
      hostname: process.env.SERVER_HOSTNAME ?? osHostname(),
      status: 'online'
    },
    system: {
      cpu: {
        usage: system.cpu.usage
      },
      memory: {
        used: system.memory.used,
        total: system.memory.total
      }
    },
    storage: {
      usedPercent: storage.summary.usagePercent
    },
    docker: {
      status: 'containers' in docker ? 'online' : 'unavailable',
      containers: 'containers' in docker ? docker.summary.total : 0,
      running: 'containers' in docker ? docker.summary.running : 0
    },
    applications: {
      total: 'apps' in apps ? apps.summary.total : 0,
      healthy: 'apps' in apps ? apps.apps.filter((app) => app.healthy).length : 0
    },
    timestamp: new Date().toISOString()
  };
}
