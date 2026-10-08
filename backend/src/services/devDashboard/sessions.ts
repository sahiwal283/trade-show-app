/**
 * Developer dashboard — Sessions tab.
 * Who is signed in right now. One row per person; their individual sessions
 * (one per device or browser) hang underneath.
 */
import { query } from '../../config/database';

export interface SessionsPayload {
  users: Array<{
    userId: string;
    name: string;
    role: string;
    status: 'active' | 'idle' | 'away';
    lastActivity: string;
    sessionCount: number;
    sessions: Array<{
      id: string; ipAddress: string | null; userAgent: string | null;
      createdAt: string; lastActivity: string; expiresAt: string;
    }>;
  }>;
}

export interface SessionRow {
  id: string;
  user_id: string;
  name: string;
  role: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date | string;
  last_activity: Date | string;
  expires_at: Date | string;
}

const ACTIVE_WITHIN_MS = 5 * 60_000;
const IDLE_WITHIN_MS = 30 * 60_000;

// createSession stores these placeholders when a header is missing.
const blankToNull = (value: string | null): string | null =>
  !value || value.toLowerCase() === 'unknown' ? null : value;

const iso = (value: Date | string): string => new Date(value).toISOString();

/** Rows must arrive ordered by last_activity DESC; the grouping keeps that order. */
export function groupSessions(rows: SessionRow[], now: Date): SessionsPayload['users'] {
  const byUser = new Map<string, SessionsPayload['users'][number]>();

  for (const row of rows) {
    let user = byUser.get(row.user_id);
    if (!user) {
      const idleMs = now.getTime() - new Date(row.last_activity).getTime();
      user = {
        userId: row.user_id,
        name: row.name,
        role: row.role,
        status: idleMs < ACTIVE_WITHIN_MS ? 'active' : idleMs < IDLE_WITHIN_MS ? 'idle' : 'away',
        lastActivity: iso(row.last_activity),
        sessionCount: 0,
        sessions: [],
      };
      byUser.set(row.user_id, user);
    }
    user.sessionCount += 1;
    user.sessions.push({
      id: row.id,
      ipAddress: blankToNull(row.ip_address),
      userAgent: blankToNull(row.user_agent),
      createdAt: iso(row.created_at),
      lastActivity: iso(row.last_activity),
      expiresAt: iso(row.expires_at),
    });
  }

  return [...byUser.values()];
}

export async function getSessions(now: Date = new Date()): Promise<SessionsPayload> {
  const { rows } = await query(`/* devdash:sessions */
    SELECT s.id, s.user_id, u.name, u.role, s.ip_address, s.user_agent,
           s.created_at, s.last_activity, s.expires_at
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > NOW()
     ORDER BY s.last_activity DESC`);
  return { users: groupSessions(rows as SessionRow[], now) };
}
