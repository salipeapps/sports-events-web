import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { DiscoveryCommandError, type CommandOperation } from "./commandApi";

export interface CommandPermit {
  complete(): Promise<void>;
}
export interface CommandAdmission {
  acquire(subject: string, operation: CommandOperation): Promise<CommandPermit>;
}

// Deliberately no remote adapter or local fallback. #87 must implement and accept
// the durable transaction contract before any production transport can dispatch.
export const unavailableCommandAdmission: CommandAdmission = {
  async acquire() {
    throw new DiscoveryCommandError("WRITE_UNAVAILABLE");
  },
};

interface Admission {
  at: number;
  actor: string;
  operation: CommandOperation;
}
export interface CommandQuotaState {
  version: 1;
  lastNow: number;
  admissions: Admission[];
  day: number;
  dailyCount: number;
  active: Record<string, { actor: string; operation: CommandOperation }>;
}
export const emptyCommandQuotaState = (): CommandQuotaState => ({
  version: 1,
  lastNow: 0,
  admissions: [],
  day: 0,
  dailyCount: 0,
  active: {},
});

export interface CommandQuotaStore {
  // Serializable, durable, atomic read/modify/write of ONE staging namespace.
  // Timestamp belongs to the store, never the browser/function's wall clock.
  // Throw => rollback; callbacks may repeat on contention, with no side effects.
  transaction<T>(update: (state: CommandQuotaState, now: number) => T): Promise<T>;
}

const policy = {
  rejection: { actor: 20, global: 40 },
  promotion: { actor: 5, global: 10 },
} as const;

// Reference policy for offline verification. Never instantiate with a process-
// local store in the application. Store/IAM/writer integration is deferred to #87.
export class SharedCommandAdmission implements CommandAdmission {
  constructor(
    private readonly store: CommandQuotaStore,
    private readonly identitySecret: string,
  ) {
    if (Buffer.byteLength(identitySecret) < 32) throw new Error("Invalid quota identity secret");
  }

  async acquire(subject: string, operation: CommandOperation): Promise<CommandPermit> {
    if (!subject || !Object.hasOwn(policy, operation)) throw new DiscoveryCommandError("WRITE_UNAVAILABLE");
    const actor = createHmac("sha256", this.identitySecret).update(`staging:v1:${subject}`).digest("hex");
    const permit = randomUUID(); // independent of candidate, JWT, idempotency key and provider data
    try {
      await this.store.transaction((state, now) => {
        if (
          state.version !== 1 ||
          !Number.isSafeInteger(now) ||
          now < state.lastNow ||
          !Number.isSafeInteger(state.lastNow) ||
          state.lastNow < 0 ||
          !Number.isSafeInteger(state.dailyCount) ||
          state.dailyCount < 0 ||
          state.dailyCount > 500 ||
          !Number.isSafeInteger(state.day) ||
          state.day < 0 ||
          !Array.isArray(state.admissions) ||
          state.admissions.length > 50 ||
          state.admissions.some(
            (item) =>
              !Number.isSafeInteger(item.at) ||
              item.at < 0 ||
              item.at > now ||
              !/^[0-9a-f]{64}$/.test(item.actor) ||
              !Object.hasOwn(policy, item.operation),
          ) ||
          !state.active ||
          Object.keys(state.active).length > 2 ||
          Object.values(state.active).some(
            (item) => !/^[0-9a-f]{64}$/.test(item.actor) || !Object.hasOwn(policy, item.operation),
          )
        )
          throw new DiscoveryCommandError("WRITE_UNAVAILABLE");
        state.lastNow = now;
        state.admissions = state.admissions.filter((item) => item.at > now - 60000);
        // No clock rollback may reopen a daily budget.
        const day = Math.floor(now / 86400000);
        if (day < state.day) throw new DiscoveryCommandError("WRITE_UNAVAILABLE");
        if (day > state.day) {
          state.day = day;
          state.dailyCount = 0;
        }
        const sameOperation = state.admissions.filter((item) => item.operation === operation);
        const active = Object.values(state.active);
        if (
          state.dailyCount >= 500 ||
          state.admissions.length >= 50 ||
          sameOperation.length >= policy[operation].global ||
          sameOperation.filter((item) => item.actor === actor).length >= policy[operation].actor ||
          active.length >= 2 ||
          active.some((item) => item.actor === actor)
        )
          throw new DiscoveryCommandError("RATE_LIMITED");
        state.admissions.push({ at: now, actor, operation });
        state.dailyCount++;
        state.active[permit] = { actor, operation };
      });
    } catch (error) {
      if (error instanceof DiscoveryCommandError) throw error;
      throw new DiscoveryCommandError("WRITE_UNAVAILABLE");
    }
    return {
      complete: async () => {
        // Never expire uncertain work on a timer. A crash/timeout retains its slot
        // until operator reconciliation proves the writer has stopped/completed.
        await this.store.transaction((state) => {
          delete state.active[permit];
        });
      },
    };
  }
}
