import { readdir, readFile, statfs } from 'node:fs/promises';
import { cpus, freemem, totalmem } from 'node:os';
import type { SystemResponse } from '../types/system.types.js';

interface CpuSnapshot {
  idle: number;
  total: number;
}

interface NetworkSnapshot {
  timestamp: number;
  rxBytes: number;
  txBytes: number;
}

const NETWORK_INTERFACE_PATH = '/sys/class/net';
const IGNORED_INTERFACE_PATTERNS = [/^lo$/, /^docker/, /^br-/, /^veth/];

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

async function readNetworkCounter(interfaceName: string, counter: 'rx_bytes' | 'tx_bytes'): Promise<number> {
  const value = await readFile(`${NETWORK_INTERFACE_PATH}/${interfaceName}/statistics/${counter}`, 'utf8');
  const parsed = Number(value.trim());

  return Number.isFinite(parsed) ? parsed : 0;
}

async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const interfaces = (await readdir(NETWORK_INTERFACE_PATH)).filter(isUsableNetworkInterface);
  const counters = await Promise.all(
    interfaces.map(async (interfaceName) => {
      const [rxBytes, txBytes] = await Promise.all([
        readNetworkCounter(interfaceName, 'rx_bytes'),
        readNetworkCounter(interfaceName, 'tx_bytes')
      ]);

      return { rxBytes, txBytes };
    })
  );

  return {
    timestamp: Date.now(),
    rxBytes: counters.reduce((sum, counter) => sum + counter.rxBytes, 0),
    txBytes: counters.reduce((sum, counter) => sum + counter.txBytes, 0)
  };
}

async function getNetworkThroughput(): Promise<SystemResponse['network']> {
  try {
    const current = await getNetworkSnapshot();
    const previous = previousNetworkSnapshot;
    previousNetworkSnapshot = current;

    if (!previous) {
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
