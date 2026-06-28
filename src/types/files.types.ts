export type FileType = 'file' | 'dir' | 'symlink';

export interface FileEntry {
  name: string;
  path: string;
  type: FileType;
  sizeBytes: number;
  modifiedAt: string;
  permissions?: string;
  owner?: string;
  isSensitive?: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  isSensored: boolean;
  sensoredKeys: string[];
  encoding: 'text' | 'binary' | 'too-large';
}
