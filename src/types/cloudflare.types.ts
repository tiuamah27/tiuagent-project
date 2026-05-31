export interface CloudflareDockerResponse {
  name: 'Cloudflare Tunnel';
  container: string;
  status: string;
  healthy: boolean;
  source: 'docker';
  network: {
    publicAccess: boolean;
  };
  tunnel: {
    status: 'connected' | 'disconnected';
  };
  timestamp: string;
}

export interface CloudflareProcessResponse {
  name: 'Cloudflare Tunnel';
  status: 'running';
  healthy: true;
  source: 'process';
  network: {
    publicAccess: true;
  };
  tunnel: {
    status: 'connected';
  };
  timestamp: string;
}

export interface CloudflareNotFoundResponse {
  status: 'not_found';
}

export type CloudflareResponse = CloudflareDockerResponse | CloudflareProcessResponse | CloudflareNotFoundResponse;
