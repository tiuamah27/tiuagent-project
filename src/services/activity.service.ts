import { getDockerOverview } from './docker.service.js';
import { getSystemMetrics } from './system.service.js';
import type { ActivityEvent, ActivityResponse, ActivityLevel } from '../types/activity.types.js';
import fs from 'node:fs';
import path from 'node:path';

const ACTIVITY_LIMIT = 100;
const DB_PATH = path.join(process.cwd(), 'activity.json');

// ── Thresholds ────────────────────────────────────────────────
const CPU_SPIKE_THRESHOLD = 90;      // Alert if CPU > 90%
const RAM_SPIKE_THRESHOLD = 90;      // Alert if RAM > 90%
const DISK_WARNING_THRESHOLD = 85;   // Alert if Disk > 85%
const DISK_CRITICAL_THRESHOLD = 95;  // Critical if Disk > 95%

// Cooldowns prevent repeated alerts (in ms)
const SPIKE_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes between same alert type

// ── In-memory state tracking ──────────────────────────────────
let lastKnownContainerState: Record<string, string> = {};
let lastKnownImages: Set<string> = new Set();
let eventsCache: ActivityEvent[] = [];
let isFirstCheck = true;

// Cooldown trackers (timestamp of last alert per type)
let lastCpuAlert = 0;
let lastRamAlert = 0;
let lastDiskWarning = 0;
let lastDiskCritical = 0;

// Previous system state for tracking recovery
let wasCpuHigh = false;
let wasRamHigh = false;
let wasDiskWarning = false;
let wasDiskCritical = false;

// ── Load existing events on startup ──────────────────────────
try {
  if (fs.existsSync(DB_PATH)) {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    eventsCache = JSON.parse(data);
  } else {
    eventsCache.push(createEvent('system', 'TiuAgent started — monitoring active', 'info'));
    saveEvents();
  }
} catch (e) {
  console.error('Failed to load activity DB:', e);
}

// ── Helpers ───────────────────────────────────────────────────
function saveEvents() {
  try {
    if (eventsCache.length > ACTIVITY_LIMIT) {
      eventsCache = eventsCache.slice(0, ACTIVITY_LIMIT);
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(eventsCache, null, 2));
  } catch (e) {
    console.error('Failed to save activity DB:', e);
  }
}

function createEvent(source: string, message: string, level: ActivityLevel): ActivityEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    source,
    message,
    level
  };
}

function canAlert(lastTime: number): boolean {
  return Date.now() - lastTime > SPIKE_COOLDOWN_MS;
}

function pushEvent(source: string, message: string, level: ActivityLevel) {
  eventsCache.unshift(createEvent(source, message, level));
}

// ── Docker Monitoring ─────────────────────────────────────────
async function checkDocker(): Promise<boolean> {
  const docker = await getDockerOverview();
  let hasNew = false;

  if (!Array.isArray(docker)) return false;

  // First check: silently initialize state
  if (isFirstCheck) {
    for (const c of docker) {
      lastKnownContainerState[c.name] = c.status;
      lastKnownImages.add(c.image);
    }
    isFirstCheck = false;
    return false;
  }

  const currentNames = new Set(docker.map(c => c.name));
  const currentImages = new Set(docker.map(c => c.image));

  // 1. Detect removed containers
  for (const name of Object.keys(lastKnownContainerState)) {
    if (!currentNames.has(name)) {
      pushEvent(name, 'Container was removed/deleted', 'error');
      delete lastKnownContainerState[name];
      hasNew = true;
    }
  }

  // 2. Detect status changes & new containers
  for (const c of docker) {
    const prev = lastKnownContainerState[c.name];
    if (prev !== c.status) {
      if (!prev) {
        pushEvent(c.name, `New container created (${c.status})`, c.status === 'running' ? 'success' : 'info');
      } else {
        pushEvent(
          c.name,
          `Status changed: ${prev} → ${c.status}`,
          c.status === 'running' ? 'success' : ((c.status === 'stopped' || c.status === 'dead') ? 'error' : 'warning')
        );
      }
      lastKnownContainerState[c.name] = c.status;
      hasNew = true;
    }
  }

  // 3. Detect new Docker images (image pull/update)
  for (const img of currentImages) {
    if (!lastKnownImages.has(img)) {
      pushEvent('docker', `New image detected: ${img}`, 'info');
      hasNew = true;
    }
  }
  // Detect removed images
  for (const img of lastKnownImages) {
    if (!currentImages.has(img)) {
      pushEvent('docker', `Image no longer in use: ${img}`, 'info');
      hasNew = true;
    }
  }
  lastKnownImages = currentImages;

  // 4. Detect container restart (restartCount increase)
  for (const c of docker) {
    if (c.restartCount > 0 && c.status === 'running') {
      const uptimeParts = c.uptime.match(/(\d+)m/);
      if (uptimeParts && parseInt(uptimeParts[1]) <= 2) {
        // Container restarted very recently (within 2 minutes)
        pushEvent(c.name, `Container restarted (restart #${c.restartCount})`, 'warning');
        hasNew = true;
      }
    }
  }

  return hasNew;
}

// ── System Resource Monitoring ────────────────────────────────
async function checkSystemResources(): Promise<boolean> {
  let hasNew = false;

  try {
    const metrics = await getSystemMetrics();

    // CPU Spike Detection
    if (metrics.cpu >= CPU_SPIKE_THRESHOLD) {
      if (!wasCpuHigh && canAlert(lastCpuAlert)) {
        pushEvent('cpu', `CPU usage spike: ${metrics.cpu}%`, 'warning');
        lastCpuAlert = Date.now();
        wasCpuHigh = true;
        hasNew = true;
      }
    } else if (wasCpuHigh && metrics.cpu < CPU_SPIKE_THRESHOLD - 10) {
      pushEvent('cpu', `CPU usage returned to normal: ${metrics.cpu}%`, 'success');
      wasCpuHigh = false;
      hasNew = true;
    }

    // RAM Spike Detection
    if (metrics.ram.percent >= RAM_SPIKE_THRESHOLD) {
      if (!wasRamHigh && canAlert(lastRamAlert)) {
        pushEvent('memory', `RAM usage high: ${metrics.ram.percent}% (${metrics.ram.used}/${metrics.ram.total} GB)`, 'warning');
        lastRamAlert = Date.now();
        wasRamHigh = true;
        hasNew = true;
      }
    } else if (wasRamHigh && metrics.ram.percent < RAM_SPIKE_THRESHOLD - 10) {
      pushEvent('memory', `RAM usage returned to normal: ${metrics.ram.percent}%`, 'success');
      wasRamHigh = false;
      hasNew = true;
    }

    // Disk Space Monitoring
    if (metrics.disk.percent >= DISK_CRITICAL_THRESHOLD) {
      if (!wasDiskCritical && canAlert(lastDiskCritical)) {
        pushEvent('disk', `⚠ CRITICAL: Disk almost full! ${metrics.disk.percent}% (${metrics.disk.used}/${metrics.disk.total} GB)`, 'error');
        lastDiskCritical = Date.now();
        wasDiskCritical = true;
        hasNew = true;
      }
    } else if (metrics.disk.percent >= DISK_WARNING_THRESHOLD) {
      if (!wasDiskWarning && canAlert(lastDiskWarning)) {
        pushEvent('disk', `Disk usage high: ${metrics.disk.percent}% (${metrics.disk.used}/${metrics.disk.total} GB)`, 'warning');
        lastDiskWarning = Date.now();
        wasDiskWarning = true;
        hasNew = true;
      }
    } else {
      if (wasDiskWarning || wasDiskCritical) {
        pushEvent('disk', `Disk usage returned to normal: ${metrics.disk.percent}%`, 'success');
        wasDiskWarning = false;
        wasDiskCritical = false;
        hasNew = true;
      }
    }
  } catch (e) {
    // System metrics may fail; silently skip
  }

  return hasNew;
}

// ── Main Activity Feed ────────────────────────────────────────
export async function getActivityFeed(): Promise<ActivityResponse> {
  const [dockerChanged, systemChanged] = await Promise.all([
    checkDocker(),
    checkSystemResources(),
  ]);

  if (dockerChanged || systemChanged) {
    saveEvents();
  }

  return eventsCache;
}
