/**
 * Daily cleanup of the dashboard's log tables. The cleanup functions existed
 * for years with nothing calling them, so every table grew without limit.
 * Each step is independent: one failing is logged and the rest still run.
 */
import { apiRequestRepository, pageViewRepository, auditLogRepository } from '../../database/repositories';
import { cleanupExpiredSessions } from '../../middleware/sessionTracker';

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000; // let DB/migrations settle

const STEPS: Array<{ table: string; run: () => Promise<number> }> = [
  { table: 'api_requests', run: () => apiRequestRepository.deleteOlderThan(30) },
  { table: 'page_views', run: () => pageViewRepository.deleteOlderThan(90) },
  { table: 'audit_logs', run: () => auditLogRepository.deleteOlderThan(365) },
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
