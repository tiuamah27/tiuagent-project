import type { FastifyInstance } from 'fastify';
import { getSystemMetrics } from '../services/system.service.js';
import type { SystemResponse } from '../types/system.types.js';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: SystemResponse }>('/system', async (request) => {
    return getSystemMetrics(request.log);
  });
}
