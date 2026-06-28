export type ActivityLevel = 'success' | 'warning' | 'error' | 'info';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  level: ActivityLevel;
  source: string;
  message: string;
}

export type ActivityResponse = ActivityEvent[];
