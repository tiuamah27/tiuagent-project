import { PassThrough, type Readable } from 'node:stream';
import Docker from 'dockerode';
import { extractVersion } from './apps.service.js';
import { getAppsOverview } from './apps.service.js';
import type { AppEntity } from '../types/apps.types.js';
import type { AutomationResponse } from '../types/automation.types.js';

const DEFAULT_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const N8N_CONTAINER_NAMES = ['n8n'];
const QUERY_TIMEOUT_MS = 5000;

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET_PATH ?? DEFAULT_DOCKER_SOCKET_PATH
});

interface N8nDatabaseConfig {
  type: string;
  host: string;
  database: string;
  user: string;
  password?: string;
}

function findN8nApp(apps: AppEntity[]): AppEntity | null {
  return apps.find((app) => app.name === 'n8n' || (app.container && N8N_CONTAINER_NAMES.includes(app.container))) ?? null;
}

function parseEnv(env: string[] | undefined): Record<string, string> {
  return Object.fromEntries(
    (env ?? []).map((entry) => {
      const separatorIndex = entry.indexOf('=');

      if (separatorIndex === -1) {
        return [entry, ''];
      }

      return [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)];
    })
  );
}

async function inspectContainerEnv(container: string): Promise<Record<string, string>> {
  try {
    const detail = await docker.getContainer(container).inspect();

    return parseEnv(detail.Config.Env);
  } catch {
    return {};
  }
}

function getN8nDatabaseConfig(env: Record<string, string>): N8nDatabaseConfig {
  return {
    type: env.DB_TYPE ?? 'sqlite',
    host: env.DB_POSTGRESDB_HOST ?? 'postgres',
    database: env.DB_POSTGRESDB_DATABASE ?? 'n8n',
    user: env.DB_POSTGRESDB_USER ?? 'n8n',
    password: env.DB_POSTGRESDB_PASSWORD
  };
}

function collectStream(stream: Readable, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      stream.destroy(new Error('Docker exec timed out'));
    }, timeoutMs);

    stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    stream.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    stream.on('end', () => {
      clearTimeout(timeout);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8').trim(),
        stderr: Buffer.concat(stderrChunks).toString('utf8').trim()
      });
    });

    docker.modem.demuxStream(stream, stdout, stderr);
  });
}

async function execInContainer(container: string, command: string[], timeoutMs = QUERY_TIMEOUT_MS): Promise<string> {
  const exec = await docker.getContainer(container).exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true
  });
  const stream = (await exec.start({
    hijack: true,
    stdin: false
  })) as Readable;
  const { stdout, stderr } = await collectStream(stream, timeoutMs);

  if (stderr) {
    throw new Error(stderr);
  }

  return stdout;
}

function parseCount(value: string): number {
  const parsed = Number(value.trim());

  return Number.isFinite(parsed) ? parsed : 0;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function querySqliteCount(container: string, sql: string): Promise<number> {
  try {
    const stdout = await execInContainer(container, ['sqlite3', '/home/node/.n8n/database.sqlite', sql]);

    return parseCount(stdout);
  } catch {
    return 0;
  }
}

async function findPostgresContainer(host: string): Promise<string | null> {
  try {
    const containers = await docker.listContainers({ all: true });
    const normalizedHost = host.toLowerCase();
    const postgresContainer = containers.find((container) => {
      const names = (container.Names ?? []).map((name) => name.replace(/^\//, '').toLowerCase());
      const image = container.Image.toLowerCase();

      return names.includes(normalizedHost) || names.some((name) => name.includes(normalizedHost)) || image.includes('postgres');
    });

    return postgresContainer?.Id ?? null;
  } catch {
    return null;
  }
}

async function queryPostgresCount(config: N8nDatabaseConfig, sql: string): Promise<number> {
  const postgresContainer = await findPostgresContainer(config.host);

  if (!postgresContainer) {
    return 0;
  }

  try {
    const command = [
      'sh',
      '-lc',
      `PGPASSWORD=${shellQuote(config.password ?? '')} psql -U ${shellQuote(config.user)} -d ${shellQuote(config.database)} -tAc ${shellQuote(sql)}`
    ];
    const stdout = await execInContainer(postgresContainer, command);

    return parseCount(stdout);
  } catch {
    return 0;
  }
}

async function getN8nCounts(container: string): Promise<{ workflows: number; executions: number }> {
  const env = await inspectContainerEnv(container);
  const dbConfig = getN8nDatabaseConfig(env);
  const queryCount = dbConfig.type === 'postgresdb'
    ? (sql: string) => queryPostgresCount(dbConfig, sql)
    : (sql: string) => querySqliteCount(container, sql);
  const [workflows, executions] = await Promise.all([
    queryCount('select count(*) from workflow_entity;'),
    queryCount('select count(*) from execution_entity;')
  ]);

  return {
    workflows,
    executions
  };
}

export async function getAutomationOverview(): Promise<AutomationResponse> {
  const appsOverview = await getAppsOverview();
  const n8n = Array.isArray(appsOverview) ? findN8nApp(appsOverview) : null;
  const online = n8n?.status === 'running';
  const version = n8n?.version ?? (n8n?.image ? extractVersion(n8n.image) : 'latest');
  const counts = online && n8n && n8n.container ? await getN8nCounts(n8n.container) : { workflows: 0, executions: 0 };

  return {
    name: 'n8n',
    container: 'n8n',
    status: online ? 'running' : 'stopped',
    healthy: n8n?.healthy ?? false,
    online,
    version,
    workflows: counts.workflows,
    executions: counts.executions,
    deployment: {
      environment: process.env.NODE_ENV ?? 'production'
    },
    automation: {
      version,
      workflows: counts.workflows,
      executions: counts.executions
    },
    timestamp: new Date().toISOString()
  };
}
