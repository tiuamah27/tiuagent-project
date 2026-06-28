import { execFile } from 'node:child_process';
import { access, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import { promisify } from 'node:util';
import Docker from 'dockerode';
import type { StorageResponse, StorageCategory, DockerVolume } from '../types/storage.types.js';

const execFileAsync = promisify(execFile);

const ROOT_PATH = '/';
const DEFAULT_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const CACHE_TTL_MS = 60_000;
const FOLDER_SCAN_TIMEOUT_MS = 5000;
const LARGEST_VOLUME_LIMIT = 10;

const CATEGORY_DEFINITIONS = [
  { label: 'Aplikasi',  path: '/opt/apps',                color: '#3b82f6' },
  { label: 'Database',  path: '/var/lib/docker/volumes',   color: '#8b5cf6' },
  { label: 'Backup',    path: '/opt/backups',              color: '#f59e0b' },
  { label: 'Infra',     path: '/opt/infra',                color: '#06b6d4' },
  { label: 'Home',      path: '/home',                     color: '#10b981' },
  { label: 'Logs',      path: '/var/log',                  color: '#6b7280' },
] as const;

const HOST_MOUNT_STORAGE_PATHS: Record<string, string> = {
  '/opt/apps': '/host/opt/apps',
  '/opt/infra': '/host/opt/infra',
  '/opt/backups': '/host/opt/backups',
  '/home': '/host/home',
  '/var/lib/docker/volumes': '/host/var/lib/docker/volumes',
  '/var/log': '/host/var/log'
};

let cachedResponse: StorageResponse | null = null;
let cachedAt = 0;

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET_PATH ?? DEFAULT_DOCKER_SOCKET_PATH
});

interface DockerVolumeListItem {
  Name?: string;
  Mountpoint?: string;
}

interface DockerVolumeListResponse {
  Volumes?: DockerVolumeListItem[];
}

function roundTo(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function bytesToGiB(bytes: number): number {
  return bytes / 1024 ** 3;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveRuntimePath(path: string): Promise<string> {
  const hostMountPath = HOST_MOUNT_STORAGE_PATHS[path];

  if (hostMountPath && (await pathExists(hostMountPath))) {
    return hostMountPath;
  }

  for (const [sourcePath, mountedPath] of Object.entries(HOST_MOUNT_STORAGE_PATHS)) {
    if (!path.startsWith(`${sourcePath}/`)) {
      continue;
    }

    const candidatePath = `${mountedPath}${path.slice(sourcePath.length)}`;

    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  return path;
}

async function getPathSizeBytes(path: string): Promise<number> {
  const runtimePath = await resolveRuntimePath(path);

  if (!(await pathExists(runtimePath))) {
    return 0;
  }

  try {
    const { stdout } = await execFileAsync('du', ['-sb', runtimePath], {
      timeout: FOLDER_SCAN_TIMEOUT_MS,
      windowsHide: true
    });
    const sizeBytes = Number(stdout.trim().split(/\s+/)[0]);

    return Number.isFinite(sizeBytes) ? sizeBytes : 0;
  } catch {
    return 0;
  }
}

async function getDiskSummary(): Promise<{ totalGB: number; usedGB: number }> {
  const stats = await statfs(ROOT_PATH);
  const totalBytes = Number(stats.blocks) * Number(stats.bsize);
  const freeBytes = Number(stats.bfree) * Number(stats.bsize);
  const usedBytes = totalBytes - freeBytes;

  return {
    totalGB: roundTo(bytesToGiB(totalBytes)),
    usedGB: roundTo(bytesToGiB(usedBytes)),
  };
}

async function getStorageCategories(): Promise<StorageCategory[]> {
  const results = await Promise.all(
    CATEGORY_DEFINITIONS.map(async (cat) => {
      const sizeBytes = await getPathSizeBytes(cat.path);
      return {
        label: cat.label,
        path: cat.path,
        sizeGB: roundTo(bytesToGiB(sizeBytes), 3),
        color: cat.color,
        _sizeBytes: sizeBytes,
      };
    })
  );

  return results
    .sort((a, b) => b._sizeBytes - a._sizeBytes)
    .map(({ _sizeBytes, ...rest }) => rest);
}

async function getDockerVolumes(): Promise<DockerVolumeListItem[]> {
  try {
    const volumes = (await docker.listVolumes()) as DockerVolumeListResponse;
    return volumes.Volumes ?? [];
  } catch {
    return [];
  }
}

async function getDockerVolumeMountpoint(volume: DockerVolumeListItem): Promise<string | null> {
  if (volume.Mountpoint) {
    return volume.Mountpoint;
  }

  if (!volume.Name) {
    return null;
  }

  try {
    const inspected = (await docker.getVolume(volume.Name).inspect()) as DockerVolumeListItem;
    return inspected.Mountpoint ?? null;
  } catch {
    return null;
  }
}

async function getDockerVolumeUsage(volume: DockerVolumeListItem): Promise<DockerVolume | null> {
  if (!volume.Name) {
    return null;
  }

  const mountpoint = await getDockerVolumeMountpoint(volume);

  if (!mountpoint) {
    return null;
  }

  const sizeBytes = await getPathSizeBytes(mountpoint);

  return {
    name: volume.Name,
    mountpoint,
    sizeGB: roundTo(bytesToGiB(sizeBytes), 3),
  };
}

async function getLargestDockerVolumes(): Promise<DockerVolume[]> {
  const dockerVolumes = await getDockerVolumes();
  const volumes = await Promise.all(dockerVolumes.map((volume) => getDockerVolumeUsage(volume)));

  return volumes
    .filter((volume): volume is DockerVolume => volume !== null)
    .sort((a, b) => b.sizeGB - a.sizeGB)
    .slice(0, LARGEST_VOLUME_LIMIT);
}

function getCachedResponse(): StorageResponse | null {
  if (!cachedResponse) {
    return null;
  }

  return Date.now() - cachedAt < CACHE_TTL_MS ? cachedResponse : null;
}

export async function getStorageOverview(): Promise<StorageResponse> {
  const cached = getCachedResponse();

  if (cached) {
    return cached;
  }

  const [disk, categories, volumes] = await Promise.all([
    getDiskSummary(),
    getStorageCategories(),
    getLargestDockerVolumes()
  ]);

  const response: StorageResponse = {
    totalGB: disk.totalGB,
    usedGB: disk.usedGB,
    categories,
    volumes,
  };

  cachedResponse = response;
  cachedAt = Date.now();

  return response;
}
