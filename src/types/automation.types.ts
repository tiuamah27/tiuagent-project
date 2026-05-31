export interface AutomationResponse {
  name: 'n8n';
  container: 'n8n';
  status: 'running' | 'stopped';
  healthy: boolean;
  deployment: {
    environment: string;
  };
  automation: {
    version: 'unknown';
    workflows: 'unknown';
    executions: 'unknown';
  };
  timestamp: string;
}
