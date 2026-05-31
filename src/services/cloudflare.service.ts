import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getAppsOverview } from './apps.service.js';
import type { AppEntity } from '../types/apps.types.js';
import type { CloudflareResponse } from '../types/cloudflare.types.js';

const execFileAsync = promisify(execFile);
const CLOUDFLARE_CONTAINERS = ['cloudflared', 'cloudflare', 'cloudflare-tunnel'];

function findCloudflareTunnelApp(apps: AppEntity[]): AppEntity | null {
  return apps.find((app) => CLOUDFLARE_CONTAINERS.includes(app.container)) ?? null;
}

async function isCloudflaredProcessRunning(): Promise<boolean> {
  try {
    await execFileAsync('pgrep', ['-x', 'cloudflared'], {
      timeout: 2000,
      windowsHide: true
    });

    return true;
  } catch {
    return false;
  }
}

export async function getCloudflareOverview(): Promise<CloudflareResponse> {
  const appsOverview = await getAppsOverview();
  const cloudflareTunnel = 'apps' in appsOverview ? findCloudflareTunnelApp(appsOverview.apps) : null;

  if (!cloudflareTunnel) {
    const processRunning = await isCloudflaredProcessRunning();

    if (processRunning) {
      return {
        name: 'Cloudflare Tunnel',
        status: 'running',
        healthy: true,
        source: 'process',
        network: {
          publicAccess: true
        },
        tunnel: {
          status: 'connected'
        },
        timestamp: new Date().toISOString()
      };
    }

    return {
      status: 'not_found'
    };
  }

  const healthy = cloudflareTunnel.status === 'running';

  return {
    name: 'Cloudflare Tunnel',
    container: cloudflareTunnel.container,
    status: cloudflareTunnel.status,
    healthy,
    source: 'docker',
    network: {
      publicAccess: healthy
    },
    tunnel: {
      status: healthy ? 'connected' : 'disconnected'
    },
    timestamp: new Date().toISOString()
  };
}
