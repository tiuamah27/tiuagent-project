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
}

export type DockerResponse = DockerAvailableResponse | DockerUnavailableResponse;
