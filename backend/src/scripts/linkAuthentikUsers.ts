/**
 * Pre-link app accounts to Authentik identities (spec §4).
 *
 * Usage — dev (ts-node, from repo backend/):
 *   AUTHENTIK_API_URL=https://auth.booute.duckdns.org \
 *   AUTHENTIK_API_TOKEN=<token> \
 *   npm run link:authentik -- --file pairs.csv [--apply]
 *
 * Usage — prod (compiled output; ts-node is a devDependency and is NOT
 * installed on prod, which runs `npm ci --omit=dev`). This requires a build
 * that shipped dist/scripts (i.e. `npm run build` ran and dist/ was deployed):
 *   AUTHENTIK_API_URL=https://auth.booute.duckdns.org \
 *   AUTHENTIK_API_TOKEN=<token> \
 *   npm run link:authentik:prod -- --file pairs.csv [--apply]
 * (equivalent to: node dist/scripts/linkAuthentikUsers.js --file pairs.csv [--apply])
 *
 * pairs.csv: one entry per line, `app_identifier[,authentik_identifier]`
 * (username or email on either side; second column defaults to the first).
 * DRY-RUN by default — prints the plan; writes only with --apply.
 *
 * Exit codes: 0 = clean run (nothing needs attention), 2 = usage error,
 * 3 = run completed but one or more entries need attention (conflict /
 * ambiguous / not_found), 1 = unexpected failure.
 */
import fs from 'fs';
import axios from 'axios';
import { query, pool } from '../config/database';

export interface Pair {
  app: string;
  authentik: string;
}

export function parsePairs(text: string): Pair[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [app, authentik] = line.split(',').map((s) => s.trim());
      return { app, authentik: authentik || app };
    });
}

export interface AppUserRow {
  id: string;
  username: string;
  email: string;
  authentik_sub: string | null;
}

export interface AkUser {
  uuid: string;
  username: string;
  email: string;
}

export interface LinkPlan {
  action: 'link' | 'skip' | 'conflict' | 'not_found' | 'ambiguous';
  sub?: string;
  reason: string;
}

export function planLink(appUser: AppUserRow | null, akMatches: AkUser[], pair: Pair): LinkPlan {
  if (!appUser) {
    return { action: 'not_found', reason: `no app user matching "${pair.app}"` };
  }
  const needle = pair.authentik.toLowerCase();
  const exact = akMatches.filter(
    (u) => u.username.toLowerCase() === needle || (u.email || '').toLowerCase() === needle
  );
  if (exact.length === 0) {
    return { action: 'not_found', reason: `no Authentik user matching "${pair.authentik}"` };
  }
  if (exact.length > 1) {
    return { action: 'ambiguous', reason: `${exact.length} Authentik users match "${pair.authentik}"` };
  }
  const sub = exact[0].uuid;
  if (appUser.authentik_sub === sub) {
    return { action: 'skip', sub, reason: 'already linked to this identity' };
  }
  if (appUser.authentik_sub) {
    return { action: 'conflict', sub, reason: `app user already linked to different sub ${appUser.authentik_sub}` };
  }
  return { action: 'link', sub, reason: `link ${appUser.username} (${appUser.email}) -> ${sub}` };
}

async function findAppUser(identifier: string): Promise<AppUserRow | null> {
  const result = await query(
    `SELECT id, username, email, authentik_sub FROM users
     WHERE LOWER(TRIM(username)) = LOWER($1) OR LOWER(TRIM(email)) = LOWER($1)
     LIMIT 1`,
    [identifier.trim()]
  );
  return result.rows[0] || null;
}

export function sanitizeAxiosError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 'network error';
    const detail = error.response?.data?.detail || error.message;
    return new Error(`Authentik API GET /api/v3/core/users/ failed: ${status} ${detail}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function searchAuthentik(baseUrl: string, token: string, term: string): Promise<AkUser[]> {
  try {
    const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/v3/core/users/`, {
      params: { search: term },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return (response.data?.results || []).map((u: any) => ({
      uuid: u.uuid,
      username: u.username,
      email: u.email || '',
    }));
  } catch (error) {
    throw sanitizeAxiosError(error);
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fileIndex = args.indexOf('--file');
  const file = fileIndex >= 0 ? args[fileIndex + 1] : null;
  const baseUrl = process.env.AUTHENTIK_API_URL;
  const token = process.env.AUTHENTIK_API_TOKEN;
  if (!file || !baseUrl || !token) {
    console.error('Usage: AUTHENTIK_API_URL=... AUTHENTIK_API_TOKEN=... npm run link:authentik -- --file pairs.csv [--apply]');
    process.exit(2);
  }

  const pairs = parsePairs(fs.readFileSync(file, 'utf8'));
  console.log(`${pairs.length} entries; mode: ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  let linked = 0;
  let problems = 0;
  for (const pair of pairs) {
    const [appUser, akMatches] = await Promise.all([
      findAppUser(pair.app),
      searchAuthentik(baseUrl, token, pair.authentik),
    ]);
    const plan = planLink(appUser, akMatches, pair);
    console.log(`[${plan.action.toUpperCase()}] ${pair.app} -> ${pair.authentik}: ${plan.reason}`);
    if (plan.action === 'link' && apply) {
      await query(
        `UPDATE users SET authentik_sub = $1, sso_linked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [plan.sub, appUser!.id]
      );
      linked++;
    }
    if (plan.action === 'conflict' || plan.action === 'ambiguous' || plan.action === 'not_found') problems++;
  }

  console.log(
    `\nDone. ${apply ? `${linked} linked.` : 'Dry-run only — rerun with --apply to write.'} ${problems} entries need attention.` +
      (problems > 0 ? ' Exiting with code 3.' : '')
  );
  await pool.end();
  return problems;
}

if (require.main === module) {
  main()
    .then((problems) => {
      if (problems > 0) process.exit(3);
    })
    .catch((error) => {
      console.error('link:authentik failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
