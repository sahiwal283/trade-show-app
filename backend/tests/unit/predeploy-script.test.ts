import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * scripts/predeploy-2.34.0.sql carries a copy of migrations 047 and 048 so a
 * superuser can apply them where the app's own role cannot. A copy drifts;
 * this keeps it honest.
 */
const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, '../../..', relative), 'utf8');

/** The SQL that actually runs: no comment lines, no blank lines, no trailing space. */
const executable = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('--'))
    .join('\n');

const script = read('scripts/predeploy-2.34.0.sql');
const body = executable(script);
const MIGRATIONS = ['047_create_page_views.sql', '048_ensure_audit_logs_shape.sql'];

describe('scripts/predeploy-2.34.0.sql', () => {
  it.each(MIGRATIONS)('contains the complete executable SQL of migration %s', (file) => {
    const migration = executable(read(`backend/src/database/migrations/${file}`));
    expect(migration.length).toBeGreaterThan(100);
    expect(body).toContain(migration);
  });

  it('runs its steps in order, inside one transaction', () => {
    const order = [
      'BEGIN;',
      'CREATE TABLE IF NOT EXISTS page_views',
      'ALTER TABLE page_views OWNER TO :"app_role";',
      'CREATE TABLE IF NOT EXISTS audit_logs',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs, api_requests, user_sessions, page_views TO :"app_role";',
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";',
      'INSERT INTO schema_migrations',
      'COMMIT;',
    ].map((step) => body.indexOf(step));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(body.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(body.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  it('defaults the app role to production\'s and lets -v app_role override it', () => {
    expect(body).toMatch(/\\if :\{\?app_role\}\n\\else\n\s*\\set app_role trade_show_app_prod\n\\endif/);
  });

  it('records both migrations the way migrate.ts does', () => {
    // migrate.ts: INSERT INTO schema_migrations (version, applied_at) VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT (version) DO NOTHING
    expect(read('backend/src/database/migrate.ts')).toContain(
      'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT (version) DO NOTHING'
    );
    const insert = /INSERT INTO schema_migrations \(version, applied_at\)[^;]*;/.exec(body)![0];
    for (const file of MIGRATIONS) expect(insert).toContain(`('${file}', CURRENT_TIMESTAMP)`);
    expect(insert).toContain('ON CONFLICT (version) DO NOTHING');
  });

  it('never reads table data: the only SELECT ... FROM is the system catalog lookup of constraint names', () => {
    const readFrom = [...body.matchAll(/\bSELECT\b[^;]*?\bFROM\s+([\w."]+)/gi)].map((match) => match[1]);
    expect(readFrom.filter((table) => table !== 'schema_migrations' && table !== 'pg_constraint')).toEqual([]);
    expect(body).not.toMatch(/^\s*(TABLE|COPY|\\copy)\b/im);
    expect(body).not.toMatch(/\bRETURNING\b/i);
  });

  it('tells the operator exactly how to run it', () => {
    expect(script).toContain(
      'su postgres -c "psql -X -v ON_ERROR_STOP=1 -d expense_app_production -f /tmp/predeploy-2.34.0.sql"'
    );
  });
});
