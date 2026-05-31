import { getAppsOverview } from './apps.service.js';
import type { AppEntity } from '../types/apps.types.js';
import type { AutomationResponse } from '../types/automation.types.js';

function findN8nApp(apps: AppEntity[]): AppEntity | null {
  return apps.find((app) => app.name === 'n8n' || app.container === 'n8n') ?? null;
}

export async function getAutomationOverview(): Promise<AutomationResponse> {
  const appsOverview = await getAppsOverview();
  const n8n = 'apps' in appsOverview ? findN8nApp(appsOverview.apps) : null;

  return {
    name: 'n8n',
    container: 'n8n',
    status: n8n?.status === 'running' ? 'running' : 'stopped',
    healthy: n8n?.healthy ?? false,
    deployment: {
      environment: process.env.NODE_ENV ?? 'production'
    },
    automation: {
      version: 'unknown',
      workflows: 'unknown',
      executions: 'unknown'
    },
    timestamp: new Date().toISOString()
  };
}
