import { getAppsOverview } from './apps.service.js';
import type { AppEntity } from '../types/apps.types.js';
import type { HanFinResponse } from '../types/hanfin.types.js';

function findHanFinApp(apps: AppEntity[]): AppEntity | null {
  return apps.find((app) => app.name === 'HanFin' || app.container === 'hanfin') ?? null;
}

export async function getHanFinOverview(): Promise<HanFinResponse> {
  const appsOverview = await getAppsOverview();
  const hanfin = 'apps' in appsOverview ? findHanFinApp(appsOverview.apps) : null;

  return {
    name: 'HanFin',
    container: 'hanfin',
    status: hanfin?.status ?? 'unknown',
    healthy: hanfin?.healthy ?? false,
    deployment: {
      environment: process.env.NODE_ENV ?? 'production'
    },
    application: {
      version: 'unknown',
      branch: 'unknown',
      commit: 'unknown'
    },
    database: {
      status: 'unknown'
    },
    timestamp: new Date().toISOString()
  };
}
