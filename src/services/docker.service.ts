import Docker from 'dockerode';
import type { ContainerInfo } from 'dockerode';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { DockerContainer, DockerResponse } from '../types/docker.types.js';

const CACHE_TTL_MS = 30_000;
const DEFAULT_DOCKER_SOCKET_PATH = '/var/run/docker.sock';

let cachedResponse: DockerResponse | null = null;
let cachedAt = 0;

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET_PATH ?? DEFAULT_DOCKER_SOCKET_PATH
});

interface DockerStatsSnapshot {
  cpu_stats?: {
    cpu_usage?: {
      total_usage?: number;
      percpu_usage?: number[];
    };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: {
    cpu_usage?: {
      total_usage?: number;
    };
    system_cpu_usage?: number;
  };
  memory_stats?: {
    usage?: number;
  };
}

function getDockerSocketPath(): string {
  return process.env.DOCKER_SOCKET_PATH ?? DEFAULT_DOCKER_SOCKET_PATH;
}

function getCachedResponse(): DockerResponse | null {
  if (!cachedResponse) {
    return null;
  }

  return Date.now() - cachedAt < CACHE_TTL_MS ? cachedResponse : null;
}

function setCachedResponse(response: DockerResponse): DockerResponse {
  cachedResponse = response;
  cachedAt = Date.now();

  return response;
}

async function getDockerUnavailableReason(error: unknown): Promise<DockerResponse> {
  const socketPath = getDockerSocketPath();

  try {
    await access(socketPath, constants.F_OK);
  } catch {
    return {
      status: 'unavailable',
      reason: 'socket_not_found'
    };
  }

  try {
    await access(socketPath, constants.R_OK | constants.W_OK);
  } catch {
    return {
      status: 'unavailable',
      reason: 'permission_denied'
    };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'EACCES'
  ) {
    return {
      status: 'unavailable',
      reason: 'permission_denied'
    };
  }

  return {
    status: 'unavailable',
    reason: 'docker_connection_failed'
  };
}

function normalizeContainerName(container: ContainerInfo): string {
  const firstName = container.Names?.[0];

  if (!firstName) {
    return container.Id.slice(0, 12);
  }

  return firstName.replace(/^\//, '');
}

function normalizeContainerStatus(container: ContainerInfo): string {
  return container.State === 'running' ? 'running' : 'stopped';
}

function normalizeContainerState(state: string): string {
  if (state === 'healthy' || state === 'running') {
    return state;
  }

  if (state === 'unhealthy') {
    return 'unhealthy';
  }

  return 'stopped';
}

function formatContainerCreated(created: number): string {
  return new Date(created * 1000).toISOString();
}

function formatContainerPorts(container: ContainerInfo): string[] {
  return (container.Ports ?? []).map((port) => {
    if (port.PublicPort) {
      return `${port.PublicPort}:${port.PrivatePort}`;
    }

    return `${port.PrivatePort}/${port.Type}`;
  });
}

function formatPercent(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

function formatBytes(bytes: number): string {
  const mib = bytes / 1024 ** 2;

  if (mib < 1024) {
    return `${Math.round(mib)} MB`;
  }

  return `${(mib / 1024).toFixed(1)} GB`;
}

function formatUptime(startedAt?: string): string {
  if (!startedAt || startedAt.startsWith('0001-')) {
    return '0m';
  }

  const elapsedMs = Date.now() - new Date(startedAt).getTime();

  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return '0m';
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  const days = Math.floor(elapsedMinutes / 1440);
  const hours = Math.floor((elapsedMinutes % 1440) / 60);
  const minutes = elapsedMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function calculateCpuPercent(stats: DockerStatsSnapshot): number {
  const totalUsage = stats.cpu_stats?.cpu_usage?.total_usage ?? 0;
  const previousTotalUsage = stats.precpu_stats?.cpu_usage?.total_usage ?? 0;
  const systemUsage = stats.cpu_stats?.system_cpu_usage ?? 0;
  const previousSystemUsage = stats.precpu_stats?.system_cpu_usage ?? 0;
  const cpuDelta = totalUsage - previousTotalUsage;
  const systemDelta = systemUsage - previousSystemUsage;
  const onlineCpus =
    stats.cpu_stats?.online_cpus ??
    stats.cpu_stats?.cpu_usage?.percpu_usage?.length ??
    1;

  if (cpuDelta <= 0 || systemDelta <= 0) {
    return 0;
  }

  return (cpuDelta / systemDelta) * onlineCpus * 100;
}

async function getContainerState(container: ContainerInfo): Promise<string> {
  try {
    const detail = await docker.getContainer(container.Id).inspect();
    return normalizeContainerState(detail.State.Health?.Status ?? detail.State.Status ?? normalizeContainerStatus(container));
  } catch {
    return normalizeContainerStatus(container);
  }
}

async function mapContainer(container: ContainerInfo): Promise<DockerContainer> {
  const dockerContainer = docker.getContainer(container.Id);
  const status = normalizeContainerStatus(container);
  let state = status;
  let cpu = '0.0%';
  let ram = '0 MB';
  let uptime = '0m';

  try {
    const detail = await dockerContainer.inspect();
    state = normalizeContainerState(detail.State.Health?.Status ?? detail.State.Status ?? status);
    uptime = status === 'running' ? formatUptime(detail.State.StartedAt) : '0m';
  } catch {
    state = await getContainerState(container);
  }

  if (status === 'running') {
    try {
      const stats = (await dockerContainer.stats({ stream: false })) as DockerStatsSnapshot;
      cpu = formatPercent(calculateCpuPercent(stats));
      ram = formatBytes(stats.memory_stats?.usage ?? 0);
    } catch {
      cpu = '0.0%';
      ram = '0 MB';
    }
  }

  return {
    id: container.Id.slice(0, 12),
    name: normalizeContainerName(container),
    image: container.Image,
    status,
    state,
    cpu,
    ram,
    uptime,
    created: formatContainerCreated(container.Created),
    ports: formatContainerPorts(container)
  };
}

export async function getDockerOverview(): Promise<DockerResponse> {
  const cached = getCachedResponse();

  if (cached) {
    return cached;
  }

  try {
    const containerInfos = await docker.listContainers({ all: true });
    const containers = await Promise.all(containerInfos.map((container) => mapContainer(container)));
    const running = containers.filter((container) => container.status === 'running').length;

    return setCachedResponse({
      summary: {
        total: containers.length,
        running,
        stopped: containers.length - running
      },
      containers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return setCachedResponse(await getDockerUnavailableReason(error));
  }
}
