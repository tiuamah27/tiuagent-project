import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { getAppsOverview } from './apps.service.js';
import type { AppEntity } from '../types/apps.types.js';
import type { HanFinActionResponse, HanFinResponse } from '../types/hanfin.types.js';

const execAsync = promisify(exec);
const DEFAULT_HANFIN_PATHS = ['/opt/apps/hanfin', '/host/opt/apps/hanfin'];
const COMMAND_TIMEOUT_MS = 60_000;

type HanFinAction = 'pull' | 'restart' | 'deploy';

function findHanFinApp(apps: AppEntity[]): AppEntity | null {
  return apps.find((app) => app.name === 'HanFin' || app.container === 'hanfin') ?? null;
}

function getHanFinPaths(): string[] {
  const configuredPath = process.env.HANFIN_PATH;

  return configuredPath ? [configuredPath, ...DEFAULT_HANFIN_PATHS] : DEFAULT_HANFIN_PATHS;
}

async function runCommand(command: string, cwd?: string): Promise<string> {
  const { stdout, stderr } = await execAsync(command, {
    cwd,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true
  });

  return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
}

async function runFirstSuccessful(commands: Array<{ command: string; cwd?: string }>): Promise<string | null> {
  for (const candidate of commands) {
    try {
      return await runCommand(candidate.command, candidate.cwd);
    } catch {
      // Try the next known runtime path.
    }
  }

  return null;
}

async function detectVersion(paths: string[]): Promise<string> {
  const packageVersion = await Promise.any(
    paths.map(async (path) => {
      const packageJson = JSON.parse(await readFile(`${path}/package.json`, 'utf8')) as { version?: string };
      return packageJson.version ?? 'unknown';
    })
  ).catch(() => null);

  if (packageVersion) {
    return packageVersion;
  }

  const gitDescription = await runFirstSuccessful(
    paths.map((path) => ({ command: 'git describe --tags --always --dirty', cwd: path }))
  );

  return gitDescription?.trim() || 'unknown';
}

async function detectGitValue(paths: string[], command: string): Promise<string> {
  const value = await runFirstSuccessful(paths.map((path) => ({ command, cwd: path })));

  return value?.trim() || 'unknown';
}

function getActionCommand(action: HanFinAction): string {
  const configuredCommands: Record<HanFinAction, string | undefined> = {
    pull: process.env.HANFIN_PULL_COMMAND,
    restart: process.env.HANFIN_RESTART_COMMAND,
    deploy: process.env.HANFIN_DEPLOY_COMMAND
  };

  if (configuredCommands[action]) {
    return configuredCommands[action] as string;
  }

  if (action === 'pull') {
    return 'git pull --ff-only';
  }

  if (action === 'restart') {
    return 'docker restart hanfin';
  }

  return 'git pull --ff-only && docker compose up -d';
}

export async function runHanFinAction(action: HanFinAction): Promise<HanFinActionResponse> {
  const command = getActionCommand(action);
  const paths = getHanFinPaths();
  const cwd = action === 'restart' ? undefined : (process.env.HANFIN_PATH ?? paths[0]);

  try {
    const output = await runCommand(command, cwd);

    return {
      success: true,
      message: `HanFin ${action} completed.`,
      output
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : `HanFin ${action} failed.`
    };
  }
}

export async function getHanFinOverview(): Promise<HanFinResponse> {
  const appsOverview = await getAppsOverview();
  const hanfin = 'apps' in appsOverview ? findHanFinApp(appsOverview.apps) : null;
  const paths = getHanFinPaths();
  const [version, branch, commit] = await Promise.all([
    detectVersion(paths),
    detectGitValue(paths, 'git rev-parse --abbrev-ref HEAD'),
    detectGitValue(paths, 'git rev-parse --short HEAD')
  ]);
  const status = hanfin?.status === 'running' ? 'running' : 'stopped';

  return {
    name: 'HanFin',
    container: 'hanfin',
    status,
    healthy: hanfin?.healthy ?? false,
    version,
    branch,
    commit,
    deployment: {
      environment: process.env.NODE_ENV ?? 'production'
    },
    application: {
      version,
      branch,
      commit
    },
    database: {
      status: status === 'running' ? 'available' : 'unavailable'
    },
    timestamp: new Date().toISOString()
  };
}
