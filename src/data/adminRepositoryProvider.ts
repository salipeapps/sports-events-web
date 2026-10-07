import type { AdminRepository } from "./adminRepository";
import { FixtureAdminRepository } from "./fixtures/fixtureAdminRepository";

export function getAdminRepository(): AdminRepository {
  return new FixtureAdminRepository();
}
