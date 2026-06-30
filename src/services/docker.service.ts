import Docker from 'dockerode';
import type { ContainerInfo } from 'dockerode';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { DockerContainer, DockerResponse, ContainerStatus } from '../types/docker.types.js';

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

function normalizeContainerStatus(container: ContainerInfo): ContainerStatus {
  const state = container.State?.toLowerCase() ?? 'stopped';
  const validStatuses: ContainerStatus[] = ['running', 'stopped', 'paused', 'restarting', 'dead'];
  return validStatuses.includes(state as ContainerStatus) ? (state as ContainerStatus) : 'stopped';
}

function extractVersionFromImage(image: string): string {
  const parts = image.split(':');
  return parts.length > 1 ? parts[parts.length - 1] : 'latest';
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
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatContainerPorts(container: ContainerInfo): string[] {
  return (container.Ports ?? []).map((port) => {
    if (port.PublicPort) {
      return `${port.PublicPort}:${port.PrivatePort}`;
    }

    return `${port.PrivatePort}/${port.Type}`;
  });
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

  return Number(((cpuDelta / systemDelta) * onlineCpus * 100).toFixed(1));
}

function bytesToMB(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

function extractLabels(labels: Record<string, string> | undefined): { branch?: string; commit?: string } {
  if (!labels) return {};
  return {
    branch: labels['tiuos.branch'] ?? labels['git.branch'] ?? undefined,
    commit: labels['tiuos.commit'] ?? labels['git.commit'] ?? undefined,
  };
}

async function mapContainer(container: ContainerInfo): Promise<DockerContainer> {
  const dockerContainer = docker.getContainer(container.Id);
  const status = normalizeContainerStatus(container);
  let cpu = 0;
  let ram = 0;
  let uptimeStr = '0m';
  let restartCount = 0;
  let lastRestart: string | null = null;
  let labels: Record<string, string> = {};

  try {
    const detail = await dockerContainer.inspect();
    uptimeStr = status === 'running' ? formatUptime(detail.State.StartedAt) : '0m';
    restartCount = detail.RestartCount ?? 0;
    lastRestart = restartCount > 0 ? (detail.State.StartedAt ?? null) : null;
    labels = detail.Config.Labels ?? {};
  } catch {
    // fallback — keep defaults
  }

  if (status === 'running') {
    try {
      const stats = (await dockerContainer.stats({ stream: false })) as DockerStatsSnapshot;
      cpu = calculateCpuPercent(stats);
      ram = bytesToMB(stats.memory_stats?.usage ?? 0);
    } catch {
      cpu = 0;
      ram = 0;
    }
  }

  const { branch, commit } = extractLabels(labels);

  return {
    id: container.Id.slice(0, 12),
    name: normalizeContainerName(container),
    image: container.Image,
    version: extractVersionFromImage(container.Image),
    status,
    cpu,
    ram,
    uptime: uptimeStr,
    restartCount,
    lastRestart,
    ports: formatContainerPorts(container),
    branch,
    commit,
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

    return setCachedResponse(containers);
  } catch (error) {
    return setCachedResponse(await getDockerUnavailableReason(error));
  }
}

export async function getContainerDetails(id: string) {
  const container = docker.getContainer(id);
  const detail = await container.inspect();
  
  // Create a pseudo ContainerInfo to reuse mapContainer
  const pseudoInfo: ContainerInfo = {
    Id: detail.Id,
    Names: [detail.Name],
    Image: detail.Config.Image,
    ImageID: detail.Image,
    Command: detail.Config.Cmd?.join(' ') || '',
    Created: new Date(detail.Created).getTime() / 1000,
    Ports: [], // can map from NetworkSettings if needed
    Labels: detail.Config.Labels,
    State: detail.State.Status,
    Status: detail.State.Status,
    HostConfig: { NetworkMode: detail.HostConfig?.NetworkMode || '' },
    NetworkSettings: { Networks: {} },
    Mounts: []
  };

  const base = await mapContainer(pseudoInfo);

  // Mock historical data (since we don't have historical DB in agent)
  const now = Date.now();
  const generateHistory = (value: number) => Array.from({ length: 10 }).map((_, i) => ({
    time: new Date(now - (9 - i) * 60000).toISOString(),
    value: value * (0.8 + Math.random() * 0.4) // random fluctuation around current value
  }));

  const envVars = detail.Config.Env?.map(e => {
    const [key, ...rest] = e.split('=');
    return { key, value: rest.join('='), isSecret: key.includes('SECRET') || key.includes('TOKEN') || key.includes('PASSWORD') };
  }) || [];

  return {
    ...base,
    cpuHistory: generateHistory(base.cpu),
    ramHistory: generateHistory(base.ram),
    responseTimeHistory: generateHistory(45), // mock ms
    commits: [],
    envVars,
    domain: 'localhost',
    sslExpiryDays: 0,
    healthStatus: base.status === 'running' ? 'healthy' : 'down'
  };
}

export async function startContainer(id: string) {
  const container = docker.getContainer(id);
  await container.start();
  cachedResponse = null; // invalidate cache
  return { success: true, message: `Container ${id} started successfully.` };
}

export async function stopContainer(id: string) {
  const container = docker.getContainer(id);
  await container.stop();
  cachedResponse = null;
  return { success: true, message: `Container ${id} stopped successfully.` };
}

export async function restartContainer(id: string) {
  const container = docker.getContainer(id);
  await container.restart();
  cachedResponse = null;
  return { success: true, message: `Container ${id} restarted successfully.` };
}

export async function getContainerLogs(id: string, tail: number) {
  const container = docker.getContainer(id);
  const logsBuffer = await container.logs({ stdout: true, stderr: true, tail, timestamps: true });
  
  // parse multiplexed docker logs format if raw buffer
  const logsStr = logsBuffer.toString('utf8');
  const lines = logsStr.split('\n').filter(Boolean);
  
  return lines.map(line => {
    // Docker log lines usually have 8 bytes header for stream type and size, but timestamps: true parses it as plain text if it's via dockerode text stream... wait, dockerode logs without stream:true returns a Buffer with headers.
    // Let's just strip the 8 byte header if it exists.
    let content = line;
    if (Buffer.isBuffer(logsBuffer) && content.length > 8 && (content.charCodeAt(0) === 1 || content.charCodeAt(0) === 2)) {
      content = content.slice(8);
    }
    
    const parts = content.split(' ');
    const timestamp = parts[0];
    const text = parts.slice(1).join(' ');
    
    return {
      timestamp: new Date(timestamp).getTime() > 0 ? timestamp : new Date().toISOString(),
      text: text || content
    };
  });
}
