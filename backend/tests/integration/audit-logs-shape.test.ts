import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pool, query } from '../../src/config/database';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../src/database/migrations/048_ensure_audit_logs_shape.sql'),
  'utf8'
);
const MARK = 'devdash_shape_test';

/** Every audit_logs column the code writes (utils/auditLogger.ts) or reads (services/devDashboard/auditLog.ts). */
const USED_COLUMNS = [
  'id', 'created_at', 'user_id', 'user_name', 'user_email', 'user_role', 'action', 'entity_type', 'entity_id',
  'status', 'ip_address', 'user_agent', 'request_method', 'request_path', 'changes', 'details', 'error_message',
];

/** Verifies migration 048 applied (migrate.ts silently skips on 42501) and is safe to run again. */
describe('audit_logs shape (migration 048)', () => {
  afterAll(async () => {
    await query('DELETE FROM audit_logs WHERE user_name = $1', [MARK]);
    await pool.end();
  });

  it('has every column the code writes or reads', async () => {
    const { rows } = await query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_logs'`
    );
    expect(rows.map((row) => row.column_name)).toEqual(expect.arrayContaining(USED_COLUMNS));
  });

  it('accepts the "warning" status the audit middleware writes for a 4xx, and still rejects nonsense', async () => {
    await expect(
      query(`INSERT INTO audit_logs (user_name, action, status) VALUES ($1, 'shape-test', 'warning')`, [MARK])
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      query(`INSERT INTO audit_logs (user_name, action, status) VALUES ($1, 'shape-test', 'bogus')`, [MARK])
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('has the index the dashboard sorts and prunes by', async () => {
    const { rows } = await query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'audit_logs'`
    );
    expect(rows.map((row) => row.indexname)).toContain('idx_audit_logs_created_at');
  });

  it('can be run again, and again, without error', async () => {
    await expect(query(MIGRATION)).resolves.toBeDefined();
    await expect(query(MIGRATION)).resolves.toBeDefined();
  });

  it('replaces a status check that rejects "warning" whatever that check is called', async () => {
    await query(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS weird_legacy_chk`);
    await query(
      `ALTER TABLE audit_logs ADD CONSTRAINT weird_legacy_chk CHECK (status IN ('success', 'failure')) NOT VALID`
    );
    try {
      await expect(
        query(`INSERT INTO audit_logs (user_name, action, status) VALUES ($1, 'shape-test', 'warning')`, [MARK])
      ).rejects.toMatchObject({ code: '23514' });

      await query(MIGRATION);

      await expect(
        query(`INSERT INTO audit_logs (user_name, action, status) VALUES ($1, 'shape-test', 'warning')`, [MARK])
      ).resolves.toMatchObject({ rowCount: 1 });
      const checks = await query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'public.audit_logs'::regclass AND contype = 'c'`
      );
      expect(checks.rows.map((row) => row.conname)).toEqual(['audit_logs_status_check']);
    } finally {
      await query(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS weird_legacy_chk`);
      await query('DELETE FROM audit_logs WHERE user_name = $1', [MARK]);
    }
  });

  it('repairs a table that predates the migrations: missing columns, a VARCHAR address, a status check without "warning"', async () => {
    // A private schema inside a transaction that is rolled back: the real table is never touched.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE SCHEMA devdash_shape_legacy');
      await client.query('SET LOCAL search_path TO devdash_shape_legacy, public');
      await client.query(`
        CREATE TABLE audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          action VARCHAR(100) NOT NULL,
          ip_address VARCHAR(45),
          status VARCHAR(20) DEFAULT 'success',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT audit_logs_status_check CHECK (status IN ('success', 'failure'))
        )`);
      await client.query(`INSERT INTO audit_logs (action, ip_address, status) VALUES ('old-row', 'unknown', 'success')`);
      // A row the new constraint would reject must not stop the migration.
      await client.query('ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_status_check');
      await client.query(`INSERT INTO audit_logs (action, status) VALUES ('odd-row', 'error')`);
      await client.query(`ALTER TABLE audit_logs ADD CONSTRAINT legacy_status_rule CHECK (status IN ('success', 'failure', 'error'))`);

      await client.query(MIGRATION);
      await client.query(MIGRATION);

      const columns = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'devdash_shape_legacy' AND table_name = 'audit_logs'`
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining(USED_COLUMNS));
      // An existing column keeps its type; the reader copes with both.
      expect(columns.rows.find((row) => row.column_name === 'ip_address').data_type).toBe('character varying');

      await client.query(
        `INSERT INTO audit_logs (user_name, action, status, ip_address, request_method, request_path)
         VALUES ('legacy', 'PUT /api/x', 'warning', '203.0.113.9', 'PUT', '/api/x')`
      );
      const read = await client.query(
        `SELECT split_part(ip_address::text, '/', 1) AS ip_address FROM audit_logs ORDER BY created_at DESC, id DESC`
      );
      const checks = await client.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'audit_logs'::regclass AND contype = 'c'`
      );
      expect(checks.rows.map((row) => row.conname)).toEqual(['audit_logs_status_check']);
      expect(read.rows.map((row) => row.ip_address).sort()).toEqual([null, '203.0.113.9', 'unknown'].sort());
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
