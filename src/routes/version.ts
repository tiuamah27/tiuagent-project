import type { FastifyInstance } from 'fastify';
import type { VersionResponse } from '../types/system.types.js';

export async function versionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: VersionResponse }>('/version', async () => {
    return {
      name: 'tiu-agent',
      version: '1.0.0'
    };
  });
}
