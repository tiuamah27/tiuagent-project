export interface RootResponse {
  service: 'TiuAgent';
  version: '1.0.0';
  status: 'online';
}

export interface VersionResponse {
  name: 'tiu-agent';
  version: '1.0.0';
}

export interface HealthResponse {
  status: 'healthy';
  hostname: string;
  timestamp: string;
}

export interface SystemResponse {
  cpu: number;
  cpuInfo?: { cores: number; ghz: number };
  ram: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number };
  network: { download: number; upload: number };
  uptime: string;
  hostname: string;
  os?: string;
  loadAvg?: [number, number, number];
}
