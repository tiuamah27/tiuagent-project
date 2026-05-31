export interface CloudflareAvailableResponse {
  name: 'Cloudflare Tunnel';
  container: string;
  status: string;
  healthy: boolean;
  network: {
    publicAccess: boolean;
  };
  tunnel: {
    status: 'connected' | 'disconnected';
  };
  timestamp: string;
}

export interface CloudflareNotFoundResponse {
  status: 'not_found';
}

export type CloudflareResponse = CloudflareAvailableResponse | CloudflareNotFoundResponse;
