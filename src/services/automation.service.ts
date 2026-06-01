import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { extractVersion } from './apps.service.js';
import { getAppsOverview } from './apps.service.js';
import type { AppEntity } from '../types/apps.types.js';
import type { AutomationResponse } from '../types/automation.types.js';

const execAsync = promisify(exec);
const N8N_CONTAINER_NAMES = ['n8n'];

function findN8nApp(apps: AppEntity[]): AppEntity | null {
  return apps.find((app) => app.name === 'n8n' || N8N_CONTAINER_NAMES.includes(app.container)) ?? null;
}

async function queryN8nSql(container: string, sql: string): Promise<number> {
  try {
    const { stdout } = await execAsync(`docker exec ${container} sqlite3 /home/node/.n8n/database.sqlite "${sql}"`, {
      timeout: 3000,
      windowsHide: true
    });
    const value = Number(stdout.trim());

    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

async function getN8nCounts(container: string): Promise<{ workflows: number; executions: number }> {
  const [workflows, executions] = await Promise.all([
    queryN8nSql(container, 'select count(*) from workflow_entity;'),
    queryN8nSql(container, 'select count(*) from execution_entity;')
  ]);

  return {
    workflows,
    executions
  };
}

export async function getAutomationOverview(): Promise<AutomationResponse> {
  const appsOverview = await getAppsOverview();
  const n8n = 'apps' in appsOverview ? findN8nApp(appsOverview.apps) : null;
  const online = n8n?.status === 'running';
  const version = n8n?.version ?? (n8n?.image ? extractVersion(n8n.image) : 'latest');
  const counts = online && n8n ? await getN8nCounts(n8n.container) : { workflows: 0, executions: 0 };

  return {
    name: 'n8n',
    container: 'n8n',
    status: online ? 'running' : 'stopped',
    healthy: n8n?.healthy ?? false,
    online,
    version,
    workflows: counts.workflows,
    executions: counts.executions,
    deployment: {
      environment: process.env.NODE_ENV ?? 'production'
    },
    automation: {
      version,
      workflows: counts.workflows,
      executions: counts.executions
    },
    timestamp: new Date().toISOString()
  };
}
