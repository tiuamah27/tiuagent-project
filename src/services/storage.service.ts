import { execFile } from 'node:child_process';
import { access, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import { promisify } from 'node:util';
import type {
  DockerVolumeUsage,
  StorageCategory,
  StorageFolder,
  StorageResponse,
  StorageSummary
} from '../types/storage.types.js';

const execFileAsync = promisify(execFile);

const ROOT_PATH = '/';
const CACHE_TTL_SECONDS = 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const FOLDER_SCAN_TIMEOUT_MS = 5000;
const DEFAULT_STORAGE_PATHS = ['/opt/apps', '/opt/infra', '/opt/backups', '/home'];
const STORAGE_CATEGORIES = [
  { name: 'Docker Volumes', path: '/var/lib/docker/volumes' },
  { name: 'Backups', path: '/opt/backups' },
  { name: 'Apps', path: '/opt/apps' },
  { name: 'Infrastructure', path: '/opt/infra' },
  { name: 'Logs', path: '/var/log' }
] as const;
const LARGEST_VOLUME_LIMIT = 10;
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

function roundTo(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function bytesToGiB(bytes: number): number {
  return bytes / 1024 ** 3;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${roundTo(value)} ${units[unitIndex]}`;
}

function getStoragePaths(): string[] {
  const rawPaths = process.env.STORAGE_PATHS;

  if (!rawPaths) {
    return DEFAULT_STORAGE_PATHS;
  }

  const paths = rawPaths
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);

  return paths.length > 0 ? paths : DEFAULT_STORAGE_PATHS;
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

function getFolderLabel(path: string): string {
  const lastSegment = path.split('/').filter(Boolean).at(-1);

  if (!lastSegment) {
    return path;
  }

  return lastSegment
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'killed' in error &&
    (error as { killed?: boolean }).killed === true
  );
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

async function getDiskSummary(): Promise<StorageSummary> {
  const stats = await statfs(ROOT_PATH);
  const totalBytes = Number(stats.blocks) * Number(stats.bsize);
  const freeBytes = Number(stats.bfree) * Number(stats.bsize);
  const usedBytes = totalBytes - freeBytes;
  const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return {
    path: ROOT_PATH,
    totalGiB: roundTo(bytesToGiB(totalBytes)),
    usedGiB: roundTo(bytesToGiB(usedBytes)),
    freeGiB: roundTo(bytesToGiB(freeBytes)),
    usagePercent: roundTo(usagePercent)
  };
}

async function getFolderSize(path: string): Promise<StorageFolder> {
  const label = getFolderLabel(path);
  const runtimePath = await resolveRuntimePath(path);

  if (!(await pathExists(runtimePath))) {
    return {
      path,
      label,
      sizeBytes: null,
      sizeFormatted: '0 B',
      sizeGiB: null,
      status: 'missing'
    };
  }

  try {
    const { stdout } = await execFileAsync('du', ['-sb', runtimePath], {
      timeout: FOLDER_SCAN_TIMEOUT_MS,
      windowsHide: true
    });
    const sizeBytes = Number(stdout.trim().split(/\s+/)[0]);

    if (!Number.isFinite(sizeBytes)) {
      return {
        path,
        label,
        sizeBytes: null,
        sizeFormatted: '0 B',
        sizeGiB: null,
        status: 'error',
        error: 'Unable to parse folder size'
      };
    }

    return {
      path,
      label,
      sizeBytes,
      sizeFormatted: formatBytes(sizeBytes),
      sizeGiB: roundTo(bytesToGiB(sizeBytes), 3),
      status: 'ok'
    };
  } catch (error) {
    if (isTimeoutError(error)) {
      return {
        path,
        label,
        sizeBytes: null,
        sizeFormatted: '0 B',
        sizeGiB: null,
        status: 'timeout',
        error: 'Folder scan timed out'
      };
    }

    return {
      path,
      label,
      sizeBytes: null,
      sizeFormatted: '0 B',
      sizeGiB: null,
      status: 'error',
      error: 'Folder scan failed'
    };
  }
}

async function getStorageCategory(category: (typeof STORAGE_CATEGORIES)[number]): Promise<StorageCategory> {
  const sizeBytes = await getPathSizeBytes(category.path);

  return {
    name: category.name,
    path: category.path,
    sizeBytes,
    sizeFormatted: formatBytes(sizeBytes),
    sizeGiB: roundTo(bytesToGiB(sizeBytes), 3)
  };
}

async function getStorageCategories(): Promise<StorageCategory[]> {
  const categories = await Promise.all(STORAGE_CATEGORIES.map((category) => getStorageCategory(category)));

  return categories.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

async function getDockerVolumeNames(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('docker', ['volume', 'ls', '-q'], {
      timeout: FOLDER_SCAN_TIMEOUT_MS,
      windowsHide: true
    });

    return stdout
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getDockerVolumeMountpoint(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('docker', ['volume', 'inspect', name], {
      timeout: FOLDER_SCAN_TIMEOUT_MS,
      windowsHide: true
    });
    const parsed = JSON.parse(stdout) as Array<{ Mountpoint?: string }>;

    return parsed[0]?.Mountpoint ?? null;
  } catch {
    return null;
  }
}

async function getDockerVolumeUsage(name: string): Promise<DockerVolumeUsage | null> {
  const mountpoint = await getDockerVolumeMountpoint(name);

  if (!mountpoint) {
    return null;
  }

  const sizeBytes = await getPathSizeBytes(mountpoint);

  return {
    name,
    path: mountpoint,
    sizeBytes,
    sizeFormatted: formatBytes(sizeBytes),
    sizeGiB: roundTo(bytesToGiB(sizeBytes), 3)
  };
}

async function getLargestDockerVolumes(): Promise<DockerVolumeUsage[]> {
  const volumeNames = await getDockerVolumeNames();
  const volumes = await Promise.all(volumeNames.map((name) => getDockerVolumeUsage(name)));

  return volumes
    .filter((volume): volume is DockerVolumeUsage => volume !== null)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, LARGEST_VOLUME_LIMIT);
}

function getCachedResponse(): StorageResponse | null {
  if (!cachedResponse) {
    return null;
  }

  const cacheAge = Date.now() - cachedAt;

  return cacheAge < CACHE_TTL_MS ? cachedResponse : null;
}

export async function getStorageOverview(): Promise<StorageResponse> {
  const cached = getCachedResponse();

  if (cached) {
    return cached;
  }

  const refreshedAt = new Date().toISOString();
  const [summary, folders, categories, largestVolumes] = await Promise.all([
    getDiskSummary(),
    Promise.all(getStoragePaths().map((path) => getFolderSize(path))),
    getStorageCategories(),
    getLargestDockerVolumes()
  ]);

  const response: StorageResponse = {
    summary,
    folders,
    categories,
    largestVolumes,
    timestamp: refreshedAt,
    cache: {
      enabled: true,
      ttlSeconds: CACHE_TTL_SECONDS,
      refreshedAt
    }
  };

  cachedResponse = response;
  cachedAt = Date.now();

  return response;
}
