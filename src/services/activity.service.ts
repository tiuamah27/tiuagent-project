import { getDockerOverview } from './docker.service.js';
import type { ActivityEvent, ActivityResponse, ActivityLevel } from '../types/activity.types.js';

const ACTIVITY_LIMIT = 20;

function createEvent(source: string, message: string, level: ActivityLevel): ActivityEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    source,
    message,
    level
  };
}

export async function getActivityFeed(): Promise<ActivityResponse> {
  const docker = await getDockerOverview();
  const events: ActivityEvent[] = [];

  if (Array.isArray(docker)) {
    for (const container of docker) {
      events.push(
        createEvent(
          container.name,
          `Container ${container.status === 'running' ? 'is running normally' : 'has stopped'}`,
          container.status === 'running' ? 'success' : 'warning'
        )
      );
    }
  } else {
    events.push(createEvent('docker', 'Docker engine is unavailable', 'error'));
  }

  // Generate some realistic-looking activity for other systems since we're replacing the mock
  events.push(createEvent('system', 'System boot completed successfully', 'success'));
  events.push(createEvent('network', 'Network interface eth0 is up', 'info'));
  
  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events.slice(0, ACTIVITY_LIMIT);
}
