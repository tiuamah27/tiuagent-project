import type { FastifyInstance } from 'fastify';
import { getAutomationOverview } from '../services/automation.service.js';
import type { AutomationResponse } from '../types/automation.types.js';

export async function automationRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: AutomationResponse }>('/automation', async () => {
    return getAutomationOverview();
  });
}
