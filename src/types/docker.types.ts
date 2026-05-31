export interface DockerSummary {
  total: number;
  running: number;
  stopped: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string[];
}

export interface DockerAvailableResponse {
  summary: DockerSummary;
  containers: DockerContainer[];
  timestamp: string;
}

export interface DockerUnavailableResponse {
  status: 'unavailable';
  reason: 'permission_denied' | 'socket_not_found' | 'docker_connection_failed';
}

export type DockerResponse = DockerAvailableResponse | DockerUnavailableResponse;
