import { getBackupsOverview } from './backups.service.js';
import { getCloudflareOverview } from './cloudflare.service.js';
import { getDockerOverview } from './docker.service.js';
import { getHanFinOverview } from './hanfin.service.js';
import { getInfrastructureOverview } from './infrastructure.service.js';
import type { ActivityEvent, ActivityResponse } from '../types/activity.types.js';

const ACTIVITY_LIMIT = 20;

function createEvent(type: ActivityEvent['type'], title: string, status: ActivityEvent['status']): ActivityEvent {
  return {
    timestamp: new Date().toISOString(),
    type,
    title,
    status
  };
}

export async function getActivityFeed(): Promise<ActivityResponse> {
  const [docker, cloudflare, hanfin, backups, infrastructure] = await Promise.all([
    getDockerOverview(),
    getCloudflareOverview(),
    getHanFinOverview(),
    getBackupsOverview(),
    getInfrastructureOverview()
  ]);
  const events: ActivityEvent[] = [];

  if ('containers' in docker) {
    for (const container of docker.containers) {
      events.push(
        createEvent(
          'docker',
          `Docker Container ${container.status === 'running' ? 'Running' : 'Stopped'}: ${container.name}`,
          container.status === 'running' ? 'success' : 'warning'
        )
      );
    }
  } else {
    events.push(createEvent('docker', 'Docker Unavailable', 'error'));
  }

  if ('source' in cloudflare) {
    events.push(
      createEvent(
        'cloudflare',
        cloudflare.healthy ? 'Cloudflare Connected' : 'Cloudflare Disconnected',
        cloudflare.healthy ? 'success' : 'warning'
      )
    );
  }

  events.push(
    createEvent(
      'hanfin',
      hanfin.status === 'running' ? 'HanFin Online' : 'HanFin Offline',
      hanfin.status === 'running' ? 'success' : 'warning'
    )
  );

  for (const location of backups.locations.filter((location) => location.exists)) {
    events.push(createEvent('backup', `Backup Directory Found: ${location.path}`, 'success'));
  }

  events.push(
    createEvent(
      'infrastructure',
      `Infrastructure Online: ${infrastructure.docker.running} containers running`,
      infrastructure.docker.status === 'online' ? 'success' : 'warning'
    )
  );

  return {
    events: events.slice(0, ACTIVITY_LIMIT),
    timestamp: new Date().toISOString()
  };
}
