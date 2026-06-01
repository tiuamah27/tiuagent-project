export interface HanFinResponse {
  name: 'HanFin';
  container: 'hanfin';
  status: 'running' | 'stopped';
  healthy: boolean;
  version: string;
  branch: string;
  commit: string;
  deployment: {
    environment: string;
  };
  application: {
    version: string;
    branch: string;
    commit: string;
  };
  database: {
    status: string;
  };
  timestamp: string;
}

export interface HanFinActionResponse {
  success: boolean;
  message: string;
  output?: string;
}
