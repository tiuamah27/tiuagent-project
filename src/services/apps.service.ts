import { getDockerOverview } from './docker.service.js';
import type { DockerContainer } from '../types/docker.types.js';
import type { AppEntity, AppsResponse, AppType } from '../types/apps.types.js';

interface AppDefinition {
  name: string;
  type: AppType;
  containers: string[];
  url?: string;
  manageUrl?: string;
}

const APP_DEFINITIONS: AppDefinition[] = [
  {
    name: 'HanFin',
    type: 'finance',
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
  },
  {
    name: 'Portainer',
    type: 'monitoring',
    containers: ['portainer'],
    url: 'https://portainer.tiuserver.my.id',
    manageUrl: 'https://portainer.tiuserver.my.id'
  },
  {
    name: 'Beszel',
    type: 'monitoring',
    containers: ['beszel'],
    url: 'https://beszel.tiuserver.my.id',
  },
  {
    name: 'Beszel Agent',
    type: 'monitoring',
    containers: ['beszel-agent'],
  },
  {
    name: 'Uptime Kuma',
    type: 'monitoring',
    containers: ['uptime-kuma'],
    url: 'https://uptime.tiuserver.my.id',
  },
  {
    name: 'Cloudflared',
    type: 'tunnel',
    containers: ['cloudflared', 'cloudflare', 'cloudflare-tunnel'],
  },
  {
    name: 'Nginx',
    type: 'custom',
    containers: ['nginx', 'nginx-proxy'],
  },
  {
    name: 'TiuAgent',
    type: 'custom',
    containers: ['tiu-agent'],
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

function generateAppId(containerName: string): string {
  return containerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function extractVersion(image: string): string {
  const tag = image.split(':').at(-1);

  if (!tag || tag === image || tag.includes('/')) {
    return 'latest';
  }

  return tag;
}

function mapContainerToApp(container: DockerContainer): AppEntity {
  const definition = getAppDefinition(container.name);

  return {
    id: generateAppId(container.name),
    name: definition?.name ?? formatCustomAppName(container.name),
    type: definition?.type ?? 'custom',
    version: extractVersion(container.image),
    status: container.status,
    url: definition?.url || undefined,
    manageUrl: definition?.manageUrl || undefined,
    container: container.name,
    image: container.image,
    healthy: container.status === 'running',
    created: undefined, // will be populated if needed via inspect
    branch: container.branch,
    commit: container.commit,
  };
}

export async function getAppsOverview(): Promise<AppsResponse> {
  const dockerOverview = await getDockerOverview();

  if (!Array.isArray(dockerOverview)) {
    return {
      status: 'unavailable',
      reason: dockerOverview.reason
    };
  }

  return dockerOverview.map((container) => mapContainerToApp(container));
}
