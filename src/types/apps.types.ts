export type AppType = 'monitoring' | 'database' | 'automation' | 'tunnel' | 'finance' | 'custom';
export type ContainerStatus = 'running' | 'stopped' | 'paused' | 'restarting' | 'dead';

export interface AppEntity {
  id: string;
  name: string;
  type: AppType;
  version: string;
  status: ContainerStatus;
  url?: string;
  manageUrl?: string;
  container?: string;
  image?: string;
  healthy?: boolean;
  created?: string;
  branch?: string;
  commit?: string;
}

export interface AppsUnavailableResponse {
  status: 'unavailable';
  reason: 'permission_denied' | 'socket_not_found' | 'docker_connection_failed';
}

export type AppsResponse = AppEntity[] | AppsUnavailableResponse;
