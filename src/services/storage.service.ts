import { execFile } from 'node:child_process';
import { access, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import { promisify } from 'node:util';
import type { StorageFolder, StorageResponse, StorageSummary } from '../types/storage.types.js';

const execFileAsync = promisify(execFile);

const ROOT_PATH = '/';
const CACHE_TTL_SECONDS = 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const FOLDER_SCAN_TIMEOUT_MS = 5000;
const DEFAULT_STORAGE_PATHS = ['/opt/apps', '/opt/infra', '/opt/backups', '/home'];
const HOST_MOUNT_STORAGE_PATHS: Record<string, string> = {
  '/opt/apps': '/host/opt/apps',
  '/opt/infra': '/host/opt/infra',
  '/opt/backups': '/host/opt/backups',
  '/home': '/host/home'
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
  const [summary, folders] = await Promise.all([
    getDiskSummary(),
    Promise.all(getStoragePaths().map((path) => getFolderSize(path)))
  ]);

  const response: StorageResponse = {
    summary,
    folders,
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
