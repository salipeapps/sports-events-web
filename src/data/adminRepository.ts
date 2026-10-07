import type {
  ActivityFilters,
  ActivityListItem,
  AdminCandidate,
  CandidateFilters,
  CandidateBlockerKind,
  DashboardSummary,
  EditorialActor,
  EngineRun,
  EventDetails,
  Organizer,
  PageResult,
  SourceConfig,
} from "@/domain/admin";

export interface CandidateApprovalInput {
  actor: EditorialActor;
  expectedVersion: string;
  reason?: string;
  corrections?: Partial<EventDetails>;
}

export interface CandidateCorrectionInput {
  actor: EditorialActor;
  expectedVersion: string;
  reason?: string;
  corrections: Partial<EventDetails>;
}

export interface CandidateDecisionInput {
  actor: EditorialActor;
  expectedVersion: string;
  reason: string;
}

export interface CandidateActionInput {
  actor: EditorialActor;
  expectedVersion: string;
  reason?: string;
}

export interface CandidateBlockerResolutionInput extends CandidateDecisionInput {
  kind: CandidateBlockerKind;
  targetId: string;
  disposition?: "accepted" | "rejected";
}

export interface AdminRepository {
  getDashboardSummary(): Promise<DashboardSummary>;
  listActivities(filters?: ActivityFilters): Promise<PageResult<ActivityListItem>>;
  listCandidates(filters?: CandidateFilters): Promise<PageResult<ActivityListItem>>;
  getCandidate(candidateId: string): Promise<AdminCandidate | null>;
  listOrganizers(): Promise<Organizer[]>;
  getOrganizer(organizerId: string): Promise<Organizer | null>;
  updateCandidateFinal(candidateId: string, input: CandidateCorrectionInput): Promise<AdminCandidate>;
  approveCandidate(candidateId: string, input: CandidateApprovalInput): Promise<AdminCandidate>;
  rejectCandidate(candidateId: string, input: CandidateDecisionInput): Promise<AdminCandidate>;
  blockCandidate(candidateId: string, input: CandidateDecisionInput): Promise<AdminCandidate>;
  unblockCandidate(candidateId: string, input: CandidateDecisionInput): Promise<AdminCandidate>;
  resolveCandidateBlocker(candidateId: string, input: CandidateBlockerResolutionInput): Promise<AdminCandidate>;
  requestRequery(candidateId: string, input: CandidateActionInput): Promise<AdminCandidate>;
  requestReprocess(candidateId: string, input: CandidateActionInput): Promise<AdminCandidate>;
  listSources(): Promise<SourceConfig[]>;
  listRuns(): Promise<EngineRun[]>;
}
