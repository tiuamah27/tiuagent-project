export interface AutomationResponse {
  name: 'n8n';
  container: 'n8n';
  status: 'running' | 'stopped';
  healthy: boolean;
  online: boolean;
  version: string;
  workflows: number;
  executions: number;
  deployment: {
    environment: string;
  };
  automation: {
    version: string;
    workflows: number;
    executions: number;
  };
  timestamp: string;
}
