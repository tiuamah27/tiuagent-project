import { getDockerOverview } from './docker.service.js';
import type { DockerContainer } from '../types/docker.types.js';
import type { AppEntity, AppsResponse, AppType } from '../types/apps.types.js';

interface AppDefinition {
  name: string;
  type: AppType;
  containers: string[];
}

const APP_DEFINITIONS: AppDefinition[] = [
  {
    name: 'HanFin',
    type: 'application',
    containers: ['hanfin']
  },
  {
    name: 'n8n',
    type: 'automation',
    containers: ['n8n']
  },
  {
    name: 'PostgreSQL',
    type: 'database',
    containers: ['postgres', 'n8n-postgres']
  },
  {
    name: 'Portainer',
    type: 'infrastructure',
    containers: ['portainer']
  },
  {
    name: 'Beszel',
    type: 'monitoring',
    containers: ['beszel']
  },
  {
    name: 'Beszel Agent',
    type: 'monitoring',
    containers: ['beszel-agent']
  },
  {
    name: 'Uptime Kuma',
    type: 'monitoring',
    containers: ['uptime-kuma']
  },
  {
    name: 'TiuAgent',
    type: 'system',
    containers: ['tiu-agent']
  }
];

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function getAppDefinition(containerName: string): AppDefinition | null {
  const normalizedContainerName = normalizeName(containerName);

  return (
    APP_DEFINITIONS.find((definition) =>
      definition.containers.some((container) => normalizeName(container) === normalizedContainerName)
    ) ?? null
  );
}

function formatCustomAppName(containerName: string): string {
  return containerName
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function isHealthy(container: DockerContainer): boolean {
  if (container.state === 'unhealthy') {
    return false;
  }

  return container.state === 'healthy' || container.status === 'running';
}

function mapContainerToApp(container: DockerContainer): AppEntity {
  const definition = getAppDefinition(container.name);

  return {
    name: definition?.name ?? formatCustomAppName(container.name),
    container: container.name,
    type: definition?.type ?? 'custom',
    status: container.status,
    healthy: isHealthy(container),
    image: container.image,
    created: container.created
  };
}

export async function getAppsOverview(): Promise<AppsResponse> {
  const dockerOverview = await getDockerOverview();

  if (!('containers' in dockerOverview)) {
    return {
      status: 'unavailable',
      reason: dockerOverview.reason
    };
  }

  const apps = dockerOverview.containers.map((container: DockerContainer) => mapContainerToApp(container));
  const running = apps.filter((app: AppEntity) => app.status === 'running').length;

  return {
    summary: {
      total: apps.length,
      running,
      stopped: apps.length - running
    },
    apps,
    timestamp: new Date().toISOString()
  };
}
