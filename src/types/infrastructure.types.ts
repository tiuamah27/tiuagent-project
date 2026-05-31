export interface InfrastructureResponse {
  server: {
    hostname: string;
    status: 'online';
  };
  system: {
    cpu: {
      usage: number;
    };
    memory: {
      used: number;
      total: number;
    };
  };
  storage: {
    usedPercent: number;
  };
  docker: {
    status: 'online' | 'unavailable';
    containers: number;
    running: number;
  };
  applications: {
    total: number;
    healthy: number;
  };
  timestamp: string;
}
