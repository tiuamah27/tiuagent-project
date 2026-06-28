import { getAppsOverview } from './apps.service.js';
import { getDockerOverview } from './docker.service.js';
import { getStorageOverview } from './storage.service.js';
import { getSystemMetrics } from './system.service.js';
import type { InfrastructureResponse } from '../types/infrastructure.types.js';

function roundTo(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export async function getInfrastructureOverview(): Promise<InfrastructureResponse> {
  const [system, storage, docker] = await Promise.all([
    getSystemMetrics(),
    getStorageOverview(),
    getDockerOverview()
  ]);

  const apps = await getAppsOverview();

  let containersRunning = 0;
  let containersTotal = 0;
  if (Array.isArray(docker)) {
    containersTotal = docker.length;
    containersRunning = docker.filter(c => c.status === 'running').length;
  }

  let appsHealthy = 0;
  let appsTotal = 0;
  if (Array.isArray(apps)) {
    appsTotal = apps.length;
    appsHealthy = apps.filter(a => a.healthy).length;
  }

  const storagePercent = storage.totalGB > 0 ? roundTo((storage.usedGB / storage.totalGB) * 100) : 0;

  return {
    server: system,
    containersRunning,
    containersTotal,
    appsHealthy,
    appsTotal,
    storagePercent
  };
}
