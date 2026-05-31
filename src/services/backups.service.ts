import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { BackupLocation, BackupsResponse } from '../types/backups.types.js';

const BACKUP_LOCATIONS = ['/host/opt/backups', '/host/backup', '/backup'];

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getBackupLocation(path: string): Promise<BackupLocation> {
  return {
    path,
    exists: await pathExists(path)
  };
}

export async function getBackupsOverview(): Promise<BackupsResponse> {
  const locations = await Promise.all(BACKUP_LOCATIONS.map((path) => getBackupLocation(path)));
  const existingLocations = locations.filter((location) => location.exists).length;

  return {
    status: existingLocations > 0 ? 'available' : 'not_configured',
    summary: {
      totalLocations: locations.length,
      existingLocations
    },
    locations,
    timestamp: new Date().toISOString()
  };
}
