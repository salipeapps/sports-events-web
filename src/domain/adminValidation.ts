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

type KnownValueValidator = (value: unknown, path: string, errors: string[]) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateString(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function validateOptionalString(value: unknown, path: string, errors: string[]): void {
  if (value !== undefined && typeof value !== "string") {
    errors.push(`${path} must be a string when provided`);
  }
}

function validateBoolean(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "boolean") {
    errors.push(`${path} must be boolean`);
  }
}

function validateNumber(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`);
  }
}

function validateNonNegativeInteger(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors.push(`${path} must be a non-negative integer`);
  }
}

function validateStringArray(value: unknown, path: string, errors: string[]): void {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
  ) {
    errors.push(`${path} must be an array of non-empty strings`);
  }
}

function validateEnum(value: unknown, allowed: readonly string[], path: string, errors: string[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(`${path} must be one of: ${allowed.join(", ")}`);
  }
}

function validateFieldValue(
  value: unknown,
  path: string,
  errors: string[],
  validateKnown?: KnownValueValidator,
): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a field value`);
    return;
  }

  if (value.state === "known") {
    if (!("value" in value)) {
      errors.push(`${path}.value is required when state is known`);
      return;
    }
    validateKnown?.(value.value, `${path}.value`, errors);
    return;
  }

  if (value.state === "unknown") {
    validateEnum(value.reason, unknownReasons, `${path}.reason`, errors);
    validateOptionalString(value.note, `${path}.note`, errors);
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

const priceKinds = [
  "free",
  "fixed",
  "trial",
  "payment_variant",
  "transport_included",
  "membership",
  "annual_membership",
  "annual_insurance",
  "donation",
] as const;

function validatePriceDetails(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a price details object`);
    return;
  }

  validateEnum(value.kind, priceKinds, `${path}.kind`, errors);
  validateBoolean(value.perSessionComparable, `${path}.perSessionComparable`, errors);
  validateOptionalString(value.note, `${path}.note`, errors);

  if (!Array.isArray(value.options)) {
    errors.push(`${path}.options must be an array`);
    return;
  }

  value.options.forEach((option, index) => {
    const optionPath = `${path}.options[${index}]`;
    if (!isRecord(option)) {
      errors.push(`${optionPath} must be an object`);
      return;
    }
    validateNumber(option.amount, `${optionPath}.amount`, errors);
    if (option.currency !== "EUR") {
      errors.push(`${optionPath}.currency must be EUR`);
    }
    validateOptionalString(option.label, `${optionPath}.label`, errors);
    validateOptionalString(option.paymentMethod, `${optionPath}.paymentMethod`, errors);
    validateOptionalString(option.condition, `${optionPath}.condition`, errors);
  });
}

function validateEventFieldValue(
  field: keyof EventDetails,
  value: unknown,
  path: string,
  errors: string[],
): void {
  switch (field) {
    case "category":
      validateFieldValue(value, path, errors, (knownValue, knownPath, knownErrors) =>
        validateEnum(knownValue, activityCategories, knownPath, knownErrors),
      );
      break;
    case "timezone":
      validateFieldValue(value, path, errors, (knownValue, knownPath, knownErrors) => {
        if (knownValue !== "Europe/Madrid") {
          knownErrors.push(`${knownPath} must be Europe/Madrid`);
        }
      });
      break;
    case "price":
      validateFieldValue(value, path, errors, validatePriceDetails);
      break;
    case "languages":
      validateFieldValue(value, path, errors, validateStringArray);
      break;
    case "individualAccess":
      validateFieldValue(value, path, errors, validateBoolean);
      break;
    default:
      validateFieldValue(value, path, errors, validateString);
  }
}

function validateEventDetails(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an event details object`);
    return;
  }

  for (const field of eventFieldNames) {
    validateEventFieldValue(field, value[field], `${path}.${field}`, errors);
  }
}

function validateEvidence(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an evidence object`);
    return;
  }

  validateString(value.id, `${path}.id`, errors);
  validateString(value.sourceId, `${path}.sourceId`, errors);
  validateString(value.sourceUrl, `${path}.sourceUrl`, errors);
  validateEnum(
    value.sourceRole,
    [
      "organizer_published",
      "aggregator",
      "search_result",
      "booking_platform",
      "community_platform",
      "import",
    ],
    `${path}.sourceRole`,
    errors,
  );
  validateEnum(value.method, ["page", "search", "structured", "import", "manual"], `${path}.method`, errors);
  validateString(value.capturedAt, `${path}.capturedAt`, errors);
  validateFieldValue(value.externalId, `${path}.externalId`, errors, validateString);
  validateStringArray(value.fields, `${path}.fields`, errors);
  validateFieldValue(value.excerpt, `${path}.excerpt`, errors, validateString);
}

function validateRule(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a rule evaluation object`);
    return;
  }

  validateString(value.id, `${path}.id`, errors);
  validateString(value.code, `${path}.code`, errors);
  validateEnum(value.outcome, ["pass", "warning", "block"], `${path}.outcome`, errors);
  validateFieldValue(value.field, `${path}.field`, errors, (knownValue, knownPath, knownErrors) =>
    validateEnum(knownValue, eventFieldNames, knownPath, knownErrors),
  );
  validateString(value.reason, `${path}.reason`, errors);
  validateStringArray(value.evidenceIds, `${path}.evidenceIds`, errors);
}

function validateAiEvaluation(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an AI evaluation object`);
    return;
  }

  if (value.state === "not_run") {
    validateString(value.reason, `${path}.reason`, errors);
    return;
  }

  if (value.state === "failed") {
    validateString(value.reason, `${path}.reason`, errors);
    validateString(value.evaluatedAt, `${path}.evaluatedAt`, errors);
    validateFieldValue(value.provider, `${path}.provider`, errors, validateString);
    return;
  }

  if (value.state === "completed") {
    validateString(value.evaluatedAt, `${path}.evaluatedAt`, errors);
    validateString(value.provider, `${path}.provider`, errors);
    validateString(value.modelVersion, `${path}.modelVersion`, errors);
    validateString(value.promptVersion, `${path}.promptVersion`, errors);
    validateEnum(value.suitability, ["suitable", "not_suitable", "uncertain"], `${path}.suitability`, errors);
    validateFieldValue(
      value.proposedCategory,
      `${path}.proposedCategory`,
      errors,
      (knownValue, knownPath, knownErrors) =>
        validateEnum(knownValue, activityCategories, knownPath, knownErrors),
    );
    validateFieldValue(
      value.modelReportedConfidence,
      `${path}.modelReportedConfidence`,
      errors,
      validateNumber,
    );
    validateStringArray(value.reasons, `${path}.reasons`, errors);

    if (!Array.isArray(value.missingFields)) {
      errors.push(`${path}.missingFields must be an array`);
    } else {
      value.missingFields.forEach((field, index) =>
        validateEnum(field, eventFieldNames, `${path}.missingFields[${index}]`, errors),
      );
    }

    validateStringArray(value.conflictIds, `${path}.conflictIds`, errors);
    validateStringArray(value.evidenceIds, `${path}.evidenceIds`, errors);
    return;
  }

  errors.push(`${path}.state must be not_run, failed or completed`);
}

function validateConflict(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a conflict object`);
    return;
  }

  validateString(value.id, `${path}.id`, errors);
  validateEnum(value.type, conflictTypes, `${path}.type`, errors);
  validateEnum(value.status, ["open", "resolved"], `${path}.status`, errors);
  validateBoolean(value.blocking, `${path}.blocking`, errors);
  validateFieldValue(value.field, `${path}.field`, errors, (knownValue, knownPath, knownErrors) =>
    validateEnum(knownValue, eventFieldNames, knownPath, knownErrors),
  );
  validateString(value.summary, `${path}.summary`, errors);
  validateStringArray(value.evidenceIds, `${path}.evidenceIds`, errors);
}

function validateMatch(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a candidate match object`);
    return;
  }

  validateString(value.id, `${path}.id`, errors);
  validateString(value.targetId, `${path}.targetId`, errors);
  validateEnum(
    value.relation,
    ["exact_source_identity", "same_event", "same_series", "possible_duplicate", "different_event"],
    `${path}.relation`,
    errors,
  );
  validateEnum(value.status, ["pending", "confirmed", "rejected"], `${path}.status`, errors);
  validateStringArray(value.signals, `${path}.signals`, errors);
  validateStringArray(value.evidenceIds, `${path}.evidenceIds`, errors);
}

function validateChangeProposal(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a change proposal object`);
    return;
  }

  validateString(value.id, `${path}.id`, errors);
  validateString(value.publishedOccurrenceId, `${path}.publishedOccurrenceId`, errors);
  validateEnum(value.status, ["pending", "approved", "rejected"], `${path}.status`, errors);
  validateBoolean(value.essential, `${path}.essential`, errors);
  validateString(value.detectedAt, `${path}.detectedAt`, errors);

  if (!Array.isArray(value.fields)) {
    errors.push(`${path}.fields must be an array`);
    return;
  }

  value.fields.forEach((change, index) => {
    const changePath = `${path}.fields[${index}]`;
    if (!isRecord(change)) {
      errors.push(`${changePath} must be an object`);
      return;
    }

    validateEnum(change.field, eventFieldNames, `${changePath}.field`, errors);
    if (typeof change.field === "string" && eventFieldNames.includes(change.field as keyof EventDetails)) {
      const field = change.field as keyof EventDetails;
      validateEventFieldValue(field, change.before, `${changePath}.before`, errors);
      validateEventFieldValue(field, change.after, `${changePath}.after`, errors);
    }
    validateStringArray(change.evidenceIds, `${changePath}.evidenceIds`, errors);
  });
}

function validateHistory(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a history entry`);
    return;
  }

  validateString(value.id, `${path}.id`, errors);
  validateEnum(
    value.action,
    [
      "captured",
      "normalized",
      "review_requested",
      "approved",
      "published",
      "corrected",
      "rejected",
      "blocked",
      "requery_requested",
      "reprocess_requested",
      "cancelled",
      "archived",
    ],
    `${path}.action`,
    errors,
  );
  validateString(value.at, `${path}.at`, errors);
  validateFieldValue(value.reason, `${path}.reason`, errors, validateString);

  if (!isRecord(value.actor)) {
    errors.push(`${path}.actor must be an object`);
  } else {
    validateString(value.actor.id, `${path}.actor.id`, errors);
    validateEnum(value.actor.role, ["admin", "reviewer", "system"], `${path}.actor.role`, errors);
    validateString(value.actor.displayName, `${path}.actor.displayName`, errors);
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
  validateFieldValue(value.runId, "candidate.runId", errors, validateString);
  validateEnum(value.editorialStatus, editorialStatuses, "candidate.editorialStatus", errors);
  validateEnum(value.temporalStatus, temporalStatuses, "candidate.temporalStatus", errors);
  validateString(value.lastCheckedAt, "candidate.lastCheckedAt", errors);
  validateFieldValue(value.organizerId, "candidate.organizerId", errors, validateString);
  validateEventDetails(value.extracted, "candidate.extracted", errors);
  validateEventDetails(value.final, "candidate.final", errors);

  if (!Array.isArray(value.evidence)) {
    errors.push("candidate.evidence must be an array");
  } else {
    value.evidence.forEach((entry, index) => validateEvidence(entry, `candidate.evidence[${index}]`, errors));
  }

  if (!Array.isArray(value.rules)) {
    errors.push("candidate.rules must be an array");
  } else {
    value.rules.forEach((entry, index) => validateRule(entry, `candidate.rules[${index}]`, errors));
  }

  validateAiEvaluation(value.aiEvaluation, "candidate.aiEvaluation", errors);

  if (!Array.isArray(value.conflicts)) {
    errors.push("candidate.conflicts must be an array");
  } else {
    value.conflicts.forEach((entry, index) => validateConflict(entry, `candidate.conflicts[${index}]`, errors));
  }

  if (!Array.isArray(value.matches)) {
    errors.push("candidate.matches must be an array");
  } else {
    value.matches.forEach((entry, index) => validateMatch(entry, `candidate.matches[${index}]`, errors));
  }

  validateFieldValue(value.changeProposal, "candidate.changeProposal", errors, validateChangeProposal);

  if (!Array.isArray(value.history)) {
    errors.push("candidate.history must be an array");
  } else {
    value.history.forEach((entry, index) => validateHistory(entry, `candidate.history[${index}]`, errors));
  }

  return errors;
}

function validateBudget(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a budget object`);
    return;
  }
  validateNumber(value.amount, `${path}.amount`, errors);
  if (value.currency !== "EUR") {
    errors.push(`${path}.currency must be EUR`);
  }
  validateString(value.period, `${path}.period`, errors);
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
  validateFieldValue(value.frequency, "source.frequency", errors, validateString);
  validateEnum(
    value.publicationPolicy,
    ["capture_only", "capture_and_evaluate", "human_review", "auto_publish"],
    "source.publicationPolicy",
    errors,
  );
  validateEnum(value.autoPublishMode, ["disabled", "simulation", "enabled"], "source.autoPublishMode", errors);
  validateFieldValue(value.lastRunAt, "source.lastRunAt", errors, validateString);
  validateFieldValue(value.budget, "source.budget", errors, validateBudget);
  validateStringArray(value.capabilities, "source.capabilities", errors);
  validateStringArray(value.limitations, "source.limitations", errors);
  validateStringArray(value.notes, "source.notes", errors);

  return errors;
}

function validateCost(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a cost object`);
    return;
  }
  validateNumber(value.amount, `${path}.amount`, errors);
  if (value.currency !== "EUR") {
    errors.push(`${path}.currency must be EUR`);
  }
}

function validateRunShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ["run must be an object"];
  }

  validateString(value.id, "run.id", errors);
  validateEnum(value.kind, ["discovery", "capture", "reprocess"], "run.kind", errors);
  validateFieldValue(value.sourceId, "run.sourceId", errors, validateString);
  validateFieldValue(value.query, "run.query", errors, validateString);
  validateString(value.startedAt, "run.startedAt", errors);
  validateFieldValue(value.finishedAt, "run.finishedAt", errors, validateString);
  validateFieldValue(value.durationSeconds, "run.durationSeconds", errors, validateNumber);
  validateEnum(value.status, ["queued", "running", "succeeded", "partial", "failed"], "run.status", errors);
  validateFieldValue(value.cost, "run.cost", errors, validateCost);
  validateFieldValue(value.incident, "run.incident", errors, validateString);
  validateNonNegativeInteger(value.retryCount, "run.retryCount", errors);

  if (!isRecord(value.counters)) {
    errors.push("run.counters must be an object");
  } else {
    for (const counter of ["discovered", "created", "updated", "discarded", "review"] as const) {
      validateNonNegativeInteger(value.counters[counter], `run.counters.${counter}`, errors);
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
