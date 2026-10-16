// Offline only: survives simulated client restarts, not OS/process restarts.
import { emptyCommandQuotaState, type CommandQuotaState, type CommandQuotaStore } from "./commandQuota";

export class OfflineCommandQuotaStore implements CommandQuotaStore {
  state = emptyCommandQuotaState();
  now = 86400000;
  available = true;
  async transaction<T>(update: (state: CommandQuotaState, now: number) => T): Promise<T> {
    if (!this.available) throw new Error("offline store unavailable");
    // Synchronous callback/commit emulates a serializable shared transaction.
    const copy = structuredClone(this.state);
    const result = update(copy, this.now);
    this.state = copy;
    return result;
  }
}
