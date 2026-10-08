/** Provider-neutral Admin v0 discovery contracts. No network calls or secret fields. */
export type DiscoveryProviderStatus = "active" | "degraded" | "unconfigured";
export type DiscoveryResultStatus = "new" | "known" | "candidate" | "unsupported" | "promoted" | "rejected";

export interface DiscoveryProvider {
  id: string;
  name: string;
  status: DiscoveryProviderStatus;
  isDefault: boolean;
  credentialsAvailable: boolean;
  capabilities: string[];
  incident?: string;
}

export interface DiscoveryQuery {
  id: string;
  name: string;
  expression: string;
  providerSelection: "DEFAULT" | string;
  territory: string;
  category: string;
  language: string;
  frequency: string;
  maxResults: number;
  status: "active" | "paused";
  lastExecutionId?: string;
}

export interface DiscoveryExecution {
  id: string;
  queryId: string;
  providerId: string;
  state: "succeeded" | "failed" | "queued";
  startedAt: string;
  observed: number;
  newResults: number;
  knownResults: number;
  incident?: string;
  cost: number | null;
}

export interface DiscoveryResult {
  id: string;
  queryId: string;
  executionId: string;
  providerId: string;
  url: string;
  title: string;
  status: DiscoveryResultStatus;
  observedAt: string;
  observationCount: number;
  sourceId?: string;
}

export interface DiscoverySnapshot {
  providers: DiscoveryProvider[];
  queries: DiscoveryQuery[];
  executions: DiscoveryExecution[];
  results: DiscoveryResult[];
}

export interface DiscoveryRepository {
  getSnapshot(): Promise<DiscoverySnapshot>;
}
