import Docker from 'dockerode';
import type { ContainerInfo } from 'dockerode';
import type { DockerContainer, DockerResponse } from '../types/docker.types.js';

const CACHE_TTL_MS = 30_000;
const DEFAULT_DOCKER_SOCKET_PATH = '/var/run/docker.sock';

let cachedResponse: DockerResponse | null = null;
let cachedAt = 0;

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET_PATH ?? DEFAULT_DOCKER_SOCKET_PATH
});

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
  } catch {
    return setCachedResponse({
      status: 'unavailable'
    });
  }
}
