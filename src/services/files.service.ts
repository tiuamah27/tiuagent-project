import { readdir, stat, readFile as fsReadFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileEntry, FileContent, FileType } from '../types/files.types.js';

const ALLOWED_PATHS = ['/opt', '/home', '/etc', '/var/log'];
const MAX_READ_SIZE_BYTES = 1024 * 1024; // 1MB
const SENSITIVE_KEYS = ['password', 'secret', 'token', 'key', 'api_key', 'pass', 'auth'];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

function resolveType(stats: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): FileType {
  if (stats.isDirectory()) return 'dir';
  if (stats.isSymbolicLink()) return 'symlink';
  return 'file';
}

function formatPermissions(mode: number, isDir: boolean): string {
  const types = isDir ? 'd' : '-';
  const owner = [
    mode & 0o400 ? 'r' : '-',
    mode & 0o200 ? 'w' : '-',
    mode & 0o100 ? 'x' : '-'
  ].join('');
  const group = [
    mode & 0o040 ? 'r' : '-',
    mode & 0o020 ? 'w' : '-',
    mode & 0o010 ? 'x' : '-'
  ].join('');
  const others = [
    mode & 0o004 ? 'r' : '-',
    mode & 0o002 ? 'w' : '-',
    mode & 0o001 ? 'x' : '-'
  ].join('');
  
  return `${types}${owner}${group}${others}`;
}

export async function listFiles(dirPath: string): Promise<FileEntry[]> {
  if (!isAllowedPath(dirPath) || dirPath.includes('..')) {
    throw new Error('Forbidden path');
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const results: FileEntry[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    try {
      const stats = await stat(fullPath);
      results.push({
        name: entry.name,
        path: fullPath,
        type: resolveType(entry),
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        permissions: formatPermissions(stats.mode, stats.isDirectory()),
      });
    } catch {
      // Ignore files we can't stat
    }
  }

  // Sort dirs first, then files alphabetically
  return results.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });
}

function censorContent(content: string): { censored: string; keysFound: string[] } {
  let censored = content;
  const keysFound: string[] = [];

  const lines = content.split('\n');
  const processedLines = lines.map(line => {
    let processedLine = line;
    for (const key of SENSITIVE_KEYS) {
      const regex = new RegExp(`(${key}[\\s]*[:=][\\s]*)(['"]?)([^'"\\n]+)\\2`, 'gi');
      if (regex.test(processedLine)) {
        if (!keysFound.includes(key)) keysFound.push(key);
        processedLine = processedLine.replace(regex, `$1$2********$2`);
      }
    }
    return processedLine;
  });

  return {
    censored: processedLines.join('\n'),
    keysFound
  };
}

export async function readFileContent(filePath: string): Promise<FileContent> {
  if (!isAllowedPath(filePath) || filePath.includes('..')) {
    throw new Error('Forbidden path');
  }

  const stats = await stat(filePath);
  if (!stats.isFile()) {
    throw new Error('Not a file');
  }

  if (stats.size > MAX_READ_SIZE_BYTES) {
    return {
      path: filePath,
      content: '',
      isSensored: false,
      sensoredKeys: [],
      encoding: 'too-large'
    };
  }

  try {
    const buffer = await fsReadFile(filePath);
    const content = buffer.toString('utf8');
    
    // Check if it's binary by looking for null bytes
    if (content.includes('\0')) {
      return {
        path: filePath,
        content: '',
        isSensored: false,
        sensoredKeys: [],
        encoding: 'binary'
      };
    }

    const { censored, keysFound } = censorContent(content);

    return {
      path: filePath,
      content: censored,
      isSensored: keysFound.length > 0,
      sensoredKeys: keysFound,
      encoding: 'text'
    };
  } catch (error) {
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
  }
}
