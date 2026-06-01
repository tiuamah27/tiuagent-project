export type ActivityEventType = 'docker' | 'health' | 'infrastructure' | 'backup' | 'cloudflare' | 'hanfin';
export type ActivityEventStatus = 'success' | 'warning' | 'error' | 'info';

export interface ActivityEvent {
  timestamp: string;
  type: ActivityEventType;
  title: string;
  status: ActivityEventStatus;
}

export interface ActivityResponse {
  events: ActivityEvent[];
  timestamp: string;
}
