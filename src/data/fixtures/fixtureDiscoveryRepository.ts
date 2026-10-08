import type { DiscoveryRepository, DiscoverySnapshot } from "@/domain/discovery";

/** Explicit demo scenarios: NOT observations from the dataset or live search-provider calls. */
const snapshot: DiscoverySnapshot = {
  providers: [
    {
      id: "provider-primary",
      name: "Proveedor web principal",
      isDefault: true,
      status: "active",
      credentialsAvailable: true,
      capabilities: ["búsqueda web", "URLs canónicas"],
    },
    {
      id: "provider-secondary",
      name: "Proveedor alternativo",
      isDefault: false,
      status: "degraded",
      credentialsAvailable: false,
      capabilities: ["búsqueda web"],
      incident: "Sin credenciales para la simulación",
    },
  ],
  queries: [
    {
      id: "discovery-query-default",
      name: "Comunidades deportivas en Valencia",
      expression: "comunidades deporte Valencia actividades",
      providerSelection: "DEFAULT",
      territory: "Valencia",
      category: "multideporte",
      language: "es",
      frequency: "Diaria (simulada)",
      maxResults: 20,
      status: "active",
      lastExecutionId: "discovery-execution-01",
    },
    {
      id: "discovery-query-override",
      name: "Running social Valencia",
      expression: "running social Valencia eventos",
      providerSelection: "provider-secondary",
      territory: "Valencia",
      category: "running",
      language: "en",
      frequency: "Semanal (simulada)",
      maxResults: 10,
      status: "paused",
    },
  ],
  executions: [
    {
      id: "discovery-execution-01",
      queryId: "discovery-query-default",
      providerId: "provider-primary",
      state: "succeeded",
      startedAt: "2026-10-05T10:00:00.000Z",
      observed: 3,
      newResults: 2,
      knownResults: 1,
      cost: null,
    },
  ],
  results: [
    {
      id: "discovery-result-promoted",
      queryId: "discovery-query-default",
      executionId: "discovery-execution-01",
      providerId: "provider-primary",
      title: "Comunidad Meetup de Valencia",
      url: "https://www.meetup.com/",
      status: "promoted",
      observedAt: "2026-10-05T10:00:00.000Z",
      observationCount: 2,
      sourceId: "S001",
    },
    {
      id: "discovery-result-known",
      queryId: "discovery-query-default",
      executionId: "discovery-execution-01",
      providerId: "provider-primary",
      title: "Calendario ya observado",
      url: "https://www.lasarenasvolley.es/",
      status: "known",
      observedAt: "2026-10-05T10:00:00.000Z",
      observationCount: 3,
    },
    {
      id: "discovery-result-new",
      queryId: "discovery-query-default",
      executionId: "discovery-execution-01",
      providerId: "provider-primary",
      title: "Posible nueva comunidad deportiva",
      url: "https://www.meetup.com/",
      status: "candidate",
      observedAt: "2026-10-05T10:00:00.000Z",
      observationCount: 1,
    },
  ],
};

export class FixtureDiscoveryRepository implements DiscoveryRepository {
  async getSnapshot(): Promise<DiscoverySnapshot> {
    return structuredClone(snapshot);
  }
}
