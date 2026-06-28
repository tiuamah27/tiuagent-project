import { access, lstat, readdir, readFile, statfs } from 'node:fs/promises';
import { cpus, freemem, hostname, loadavg, totalmem, uptime } from 'node:os';
import type { SystemResponse } from '../types/system.types.js';

interface Logger {
  info(bindings: Record<string, unknown>, message: string): void;
}

interface CpuSnapshot {
  idle: number;
  total: number;
}

interface NetworkSnapshot {
  timestamp: number;
  statsPath: string;
  interfaceName: string;
  rxBytes: number;
  txBytes: number;
}

const HOST_NETWORK_INTERFACE_PATH = '/host/sys/class/net';
const CONTAINER_NETWORK_INTERFACE_PATH = '/sys/class/net';
const IGNORED_INTERFACE_PATTERNS = [/^lo$/, /^docker/, /^br-/, /^veth/];
const PREFERRED_INTERFACE_NAMES = ['eno1', 'eth0'];

let previousNetworkSnapshot: NetworkSnapshot | null = null;

function roundTo(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function bytesToGiB(bytes: number): number {
  return bytes / 1024 ** 3;
}

function logNetworkDebug(
  logger: Logger | undefined,
  current: NetworkSnapshot,
  previous: NetworkSnapshot | null,
  deltaSeconds: number,
  deltaRx: number,
  deltaTx: number,
  downloadMbps: number,
  uploadMbps: number
): void {
  logger?.info(
    {
      selectedInterface: current.interfaceName,
      rxBytes: current.rxBytes,
      txBytes: current.txBytes,
      previousRxBytes: previous?.rxBytes ?? null,
      previousTxBytes: previous?.txBytes ?? null,
      deltaRx,
      deltaTx,
      deltaSeconds,
      downloadMbps,
      uploadMbps
    },
    'NETWORK DEBUG'
  );
}

function isUsableNetworkInterface(name: string): boolean {
  return !IGNORED_INTERFACE_PATTERNS.some((pattern) => pattern.test(name));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function getNetworkStatsPath(): Promise<string> {
  return (await pathExists(HOST_NETWORK_INTERFACE_PATH)) ? HOST_NETWORK_INTERFACE_PATH : CONTAINER_NETWORK_INTERFACE_PATH;
}

async function readNetworkCounter(
  statsPath: string,
  interfaceName: string,
  counter: 'rx_bytes' | 'tx_bytes'
): Promise<number> {
  const value = await readFile(`${statsPath}/${interfaceName}/statistics/${counter}`, 'utf8');
  const parsed = Number(value.trim());

  return Number.isFinite(parsed) ? parsed : 0;
}

async function isPhysicalInterface(statsPath: string, interfaceName: string): Promise<boolean> {
  try {
    await lstat(`${statsPath}/${interfaceName}/device`);
    return true;
  } catch {
    return false;
  }
}

async function isInterfaceUp(statsPath: string, interfaceName: string): Promise<boolean> {
  try {
    const state = await readFile(`${statsPath}/${interfaceName}/operstate`, 'utf8');
    return state.trim() === 'up';
  } catch {
    return false;
  }
}

async function getFirstPhysicalUpInterface(statsPath: string, interfaces: string[]): Promise<string | null> {
  for (const interfaceName of interfaces) {
    const [isPhysical, isUp] = await Promise.all([
      isPhysicalInterface(statsPath, interfaceName),
      isInterfaceUp(statsPath, interfaceName)
    ]);

    if (isPhysical && isUp) {
      return interfaceName;
    }
  }

  return null;
}

async function getBestAvailableInterface(statsPath: string, interfaces: string[]): Promise<string | null> {
  const ranked = await Promise.all(
    interfaces.map(async (interfaceName) => ({
      interfaceName,
      isPhysical: await isPhysicalInterface(statsPath, interfaceName),
      isUp: await isInterfaceUp(statsPath, interfaceName)
    }))
  );

  ranked.sort((left, right) => {
    if (left.isUp !== right.isUp) {
      return left.isUp ? -1 : 1;
    }

    if (left.isPhysical !== right.isPhysical) {
      return left.isPhysical ? -1 : 1;
    }

    return left.interfaceName.localeCompare(right.interfaceName);
  });

  return ranked[0]?.interfaceName ?? null;
}

function getPreferredInterface(interfaces: string[]): string | null {
  return PREFERRED_INTERFACE_NAMES.find((interfaceName) => interfaces.includes(interfaceName)) ?? null;
}

async function getPrimaryNetworkInterface(statsPath: string): Promise<string | null> {
  const interfaces = (await readdir(statsPath)).filter(isUsableNetworkInterface);

  if (interfaces.length === 0) {
    return null;
  }

  return (
    getPreferredInterface(interfaces) ??
    (await getFirstPhysicalUpInterface(statsPath, interfaces)) ??
    getBestAvailableInterface(statsPath, interfaces)
  );
}

async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const statsPath = await getNetworkStatsPath();
  const interfaceName = await getPrimaryNetworkInterface(statsPath);

  if (!interfaceName) {
    return {
      timestamp: Date.now(),
      statsPath,
      interfaceName: 'unavailable',
      rxBytes: 0,
      txBytes: 0
    };
  }

  const [rxBytes, txBytes] = await Promise.all([
    readNetworkCounter(statsPath, interfaceName, 'rx_bytes'),
    readNetworkCounter(statsPath, interfaceName, 'tx_bytes')
  ]);

  return {
    timestamp: Date.now(),
    statsPath,
    interfaceName,
    rxBytes,
    txBytes
  };
}

async function getNetworkThroughput(logger?: Logger): Promise<{ download: number; upload: number }> {
  try {
    const current = await getNetworkSnapshot();
    const previous = previousNetworkSnapshot;
    previousNetworkSnapshot = current;

    if (!previous || previous.statsPath !== current.statsPath || previous.interfaceName !== current.interfaceName) {
      logNetworkDebug(logger, current, previous, 0, 0, 0, 0, 0);

      return {
        download: 0,
        upload: 0
      };
    }

    const seconds = (current.timestamp - previous.timestamp) / 1000;

    if (seconds <= 0) {
      logNetworkDebug(logger, current, previous, seconds, 0, 0, 0, 0);

      return {
        download: 0,
        upload: 0
      };
    }

    const rxDelta = Math.max(0, current.rxBytes - previous.rxBytes);
    const txDelta = Math.max(0, current.txBytes - previous.txBytes);
    const download = Number((((rxDelta * 8) / seconds) / 1_000_000).toFixed(2));
    const upload = Number((((txDelta * 8) / seconds) / 1_000_000).toFixed(2));

    logNetworkDebug(logger, current, previous, seconds, rxDelta, txDelta, download, upload);

    return { download, upload };
  } catch (error) {
    logger?.info(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      'NETWORK ERROR'
    );

    return { download: 0, upload: 0 };
  }
}

function getCpuSnapshot(): CpuSnapshot {
  return cpus().reduce<CpuSnapshot>(
    (snapshot, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0);

      return {
        idle: snapshot.idle + cpu.times.idle,
        total: snapshot.total + total
      };
    },
    { idle: 0, total: 0 }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getCpuUsage(): Promise<number> {
  const start = getCpuSnapshot();
  await sleep(100);
  const end = getCpuSnapshot();

  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;

  if (totalDelta <= 0) {
    return 0;
  }

  return Math.round((1 - idleDelta / totalDelta) * 100);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

async function getOsInfo(): Promise<string | undefined> {
  try {
    const content = await readFile('/etc/os-release', 'utf8');
    const match = content.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    return match?.[1] ?? undefined;
  } catch {
    return undefined;
  }
}

function getCpuInfo(): { cores: number; ghz: number } {
  const allCpus = cpus();
  const cores = allCpus.length;
  const ghz = cores > 0 ? roundTo(allCpus[0].speed / 1000, 1) : 0;
  return { cores, ghz };
}

export async function getSystemMetrics(logger?: Logger): Promise<SystemResponse> {
  const [cpuUsage, diskStats, network, osInfo] = await Promise.all([
    getCpuUsage(),
    statfs('/'),
    getNetworkThroughput(logger),
    getOsInfo()
  ]);

  const memoryTotal = totalmem();
  const memoryUsed = memoryTotal - freemem();
  const diskTotal = Number(diskStats.blocks) * Number(diskStats.bsize);
  const diskFree = Number(diskStats.bfree) * Number(diskStats.bsize);
  const diskUsed = diskTotal - diskFree;

  const memTotalGB = roundTo(bytesToGiB(memoryTotal));
  const memUsedGB = roundTo(bytesToGiB(memoryUsed));
  const diskTotalGB = Math.round(bytesToGiB(diskTotal));
  const diskUsedGB = Math.round(bytesToGiB(diskUsed));

  const la = loadavg();

  return {
    cpu: cpuUsage,
    cpuInfo: getCpuInfo(),
    ram: {
      used: memUsedGB,
      total: memTotalGB,
      percent: memTotalGB > 0 ? roundTo((memUsedGB / memTotalGB) * 100) : 0
    },
    disk: {
      used: diskUsedGB,
      total: diskTotalGB,
      percent: diskTotalGB > 0 ? roundTo((diskUsedGB / diskTotalGB) * 100) : 0
    },
    network,
    uptime: formatUptime(uptime()),
    hostname: hostname(),
    os: osInfo,
    loadAvg: [roundTo(la[0], 2), roundTo(la[1], 2), roundTo(la[2], 2)]
  };
}
