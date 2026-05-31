export interface HanFinResponse {
  name: 'HanFin';
  container: 'hanfin';
  status: string;
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
    status: 'unknown';
  };
  timestamp: string;
}
