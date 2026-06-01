export type AppType = 'application' | 'automation' | 'database' | 'infrastructure' | 'monitoring' | 'system' | 'custom';

export interface AppsSummary {
  total: number;
  running: number;
  stopped: number;
}

export interface AppEntity {
  name: string;
  container: string;
  type: AppType;
  status: string;
  healthy: boolean;
  image: string;
  version: string;
  url: string;
  manageUrl: string;
  created: string;
}

export interface AppsAvailableResponse {
  summary: AppsSummary;
  apps: AppEntity[];
  timestamp: string;
}

export interface AppsUnavailableResponse {
  status: 'unavailable';
  reason: 'permission_denied' | 'socket_not_found' | 'docker_connection_failed';
}

export type AppsResponse = AppsAvailableResponse | AppsUnavailableResponse;
