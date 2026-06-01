import type { FastifyInstance } from 'fastify';
import { getActivityFeed } from '../services/activity.service.js';
import type { ActivityResponse } from '../types/activity.types.js';

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: ActivityResponse }>('/activity', async () => {
    return getActivityFeed();
  });
}
