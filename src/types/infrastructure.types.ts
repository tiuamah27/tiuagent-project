import type { SystemResponse } from './system.types.js';

export interface InfrastructureResponse {
  server: SystemResponse;
  containersRunning: number;
  containersTotal: number;
  appsHealthy: number;
  appsTotal: number;
  storagePercent: number;
}
