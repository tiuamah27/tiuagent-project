import { getAppsOverview } from './apps.service.js';
import type { AppEntity } from '../types/apps.types.js';
import type { CloudflareResponse } from '../types/cloudflare.types.js';

const CLOUDFLARE_CONTAINERS = ['cloudflared', 'cloudflare', 'cloudflare-tunnel'];

function findCloudflareTunnelApp(apps: AppEntity[]): AppEntity | null {
  return apps.find((app) => CLOUDFLARE_CONTAINERS.includes(app.container)) ?? null;
}

export async function getCloudflareOverview(): Promise<CloudflareResponse> {
  const appsOverview = await getAppsOverview();
  const cloudflareTunnel = 'apps' in appsOverview ? findCloudflareTunnelApp(appsOverview.apps) : null;

  if (!cloudflareTunnel) {
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
    network: {
      publicAccess: healthy
    },
    tunnel: {
      status: healthy ? 'connected' : 'disconnected'
    },
    timestamp: new Date().toISOString()
  };
}
