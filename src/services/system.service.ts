import { statfs } from 'node:fs/promises';
import { cpus, freemem, totalmem } from 'node:os';
import type { SystemResponse } from '../types/system.types.js';

interface CpuSnapshot {
  idle: number;
  total: number;
}

function roundTo(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function bytesToGiB(bytes: number): number {
  return bytes / 1024 ** 3;
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
  const [cpuUsage, diskStats] = await Promise.all([
    getCpuUsage(),
    statfs('/')
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
    }
  };
}
