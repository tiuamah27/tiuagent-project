import { getDockerOverview } from './docker.service.js';
import type { DockerContainer } from '../types/docker.types.js';
import type { AppEntity, AppsResponse, AppType } from '../types/apps.types.js';

interface AppDefinition {
  name: string;
  type: AppType;
  containers: string[];
  url: string;
  manageUrl: string;
}

const APP_DEFINITIONS: AppDefinition[] = [
  {
    name: 'HanFin',
    type: 'application',
    containers: ['hanfin'],
    url: 'https://hanfin.tiuserver.my.id',
    manageUrl: 'https://hanfin.tiuserver.my.id'
  },
  {
    name: 'n8n',
    type: 'automation',
    containers: ['n8n'],
    url: 'https://n8n.tiuserver.my.id',
    manageUrl: 'https://n8n.tiuserver.my.id'
  },
  {
    name: 'PostgreSQL',
    type: 'database',
    containers: ['postgres', 'n8n-postgres'],
    url: '',
    manageUrl: ''
  },
  {
    name: 'Portainer',
    type: 'infrastructure',
    containers: ['portainer'],
    url: 'https://portainer.tiuserver.my.id',
    manageUrl: 'https://portainer.tiuserver.my.id'
  },
  {
    name: 'Beszel',
    type: 'monitoring',
    containers: ['beszel'],
    url: 'https://beszel.tiuserver.my.id',
    manageUrl: 'https://beszel.tiuserver.my.id'
  },
  {
    name: 'Beszel Agent',
    type: 'monitoring',
    containers: ['beszel-agent'],
    url: 'https://beszel.tiuserver.my.id',
    manageUrl: 'https://beszel.tiuserver.my.id'
  },
  {
    name: 'Uptime Kuma',
    type: 'monitoring',
    containers: ['uptime-kuma'],
    url: 'https://uptime.tiuserver.my.id',
    manageUrl: 'https://uptime.tiuserver.my.id'
  },
  {
    name: 'Cloudflare',
    type: 'infrastructure',
    containers: ['cloudflared', 'cloudflare', 'cloudflare-tunnel'],
    url: 'https://cloudflare.tiuserver.my.id',
    manageUrl: 'https://cloudflare.tiuserver.my.id'
  },
  {
    name: 'TiuAgent',
    type: 'system',
    containers: ['tiu-agent'],
    url: 'https://agent.tiuserver.my.id',
    manageUrl: 'https://agent.tiuserver.my.id'
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

export function extractVersion(image: string): string {
  const tag = image.split(':').at(-1);

  if (!tag || tag === image || tag.includes('/')) {
    return 'latest';
  }

  return tag;
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
    version: extractVersion(container.image),
    url: definition?.url ?? '',
    manageUrl: definition?.manageUrl ?? '',
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
