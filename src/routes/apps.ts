import type { FastifyInstance } from 'fastify';
import { getAppsOverview } from '../services/apps.service.js';
import type { AppsResponse } from '../types/apps.types.js';

export async function appsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: AppsResponse }>('/apps', async (request) => {
    const response = await getAppsOverview();

    if ('status' in response && response.status === 'unavailable') {
      request.log.warn({ reason: response.reason }, 'apps source unavailable');
    }

    return response;
  });
}
