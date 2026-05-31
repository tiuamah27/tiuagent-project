import type { FastifyInstance } from 'fastify';
import type { RootResponse } from '../types/system.types.js';

export async function rootRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: RootResponse }>('/', async () => {
    return {
      service: 'TiuAgent',
      version: '0.1.0',
      status: 'online'
    };
  });
}
