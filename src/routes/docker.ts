import type { FastifyInstance } from 'fastify';
import { getDockerOverview } from '../services/docker.service.js';
import type { DockerResponse } from '../types/docker.types.js';

export async function dockerRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: DockerResponse }>('/docker', async (request) => {
    const response = await getDockerOverview();

    if ('status' in response && response.status === 'unavailable') {
      request.log.warn({ reason: response.reason }, 'docker engine unavailable');
    }

    return response;
  });
}
