export interface RootResponse {
  service: 'TiuAgent';
  version: '0.1.0';
  status: 'online';
}

export interface VersionResponse {
  name: 'tiu-agent';
  version: '0.1.0';
}

export interface HealthResponse {
  status: 'healthy';
  hostname: string;
  timestamp: string;
}

export interface SystemResponse {
  cpu: {
    usage: number;
  };
  memory: {
    used: number;
    total: number;
  };
  disk: {
    used: number;
    total: number;
  };
}
