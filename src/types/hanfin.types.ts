export interface HanFinResponse {
  name: 'HanFin';
  container: 'hanfin';
  status: 'running' | 'stopped';
  healthy: boolean;
  deployment: {
    environment: string;
  };
  application: {
    version: 'unknown';
    branch: 'unknown';
    commit: 'unknown';
  };
  database: {
    status: 'unavailable';
  };
  timestamp: string;
}
