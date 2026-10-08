/**
 * Daily cleanup of the dashboard's log tables. The cleanup functions existed
 * for years with nothing calling them, so every table grew without limit.
 * Each step is independent: one failing is logged and the rest still run.
 *
 * Old rows go in small batches. The first run faces a year of api_requests,
 * and one DELETE over all of it would hold its locks and bloat the WAL a
 * minute after a deploy; a batch at a time, with a pause between, does not.
 */
import { query } from '../../config/database';
import { cleanupExpiredSessions } from '../../middleware/sessionTracker';

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000; // let DB/migrations settle

const BATCH_SIZE = 5000;
const MAX_BATCHES = 400; // 2,000,000 rows a run; what is left waits for the next day
const PAUSE_MS = 100;

/** The only tables deleteInBatches will touch. Their names go into SQL text, so they never come from input. */
const PRUNED_TABLES = ['api_requests', 'page_views', 'audit_logs'] as const;
export type PrunedTable = (typeof PRUNED_TABLES)[number];

export interface BatchOptions {
  batchSize?: number;
  maxBatches?: number;
  /** Waits between batches. Replaceable so tests do not sleep. */
  pause?: (ms: number) => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deletes rows older than `days` from one log table, a batch at a time, until
 * a batch comes back short or the cap is reached. Returns how many rows went.
 * Selecting ids in a subquery works whatever type the id column has.
 */
export async function deleteInBatches(table: PrunedTable, days: number, options: BatchOptions = {}): Promise<number> {
  if (!(PRUNED_TABLES as readonly string[]).includes(table)) {
    throw new Error(`"${table}" is not a pruned table`);
  }
  const { batchSize = BATCH_SIZE, maxBatches = MAX_BATCHES, pause = sleep } = options;

  let deleted = 0;
  for (let batch = 1; batch <= maxBatches; batch++) {
    const result = await query(
      `/* devdash:retention */
       DELETE FROM ${table}
        WHERE id IN (SELECT id FROM ${table} WHERE created_at < NOW() - make_interval(days => $1) LIMIT $2)`,
      [days, batchSize]
    );
    const count = result.rowCount ?? 0;
    deleted += count;
    if (count < batchSize) return deleted;
    if (batch < maxBatches) await pause(PAUSE_MS);
  }

  console.log(`[Retention] ${table}: stopped at the cap of ${maxBatches} batches; the next run continues`);
  return deleted;
}

const STEPS: Array<{ table: string; run: () => Promise<number> }> = [
  { table: 'api_requests', run: () => deleteInBatches('api_requests', 30) },
  { table: 'page_views', run: () => deleteInBatches('page_views', 90) },
  { table: 'audit_logs', run: () => deleteInBatches('audit_logs', 365) },
  { table: 'user_sessions', run: () => cleanupExpiredSessions() },
];

export class RetentionJob {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    this.startupTimer = setTimeout(() => void this.run(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.run(), RUN_INTERVAL_MS);
    console.log('[Retention] Scheduler started (daily: api_requests 30d, page_views 90d, audit_logs 365d, expired sessions)');
  }

  stop(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
    this.startupTimer = null;
    this.timer = null;
  }

  /** One pass over every table. Never throws. */
  async run(): Promise<void> {
    for (const step of STEPS) {
      try {
        const deleted = await step.run();
        if (deleted > 0) console.log(`[Retention] Deleted ${deleted} rows from ${step.table}`);
      } catch (error) {
        console.error(`[Retention] Cleanup failed for ${step.table}:`, error);
      }
    }
  }
}

export const retentionJob = new RetentionJob();
