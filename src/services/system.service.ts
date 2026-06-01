import { access, lstat, readdir, readFile, statfs } from 'node:fs/promises';
import { cpus, freemem, totalmem } from 'node:os';
import type { SystemResponse } from '../types/system.types.js';

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

async function getNetworkThroughput(): Promise<SystemResponse['network']> {
  try {
    const current = await getNetworkSnapshot();
    const previous = previousNetworkSnapshot;
    previousNetworkSnapshot = current;

    if (!previous || previous.statsPath !== current.statsPath || previous.interfaceName !== current.interfaceName) {
      return {
        downloadMbps: 0,
        uploadMbps: 0
      };
    }

    const seconds = (current.timestamp - previous.timestamp) / 1000;

    if (seconds <= 0) {
      return {
        downloadMbps: 0,
        uploadMbps: 0
      };
    }

    const rxDelta = Math.max(0, current.rxBytes - previous.rxBytes);
    const txDelta = Math.max(0, current.txBytes - previous.txBytes);

    return {
      downloadMbps: roundTo(((rxDelta * 8) / seconds) / 1_000_000),
      uploadMbps: roundTo(((txDelta * 8) / seconds) / 1_000_000)
    };
  } catch {
    return {
      downloadMbps: 0,
      uploadMbps: 0
    };
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

export async function getSystemMetrics(): Promise<SystemResponse> {
  const [cpuUsage, diskStats, network] = await Promise.all([
    getCpuUsage(),
    statfs('/'),
    getNetworkThroughput()
  ]);

  const memoryTotal = totalmem();
  const memoryUsed = memoryTotal - freemem();
  const diskTotal = Number(diskStats.blocks) * Number(diskStats.bsize);
  const diskFree = Number(diskStats.bfree) * Number(diskStats.bsize);
  const diskUsed = diskTotal - diskFree;

  return {
    cpu: {
      usage: cpuUsage
    },
    memory: {
      used: roundTo(bytesToGiB(memoryUsed)),
      total: roundTo(bytesToGiB(memoryTotal))
    },
    disk: {
      used: Math.round(bytesToGiB(diskUsed)),
      total: Math.round(bytesToGiB(diskTotal))
    },
    network: {
      downloadMbps: network.downloadMbps,
      uploadMbps: network.uploadMbps
    }
  };
}
