import { hostname as osHostname } from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '../types/system.types.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthResponse }>('/health', async () => {
    return {
      status: 'healthy',
      hostname: process.env.SERVER_HOSTNAME ?? osHostname(),
      timestamp: new Date().toISOString()
    };
  });
}
