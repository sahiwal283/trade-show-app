import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * DATABASE SCHEMA INTEGRATION TESTS
 * 
 * Purpose: Verify database schema matches code expectations
 * Run: Before each deployment to catch schema drift
 * 
 * Tests:
 * - Table existence
 * - Column names and data types
 * - Foreign key constraints
 * - Check constraints
 * - Indexes
 * - Default values
 * - NOT NULL constraints
 */

const testPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'expense_app',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

let schemaDbReady = false;
try {
  await testPool.query('SELECT 1');
  schemaDbReady = true;
} catch (error) {
  console.warn(
    'Skipping Database Schema Integration Tests (no database connection). Set DB_* env and run Postgres to enable.'
  );
  await testPool.end().catch(() => {});
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

interface ConstraintInfo {
  constraint_name: string;
  constraint_type: string;
  table_name: string;
  column_name: string;
}

interface ForeignKeyInfo {
  constraint_name: string;
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

interface IndexInfo {
  indexname: string;
  tablename: string;
  indexdef: string;
}

describe.skipIf(!schemaDbReady)('Database Schema Integration Tests', () => {
  afterAll(async () => {
    await testPool.end();
  });

  describe('Core Tables Existence', () => {
    it('should have event_checklists table', async () => {
      const result = await testPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'event_checklists'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it('should have checklist_flights table', async () => {
      const result = await testPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'checklist_flights'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it('should have checklist_hotels table', async () => {
      const result = await testPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'checklist_hotels'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it('should have checklist_car_rentals table', async () => {
      const result = await testPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'checklist_car_rentals'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it('should have checklist_booth_shipping table', async () => {
      const result = await testPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'checklist_booth_shipping'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });
  });

  describe('event_checklists Table Schema', () => {
    let columns: ColumnInfo[];

    beforeAll(async () => {
      const result = await testPool.query<ColumnInfo>(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'event_checklists'
        ORDER BY ordinal_position;
      `);
      columns = result.rows;
    });

    it('should have id column (SERIAL PRIMARY KEY)', async () => {
      const idColumn = columns.find(c => c.column_name === 'id');
      expect(idColumn).toBeDefined();
      expect(idColumn?.data_type).toBe('integer');
      expect(idColumn?.is_nullable).toBe('NO');
      expect(idColumn?.column_default).toContain('nextval');
    });

    it('should have event_id column (UUID NOT NULL)', async () => {
      const column = columns.find(c => c.column_name === 'event_id');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('uuid');
      expect(column?.is_nullable).toBe('NO');
    });

    it('should have booth_ordered column (BOOLEAN)', async () => {
      const column = columns.find(c => c.column_name === 'booth_ordered');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('boolean');
      expect(column?.column_default).toContain('false');
    });

    it('should have booth_notes column (TEXT)', async () => {
      const column = columns.find(c => c.column_name === 'booth_notes');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('text');
      expect(column?.is_nullable).toBe('YES');
    });

    it('should have booth_map_url column (TEXT)', async () => {
      const column = columns.find(c => c.column_name === 'booth_map_url');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('text');
    });

    it('should have electricity_ordered column (BOOLEAN)', async () => {
      const column = columns.find(c => c.column_name === 'electricity_ordered');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('boolean');
      expect(column?.column_default).toContain('false');
    });

    it('should have electricity_notes column (TEXT)', async () => {
      const column = columns.find(c => c.column_name === 'electricity_notes');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('text');
    });

    it('should have created_at column (TIMESTAMP)', async () => {
      const column = columns.find(c => c.column_name === 'created_at');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('timestamp without time zone');
      expect(column?.column_default).toContain('CURRENT_TIMESTAMP');
    });

    it('should have updated_at column (TIMESTAMP)', async () => {
      const column = columns.find(c => c.column_name === 'updated_at');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('timestamp without time zone');
    });

    it('should have UNIQUE constraint on event_id', async () => {
      const result = await testPool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'event_checklists' 
        AND constraint_type = 'UNIQUE';
      `);
      
      const uniqueConstraints = result.rows.map(r => r.constraint_name);
      const hasEventIdUnique = uniqueConstraints.some(name => 
        name.includes('event_id') || name.includes('unique')
      );
      
      expect(hasEventIdUnique).toBe(true);
    });
  });

  describe('checklist_hotels Table Schema', () => {
    let columns: ColumnInfo[];

    beforeAll(async () => {
      const result = await testPool.query<ColumnInfo>(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'checklist_hotels'
        ORDER BY ordinal_position;
      `);
      columns = result.rows;
    });

    it('should have id column (SERIAL PRIMARY KEY)', async () => {
      const column = columns.find(c => c.column_name === 'id');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('integer');
      expect(column?.is_nullable).toBe('NO');
    });

    it('should have checklist_id column (INTEGER NOT NULL)', async () => {
      const column = columns.find(c => c.column_name === 'checklist_id');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('integer');
      expect(column?.is_nullable).toBe('NO');
    });

    it('should have attendee_id column (UUID)', async () => {
      const column = columns.find(c => c.column_name === 'attendee_id');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('uuid');
      expect(column?.is_nullable).toBe('YES'); // Can be null
    });

    it('should have attendee_name column (VARCHAR 255 NOT NULL)', async () => {
      const column = columns.find(c => c.column_name === 'attendee_name');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('character varying');
      expect(column?.character_maximum_length).toBe(255);
      expect(column?.is_nullable).toBe('NO');
    });

    it('should have property_name column (VARCHAR 255)', async () => {
      const column = columns.find(c => c.column_name === 'property_name');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('character varying');
      expect(column?.character_maximum_length).toBe(255);
    });

    it('should have check_in_date column (DATE)', async () => {
      const column = columns.find(c => c.column_name === 'check_in_date');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('date');
    });

    it('should have check_out_date column (DATE)', async () => {
      const column = columns.find(c => c.column_name === 'check_out_date');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('date');
    });

    it('should have booked column (BOOLEAN DEFAULT FALSE)', async () => {
      const column = columns.find(c => c.column_name === 'booked');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('boolean');
      expect(column?.column_default).toContain('false');
    });
  });

  describe('checklist_car_rentals Table Schema', () => {
    let columns: ColumnInfo[];

    beforeAll(async () => {
      const result = await testPool.query<ColumnInfo>(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'checklist_car_rentals'
        ORDER BY ordinal_position;
      `);
      columns = result.rows;
    });

    it('should have rental_type column (VARCHAR 50)', async () => {
      const column = columns.find(c => c.column_name === 'rental_type');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('character varying');
      expect(column?.character_maximum_length).toBe(50);
      expect(column?.column_default).toContain('group');
    });

    it('should have CHECK constraint on rental_type', async () => {
      const result = await testPool.query(`
        SELECT con.conname, pg_get_constraintdef(con.oid) as constraint_def
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'checklist_car_rentals'
        AND con.contype = 'c';
      `);

      const checkConstraints = result.rows;
      const rentalTypeCheck = checkConstraints.find(c => 
        c.constraint_def.includes('rental_type') &&
        c.constraint_def.includes('group') &&
        c.constraint_def.includes('individual')
      );

      expect(rentalTypeCheck).toBeDefined();
    });

    it('should have assigned_to_id column (UUID)', async () => {
      const column = columns.find(c => c.column_name === 'assigned_to_id');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('uuid');
      expect(column?.is_nullable).toBe('YES');
    });

    it('should have assigned_to_name column (VARCHAR 255)', async () => {
      const column = columns.find(c => c.column_name === 'assigned_to_name');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('character varying');
      expect(column?.character_maximum_length).toBe(255);
    });

    it('should have pickup_date column (DATE)', async () => {
      const column = columns.find(c => c.column_name === 'pickup_date');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('date');
    });

    it('should have return_date column (DATE)', async () => {
      const column = columns.find(c => c.column_name === 'return_date');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('date');
    });
  });

  describe('checklist_booth_shipping Table Schema', () => {
    let columns: ColumnInfo[];

    beforeAll(async () => {
      const result = await testPool.query<ColumnInfo>(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'checklist_booth_shipping'
        ORDER BY ordinal_position;
      `);
      columns = result.rows;
    });

    it('should have shipping_method column (VARCHAR 50 NOT NULL)', async () => {
      const column = columns.find(c => c.column_name === 'shipping_method');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('character varying');
      expect(column?.is_nullable).toBe('NO');
    });

    it('should have CHECK constraint on shipping_method', async () => {
      const result = await testPool.query(`
        SELECT con.conname, pg_get_constraintdef(con.oid) as constraint_def
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'checklist_booth_shipping'
        AND con.contype = 'c';
      `);

      const checkConstraints = result.rows;
      const shippingMethodCheck = checkConstraints.find(c => 
        c.constraint_def.includes('shipping_method') &&
        c.constraint_def.includes('manual') &&
        c.constraint_def.includes('carrier')
      );

      expect(shippingMethodCheck).toBeDefined();
    });

    it('should have shipped column (BOOLEAN DEFAULT FALSE)', async () => {
      const column = columns.find(c => c.column_name === 'shipped');
      expect(column).toBeDefined();
      expect(column?.data_type).toBe('boolean');
      expect(column?.column_default).toContain('false');
    });
  });

  describe('Foreign Key Constraints', () => {
    it('event_checklists should reference events(id) with CASCADE delete', async () => {
      const result = await testPool.query(`
        SELECT
          tc.constraint_name, 
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = 'event_checklists'
        AND kcu.column_name = 'event_id';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].foreign_table_name).toBe('events');
      expect(result.rows[0].foreign_column_name).toBe('id');
      expect(result.rows[0].delete_rule).toBe('CASCADE');
    });

    it('checklist_hotels should reference event_checklists(id) with CASCADE delete', async () => {
      const result = await testPool.query(`
        SELECT
          tc.constraint_name,
          ccu.table_name AS foreign_table_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = 'checklist_hotels'
        AND tc.constraint_name LIKE '%checklist_id%';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].foreign_table_name).toBe('event_checklists');
      expect(result.rows[0].delete_rule).toBe('CASCADE');
    });

    it('checklist_car_rentals should reference event_checklists(id) with CASCADE delete', async () => {
      const result = await testPool.query(`
        SELECT
          tc.constraint_name,
          ccu.table_name AS foreign_table_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = 'checklist_car_rentals'
        AND tc.constraint_name LIKE '%checklist_id%';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].foreign_table_name).toBe('event_checklists');
      expect(result.rows[0].delete_rule).toBe('CASCADE');
    });

    it('checklist_hotels.attendee_id should reference users(id) with SET NULL delete', async () => {
      const result = await testPool.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = 'checklist_hotels'
        AND kcu.column_name = 'attendee_id';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].foreign_table_name).toBe('users');
      expect(result.rows[0].delete_rule).toBe('SET NULL');
    });
  });

  describe('Performance Indexes', () => {
    it('should have index on event_checklists.event_id', async () => {
      const result = await testPool.query<IndexInfo>(`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE tablename = 'event_checklists'
        AND indexname LIKE '%event_id%';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].indexdef).toContain('event_id');
    });

    it('should have index on checklist_hotels.checklist_id', async () => {
      const result = await testPool.query<IndexInfo>(`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE tablename = 'checklist_hotels'
        AND indexname LIKE '%checklist_id%';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should have index on checklist_car_rentals.checklist_id', async () => {
      const result = await testPool.query<IndexInfo>(`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE tablename = 'checklist_car_rentals'
        AND indexname LIKE '%checklist_id%';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should have index on checklist_booth_shipping.checklist_id', async () => {
      const result = await testPool.query<IndexInfo>(`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE tablename = 'checklist_booth_shipping'
        AND indexname LIKE '%checklist_id%';
      `);

      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Schema Drift Detection', () => {
    it('should not have unexpected extra columns in event_checklists', async () => {
      const result = await testPool.query<ColumnInfo>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'event_checklists';
      `);

      const expectedColumns = [
        'id', 'event_id', 'booth_ordered', 'booth_notes', 'booth_map_url',
        'electricity_ordered', 'electricity_notes', 'created_at', 'updated_at',
        'templates_applied' // Added in migration 019
      ];

      const actualColumns = result.rows.map(r => r.column_name);

      // Check for unexpected columns
      const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));
      
      if (extraColumns.length > 0) {
        console.warn('⚠️  SCHEMA DRIFT DETECTED: Unexpected columns found:', extraColumns);
      }

      // Allow templates_applied column as it's added in a later migration
      const unexpectedColumns = extraColumns.filter(col => col !== 'templates_applied');
      expect(unexpectedColumns.length).toBe(0);
    });

    it('should not have unexpected extra columns in checklist_hotels', async () => {
      const result = await testPool.query<ColumnInfo>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'checklist_hotels';
      `);

      const expectedColumns = [
        'id', 'checklist_id', 'attendee_id', 'attendee_name', 
        'property_name', 'confirmation_number', 'check_in_date', 
        'check_out_date', 'notes', 'booked', 'created_at', 'updated_at'
      ];

      const actualColumns = result.rows.map(r => r.column_name);
      const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));

      if (extraColumns.length > 0) {
        console.warn('⚠️  SCHEMA DRIFT DETECTED in checklist_hotels:', extraColumns);
      }

      expect(extraColumns.length).toBe(0);
    });

    it('should not have unexpected extra columns in checklist_car_rentals', async () => {
      const result = await testPool.query<ColumnInfo>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'checklist_car_rentals';
      `);

      const expectedColumns = [
        'id', 'checklist_id', 'provider', 'confirmation_number',
        'pickup_date', 'return_date', 'notes', 'booked', 'rental_type',
        'assigned_to_id', 'assigned_to_name', 'created_at', 'updated_at'
      ];

      const actualColumns = result.rows.map(r => r.column_name);
      const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));

      if (extraColumns.length > 0) {
        console.warn('⚠️  SCHEMA DRIFT DETECTED in checklist_car_rentals:', extraColumns);
      }

      expect(extraColumns.length).toBe(0);
    });

    it('should alert if critical tables are missing', async () => {
      const criticalTables = [
        'event_checklists',
        'checklist_flights',
        'checklist_hotels',
        'checklist_car_rentals',
        'checklist_booth_shipping'
      ];

      for (const tableName of criticalTables) {
        const result = await testPool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, [tableName]);

        if (!result.rows[0].exists) {
          console.error(`🚨 CRITICAL: Table ${tableName} is MISSING!`);
        }

        expect(result.rows[0].exists).toBe(true);
      }
    });
  });
});

