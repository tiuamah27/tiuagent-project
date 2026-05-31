import type { FastifyInstance } from 'fastify';
import { getStorageOverview } from '../services/storage.service.js';
import type { StorageResponse } from '../types/storage.types.js';

export async function storageRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: StorageResponse }>('/storage', async (request) => {
    request.log.debug('collecting storage metrics');

    return getStorageOverview();
  });
}
