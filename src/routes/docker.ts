import type { FastifyInstance } from 'fastify';
import { getDockerOverview, getContainerDetails, startContainer, stopContainer, restartContainer, getContainerLogs } from '../services/docker.service.js';
import type { DockerResponse } from '../types/docker.types.js';

export async function dockerRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: DockerResponse }>('/docker', async (request) => {
    const response = await getDockerOverview();

    if ('status' in response && response.status === 'unavailable') {
      request.log.warn({ reason: response.reason }, 'docker engine unavailable');
    }

    return response;
  });

  app.get<{ Params: { id: string } }>('/docker/:id/details', async (request, reply) => {
    try {
      const details = await getContainerDetails(request.params.id);
      return details;
    } catch (e: any) {
      reply.status(404).send({ error: e.message || 'Container not found' });
    }
  });

  app.get<{ Params: { id: string } }>('/docker/:id/start', async (request, reply) => {
    try {
      const response = await startContainer(request.params.id);
      return response;
    } catch (e: any) {
      reply.status(500).send({ error: e.message || 'Failed to start' });
    }
  });

  app.get<{ Params: { id: string } }>('/docker/:id/stop', async (request, reply) => {
    try {
      const response = await stopContainer(request.params.id);
      return response;
    } catch (e: any) {
      reply.status(500).send({ error: e.message || 'Failed to stop' });
    }
  });

  app.get<{ Params: { id: string } }>('/docker/:id/restart', async (request, reply) => {
    try {
      const response = await restartContainer(request.params.id);
      return response;
    } catch (e: any) {
      reply.status(500).send({ error: e.message || 'Failed to restart' });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { tail?: string } }>('/docker/:id/logs', async (request, reply) => {
    try {
      const tail = parseInt(request.query.tail || '100', 10);
      const logs = await getContainerLogs(request.params.id, tail);
      return logs;
    } catch (e: any) {
      reply.status(500).send({ error: e.message || 'Failed to fetch logs' });
    }
  });
}
