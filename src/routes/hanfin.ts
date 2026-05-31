import type { FastifyInstance } from 'fastify';
import { getHanFinOverview } from '../services/hanfin.service.js';
import type { HanFinResponse } from '../types/hanfin.types.js';

export async function hanfinRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HanFinResponse }>('/hanfin', async () => {
    return getHanFinOverview();
  });
}
