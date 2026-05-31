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
  return container.State || 'unknown';
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

async function getContainerState(container: ContainerInfo): Promise<string> {
  try {
    const detail = await docker.getContainer(container.Id).inspect();
    return detail.State.Health?.Status ?? detail.State.Status ?? normalizeContainerStatus(container);
  } catch {
    return normalizeContainerStatus(container);
  }
}

async function mapContainer(container: ContainerInfo): Promise<DockerContainer> {
  const state = await getContainerState(container);

  return {
    id: container.Id.slice(0, 12),
    name: normalizeContainerName(container),
    image: container.Image,
    status: normalizeContainerStatus(container),
    state,
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
