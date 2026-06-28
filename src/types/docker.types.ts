export type ContainerStatus = 'running' | 'stopped' | 'paused' | 'restarting' | 'dead';

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  version: string;
  status: ContainerStatus;
  cpu: number;
  ram: number;
  uptime: string;
  restartCount: number;
  lastRestart: string | null;
  ports: string[];
  branch?: string;
  commit?: string;
}

export interface DockerUnavailableResponse {
  status: 'unavailable';
  reason: 'permission_denied' | 'socket_not_found' | 'docker_connection_failed';
}

export type DockerResponse = DockerContainer[] | DockerUnavailableResponse;
