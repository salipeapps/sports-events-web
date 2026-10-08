import type { AdminRepository } from "./adminRepository";
import { FixtureAdminRepository } from "./fixtures/fixtureAdminRepository";

const developmentAdminRepository: AdminRepository = new FixtureAdminRepository();

export function getAdminRepository(): AdminRepository {
  return developmentAdminRepository;
}
