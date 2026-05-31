export type BackupStatus = 'available' | 'not_configured';
export type BackupProvider = 'directory' | 'restic' | 'borg' | 'duplicati' | 'rsync' | 'snapshot';

export interface BackupSummary {
  totalLocations: number;
  existingLocations: number;
}

export interface BackupLocation {
  path: string;
  exists: boolean;
  provider?: BackupProvider;
}

export interface BackupsResponse {
  status: BackupStatus;
  summary: BackupSummary;
  locations: BackupLocation[];
  timestamp: string;
}
