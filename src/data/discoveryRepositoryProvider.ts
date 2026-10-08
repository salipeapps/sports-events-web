import type { DiscoveryRepository } from "@/domain/discovery";
import { FixtureDiscoveryRepository } from "./fixtures/fixtureDiscoveryRepository";

const repository: DiscoveryRepository = new FixtureDiscoveryRepository();

/** Replace this adapter, not the UI, when the engine exposes the discovery API. */
export function getDiscoveryRepository(): DiscoveryRepository {
  return repository;
}
