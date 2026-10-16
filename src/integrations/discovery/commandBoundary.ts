import "server-only";

import { randomUUID } from "node:crypto";
import { canAdmin } from "@/domain/adminAccess";
import { getDiscoveryAccessToken, type DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import {
  boundedText,
  commandsEnabled,
  createCommandClient,
  DiscoveryCommandError,
  commandStatus,
  type CommandOperation,
  type HttpDiscoveryCommandClient,
  validateCommand,
} from "./commandApi";

// Flat primitive DTO grammar. Parsing each key independently rejects duplicate keys,
// including escaped aliases, rather than silently accepting JSON.parse's last value.
export function parseCommandJson(text: string): Record<string, unknown> {
  const token =
    /\s*("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[{}:,])/y;
  let offset = 0;
  function next(): string {
    token.lastIndex = offset;
    const match = token.exec(text);
    if (!match) throw new DiscoveryCommandError("INVALID_REQUEST");
    offset = token.lastIndex;
    return match[1];
  }
  if (next() !== "{") throw new DiscoveryCommandError("INVALID_REQUEST");
  const result: Record<string, unknown> = Object.create(null);
  let key = next();
  if (key !== "}") {
    while (true) {
      if (!key.startsWith('"')) throw new DiscoveryCommandError("INVALID_REQUEST");
      const name = JSON.parse(key) as string;
      if (Object.hasOwn(result, name) || next() !== ":") throw new DiscoveryCommandError("INVALID_REQUEST");
      const value = next();
      if (["{", "}", ":", ","].includes(value)) throw new DiscoveryCommandError("INVALID_REQUEST");
      result[name] = JSON.parse(value);
      const delimiter = next();
      if (delimiter === "}") break;
      if (delimiter !== ",") throw new DiscoveryCommandError("INVALID_REQUEST");
      key = next();
    }
  }
  if (text.slice(offset).trim()) throw new DiscoveryCommandError("INVALID_REQUEST");
  return result;
}

// Bounded per-instance abuse backstop, never a quota authority and never a fallback:
// the only shared admission is Engine's, inside the writer (#41 / Engine #102).
export class ActorCommandBudget {
  private readonly actors = new Map<string, { until: number; count: number }>();
  constructor(private readonly now = Date.now) {}
  take(subject: string): boolean {
    const now = this.now();
    for (const [actor, budget] of this.actors) if (budget.until <= now) this.actors.delete(actor);
    let budget = this.actors.get(subject);
    if (!budget) {
      if (this.actors.size >= 5000) return false;
      budget = { until: now + 60000, count: 0 };
      this.actors.set(subject, budget);
    }
    return ++budget.count <= 20;
  }
}
const budget = new ActorCommandBudget();
interface BoundaryDependencies {
  env: NodeJS.ProcessEnv;
  getAccess(): Promise<DiscoveryTokenResult>;
  createClient(): HttpDiscoveryCommandClient;
  budget: ActorCommandBudget;
}
const defaults: BoundaryDependencies = {
  env: process.env,
  getAccess: getDiscoveryAccessToken,
  createClient: createCommandClient,
  budget,
};

export async function handleDiscoveryCommand(
  request: Request,
  id: string,
  operation: string,
  deps: BoundaryDependencies = defaults,
): Promise<Response> {
  function output(body: unknown, status: number, requestId: string = randomUUID(), retryAfter = 60) {
    return Response.json(body, {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Request-ID": requestId,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        ...(status === 429 ? { "Retry-After": String(retryAfter) } : {}),
        ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
      },
    });
  }
  try {
    if ((operation !== "rejection" && operation !== "promotion") || !commandsEnabled(operation, deps.env))
      throw new DiscoveryCommandError("NOT_CONFIGURED");
    const url = new URL(request.url);
    const origin = deps.env.APP_ORIGIN!; // Deployment gate pins this exact trusted origin.
    if (
      request.method !== "POST" ||
      url.origin !== origin ||
      request.headers.get("host") !== new URL(origin).host ||
      request.headers.get("origin") !== origin ||
      (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")
    )
      throw new DiscoveryCommandError("FORBIDDEN");
    if (
      url.search ||
      !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "") ||
      request.headers.has("content-encoding")
    )
      throw new DiscoveryCommandError("INVALID_REQUEST");
    const access = await deps.getAccess();
    if (access.status === "denied") throw new DiscoveryCommandError(access.code);
    if (!canAdmin(access.role, operation === "rejection" ? "discovery.reject" : "discovery.promote"))
      throw new DiscoveryCommandError("FORBIDDEN");
    if (!deps.budget.take(access.subject)) throw new DiscoveryCommandError("RATE_LIMITED");
    const max = operation === "rejection" ? 1024 : 4096;
    const length = request.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > max))
      throw new DiscoveryCommandError("INVALID_REQUEST");
    const body = parseCommandJson(await boundedText(request.body, max));
    const key = request.headers.get("idempotency-key") ?? "";
    validateCommand(operation, id, key, body);
    // The client validates the DTO/key and reverifies membership/bearer before forwarding.
    const result = await deps.createClient().execute(operation as CommandOperation, id, key, body);
    return output(result.receipt, 200, result.requestId);
  } catch (error) {
    const safe = error instanceof DiscoveryCommandError ? error : new DiscoveryCommandError("WRITE_UNAVAILABLE");
    return output(
      { code: safe.code, requestId: safe.requestId },
      commandStatus[safe.code],
      safe.requestId,
      safe.retryAfter,
    );
  }
}
