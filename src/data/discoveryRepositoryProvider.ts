import "server-only";

import { getDiscoveryMode } from "@/integrations/discovery/readApi";
import type { DiscoveryRepository } from "@/domain/discovery";
import { FixtureDiscoveryRepository } from "./fixtures/fixtureDiscoveryRepository";

const repository: DiscoveryRepository = new FixtureDiscoveryRepository();

/** Replace this adapter, not the UI, when the engine exposes the discovery API. */
export function getDiscoveryRepository(): DiscoveryRepository {
  if (getDiscoveryMode() !== "demo") throw new Error("Fixture discovery is available only in local demo mode.");
  return repository;
}
