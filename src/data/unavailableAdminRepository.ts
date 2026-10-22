import type { AdminRepository } from "./adminRepository";
import { AdminReadError } from "@/domain/adminRead";

async function unavailableRead(): Promise<never> {
  throw new AdminReadError("NOT_AVAILABLE");
}

async function unavailableCommand(): Promise<never> {
  throw new Error("WRITE_UNAVAILABLE");
}

/** H0 reserves these B1 read models for Engine #123. B3 is not a substitute. */
export class UnavailableAdminRepository implements AdminRepository {
  getDashboardSummary = unavailableRead;
  listActivities = unavailableRead;
  listCandidates = unavailableRead;
  listRunCandidates = unavailableRead;
  getCandidate = unavailableRead;
  getLinkedPublishedOccurrence = unavailableRead;
  listOrganizers = unavailableRead;
  getOrganizer = unavailableRead;
  listSources = unavailableRead;
  listRuns = unavailableRead;

  updateCandidateFinal = unavailableCommand;
  refreshCandidatePublishedBaseline = unavailableCommand;
  approveCandidate = unavailableCommand;
  rejectCandidate = unavailableCommand;
  blockCandidate = unavailableCommand;
  unblockCandidate = unavailableCommand;
  resolveCandidateBlocker = unavailableCommand;
  requestRequery = unavailableCommand;
  requestReprocess = unavailableCommand;
}
