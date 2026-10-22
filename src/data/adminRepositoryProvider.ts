import "server-only";

import { isLocalAdminDemo } from "@/config/adminData";
import type { AdminRepository } from "./adminRepository";
import { FixtureAdminRepository } from "./fixtures/fixtureAdminRepository";
import { UnavailableAdminRepository } from "./unavailableAdminRepository";

let developmentAdminRepository: AdminRepository | undefined;
const unavailableAdminRepository: AdminRepository = new UnavailableAdminRepository();

export function getAdminRepository(): AdminRepository {
  if (isLocalAdminDemo()) {
    developmentAdminRepository ??= new FixtureAdminRepository();
    return developmentAdminRepository;
  }
  return unavailableAdminRepository;
}
