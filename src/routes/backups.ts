import type { FastifyInstance } from 'fastify';
import { getBackupsOverview } from '../services/backups.service.js';
import type { BackupsResponse } from '../types/backups.types.js';

export async function backupsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: BackupsResponse }>('/backups', async () => {
    return getBackupsOverview();
  });
}
