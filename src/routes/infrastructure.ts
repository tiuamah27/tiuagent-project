import type { FastifyInstance } from 'fastify';
import { getInfrastructureOverview } from '../services/infrastructure.service.js';
import type { InfrastructureResponse } from '../types/infrastructure.types.js';

export async function infrastructureRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: InfrastructureResponse }>('/infrastructure', async () => {
    return getInfrastructureOverview();
  });
}
