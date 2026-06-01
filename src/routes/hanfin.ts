import type { FastifyInstance } from 'fastify';
import { getHanFinOverview, runHanFinAction } from '../services/hanfin.service.js';
import type { HanFinActionResponse, HanFinResponse } from '../types/hanfin.types.js';

export async function hanfinRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HanFinResponse }>('/hanfin', async () => {
    return getHanFinOverview();
  });

  app.post<{ Reply: HanFinActionResponse }>('/hanfin/pull', async () => {
    return runHanFinAction('pull');
  });

  app.post<{ Reply: HanFinActionResponse }>('/hanfin/restart', async () => {
    return runHanFinAction('restart');
  });

  app.post<{ Reply: HanFinActionResponse }>('/hanfin/deploy', async () => {
    return runHanFinAction('deploy');
  });
}
