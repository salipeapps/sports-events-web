import {
  activityCategories,
  conflictTypes,
  editorialStatuses,
  temporalStatuses,
  unknownReasons,
  type AdminCandidate,
  type EngineRun,
  type EventDetails,
  type FieldValue,
  type SourceConfig,
} from "./admin";

export class ContractValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid admin contract: ${errors.join("; ")}`);
    this.name = "ContractValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateString(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function validateNumber(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`);
  }
}

function validateStringArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    errors.push(`${path} must be an array of strings`);
  }
}

function validateEnum(value: unknown, allowed: readonly string[], path: string, errors: string[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(`${path} must be one of: ${allowed.join(", ")}`);
  }
}

function validateFieldValue(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a field value`);
    return;
  }

  if (value.state === "known") {
    if (!("value" in value)) {
      errors.push(`${path}.value is required when state is known`);
    }
    return;
  }

  if (value.state === "unknown") {
    validateEnum(value.reason, unknownReasons, `${path}.reason`, errors);
    return;
  }

  errors.push(`${path}.state must be known or unknown`);
}

const eventFieldNames: (keyof EventDetails)[] = [
  "title",
  "description",
  "category",
  "startLocal",
  "endLocal",
  "timezone",
  "location",
  "departureCity",
  "destination",
  "organizerId",
  "price",
  "languages",
  "level",
  "registrationUrl",
  "individualAccess",
];

function validateEventDetails(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an event details object`);
    return;
  }

  for (const field of eventFieldNames) {
    validateFieldValue(value[field], `${path}.${field}`, errors);
  }

  const category = value.category;
  if (isRecord(category) && category.state === "known") {
    validateEnum(category.value, activityCategories, `${path}.category.value`, errors);
  }

  const timezone = value.timezone;
  if (isRecord(timezone) && timezone.state === "known" && timezone.value !== "Europe/Madrid") {
    errors.push(`${path}.timezone.value must be Europe/Madrid`);
  }
}

function validateCandidateShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ["candidate must be an object"];
  }

  validateString(value.id, "candidate.id", errors);
  validateString(value.sourceRecordId, "candidate.sourceRecordId", errors);
  validateString(value.sourceId, "candidate.sourceId", errors);
  validateFieldValue(value.runId, "candidate.runId", errors);
  validateEnum(value.editorialStatus, editorialStatuses, "candidate.editorialStatus", errors);
  validateEnum(value.temporalStatus, temporalStatuses, "candidate.temporalStatus", errors);
  validateString(value.lastCheckedAt, "candidate.lastCheckedAt", errors);
  validateFieldValue(value.organizerId, "candidate.organizerId", errors);
  validateEventDetails(value.extracted, "candidate.extracted", errors);
  validateEventDetails(value.final, "candidate.final", errors);

  for (const arrayField of ["evidence", "rules", "conflicts", "matches", "history"] as const) {
    if (!Array.isArray(value[arrayField])) {
      errors.push(`candidate.${arrayField} must be an array`);
    }
  }

  validateFieldValue(value.changeProposal, "candidate.changeProposal", errors);

  const aiEvaluation = value.aiEvaluation;
  if (!isRecord(aiEvaluation) || !["not_run", "failed", "completed"].includes(String(aiEvaluation.state))) {
    errors.push("candidate.aiEvaluation must have a supported state");
  }

  if (Array.isArray(value.conflicts)) {
    value.conflicts.forEach((conflict, index) => {
      if (!isRecord(conflict)) {
        errors.push(`candidate.conflicts[${index}] must be an object`);
        return;
      }
      validateString(conflict.id, `candidate.conflicts[${index}].id`, errors);
      validateEnum(conflict.type, conflictTypes, `candidate.conflicts[${index}].type`, errors);
      if (typeof conflict.blocking !== "boolean") {
        errors.push(`candidate.conflicts[${index}].blocking must be boolean`);
      }
    });
  }

  return errors;
}

function validateSourceShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ["source must be an object"];
  }

  validateString(value.id, "source.id", errors);
  validateString(value.name, "source.name", errors);
  validateString(value.type, "source.type", errors);
  validateEnum(value.priority, ["P1", "P2", "P3"], "source.priority", errors);
  validateEnum(value.status, ["active", "paused", "blocked", "proposed"], "source.status", errors);
  validateStringArray(value.coverage, "source.coverage", errors);
  validateString(value.accessMethod, "source.accessMethod", errors);
  validateStringArray(value.observedFields, "source.observedFields", errors);
  validateStringArray(value.allowedUrls, "source.allowedUrls", errors);
  validateFieldValue(value.frequency, "source.frequency", errors);
  validateEnum(
    value.publicationPolicy,
    ["capture_only", "capture_and_evaluate", "human_review", "auto_publish"],
    "source.publicationPolicy",
    errors,
  );
  validateEnum(value.autoPublishMode, ["disabled", "simulation", "enabled"], "source.autoPublishMode", errors);
  validateFieldValue(value.lastRunAt, "source.lastRunAt", errors);
  validateFieldValue(value.budget, "source.budget", errors);
  validateStringArray(value.capabilities, "source.capabilities", errors);
  validateStringArray(value.limitations, "source.limitations", errors);
  validateStringArray(value.notes, "source.notes", errors);

  return errors;
}

function validateRunShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ["run must be an object"];
  }

  validateString(value.id, "run.id", errors);
  validateEnum(value.kind, ["discovery", "capture", "reprocess"], "run.kind", errors);
  validateFieldValue(value.sourceId, "run.sourceId", errors);
  validateFieldValue(value.query, "run.query", errors);
  validateString(value.startedAt, "run.startedAt", errors);
  validateFieldValue(value.finishedAt, "run.finishedAt", errors);
  validateFieldValue(value.durationSeconds, "run.durationSeconds", errors);
  validateEnum(value.status, ["queued", "running", "succeeded", "partial", "failed"], "run.status", errors);
  validateFieldValue(value.cost, "run.cost", errors);
  validateFieldValue(value.incident, "run.incident", errors);
  validateNumber(value.retryCount, "run.retryCount", errors);

  if (!isRecord(value.counters)) {
    errors.push("run.counters must be an object");
  } else {
    for (const counter of ["discovered", "created", "updated", "discarded", "review"] as const) {
      validateNumber(value.counters[counter], `run.counters.${counter}`, errors);
    }
  }

  return errors;
}

function parseWith<T>(value: unknown, validate: (input: unknown) => string[]): T {
  const errors = validate(value);
  if (errors.length > 0) {
    throw new ContractValidationError(errors);
  }
  return value as T;
}

export function parseAdminCandidate(value: unknown): AdminCandidate {
  return parseWith<AdminCandidate>(value, validateCandidateShape);
}

export function parseSourceConfig(value: unknown): SourceConfig {
  return parseWith<SourceConfig>(value, validateSourceShape);
}

export function parseEngineRun(value: unknown): EngineRun {
  return parseWith<EngineRun>(value, validateRunShape);
}

export function serializeContract(value: AdminCandidate | SourceConfig | EngineRun): string {
  return JSON.stringify(value);
}

export function deserializeAdminCandidate(serialized: string): AdminCandidate {
  return parseAdminCandidate(JSON.parse(serialized) as unknown);
}

export function deserializeSourceConfig(serialized: string): SourceConfig {
  return parseSourceConfig(JSON.parse(serialized) as unknown);
}

export function deserializeEngineRun(serialized: string): EngineRun {
  return parseEngineRun(JSON.parse(serialized) as unknown);
}

export function hasBlockingConflict(candidate: AdminCandidate): boolean {
  return candidate.conflicts.some((conflict) => conflict.status === "open" && conflict.blocking);
}

export function hasBlockingRule(candidate: AdminCandidate): boolean {
  return candidate.rules.some((rule) => rule.outcome === "block");
}

export function publicationBlockReasons(candidate: AdminCandidate): string[] {
  const reasons: string[] = [];

  if (hasBlockingConflict(candidate)) reasons.push("open_blocking_conflict");
  if (hasBlockingRule(candidate)) reasons.push("blocking_rule");

  const essentials: Array<[keyof EventDetails, FieldValue<unknown>]> = [
    ["title", candidate.final.title],
    ["category", candidate.final.category],
    ["startLocal", candidate.final.startLocal],
    ["timezone", candidate.final.timezone],
    ["location", candidate.final.location],
    ["organizerId", candidate.final.organizerId],
    ["registrationUrl", candidate.final.registrationUrl],
    ["individualAccess", candidate.final.individualAccess],
  ];

  for (const [field, value] of essentials) {
    if (value.state === "unknown") reasons.push(`missing_${field}`);
  }

  if (candidate.final.individualAccess.state === "known" && candidate.final.individualAccess.value !== true) {
    reasons.push("individual_access_not_confirmed");
  }

  return Array.from(new Set(reasons));
}

export function canPublishCandidate(candidate: AdminCandidate): boolean {
  return publicationBlockReasons(candidate).length === 0;
}
