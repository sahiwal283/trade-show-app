/**
 * InFlightGuard — in-process mutual exclusion for operations that must not
 * run concurrently for the same key (e.g. "push expense X to Zoho Books").
 *
 * This guards the double-click / two-tab case within a single backend
 * process: the FIRST request acquires the key, later requests are rejected
 * until it is released. It is NOT a cross-instance lock — pair it with an
 * atomic database claim (e.g. `UPDATE ... WHERE zoho_expense_id IS NULL`)
 * for multi-instance safety.
 */
export class InFlightGuard {
  private readonly inFlight = new Set<string>();

  /** Try to acquire the key. Returns false when it is already held. */
  tryAcquire(key: string): boolean {
    if (this.inFlight.has(key)) return false;
    this.inFlight.add(key);
    return true;
  }

  /** Release a previously acquired key (safe to call for unheld keys). */
  release(key: string): void {
    this.inFlight.delete(key);
  }

  /** Whether the key is currently held. */
  isInFlight(key: string): boolean {
    return this.inFlight.has(key);
  }
}
