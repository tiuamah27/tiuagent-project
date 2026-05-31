import type { FastifyInstance } from 'fastify';
import { getCloudflareOverview } from '../services/cloudflare.service.js';
import type { CloudflareResponse } from '../types/cloudflare.types.js';

export async function cloudflareRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: CloudflareResponse }>('/cloudflare', async () => {
    return getCloudflareOverview();
  });
}
