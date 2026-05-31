export type StorageFolderStatus = 'ok' | 'missing' | 'timeout' | 'error';

export interface StorageSummary {
  path: '/';
  totalGiB: number;
  usedGiB: number;
  freeGiB: number;
  usagePercent: number;
}

export interface StorageFolder {
  path: string;
  label: string;
  sizeGiB: number | null;
  status: StorageFolderStatus;
  error?: string;
}

export interface StorageCacheInfo {
  enabled: true;
  ttlSeconds: number;
  refreshedAt: string;
}

export interface StorageResponse {
  summary: StorageSummary;
  folders: StorageFolder[];
  timestamp: string;
  cache: StorageCacheInfo;
}
