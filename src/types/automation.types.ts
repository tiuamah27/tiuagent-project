export interface AutomationResponse {
  name: 'n8n';
  container: 'n8n';
  status: string;
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
