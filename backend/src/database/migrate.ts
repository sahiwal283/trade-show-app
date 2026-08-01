import { PoolClient } from 'pg';
import { pool } from '../config/database';
import fs from 'fs';
import path from 'path';

/**
 * Session-level advisory lock key serializing migration runs. Two processes
 * running migrations concurrently (server startup overlapping with a manual
 * `npm run migrate`, or two instances restarting together) previously both
 * saw the same "pending" list and both applied it — non-DDL migrations like
 * seed inserts (033) could double-apply. Postgres releases the lock
 * automatically if the holding session dies.
 */
const MIGRATION_ADVISORY_LOCK_KEY = 725_101_033;

/**
 * Check if schema_migrations table exists (for backward compatibility)
 */
async function hasMigrationTrackingTable(): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      )`
    );
    return result.rows[0].exists;
  } catch (error) {
    return false;
  }
}

/**
 * Get list of already applied migrations from tracking table
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  try {
    const result = await pool.query('SELECT version FROM schema_migrations');
    return new Set(result.rows.map((row: any) => row.version));
  } catch (error) {
    return new Set();
  }
}

/**
 * Record a migration as applied in the tracking table
 */
async function recordMigration(version: string): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT (version) DO NOTHING',
      [version]
    );
  } catch (error) {
    console.error(`Failed to record migration ${version}:`, error);
    // Don't throw - migration was successful, just tracking failed
  }
}

export async function runMigrations(options: { exitOnDone?: boolean } = { exitOnDone: true }) {
  const { exitOnDone = true } = options;
  let lockClient: PoolClient | null = null;
  let failure: unknown = null;
  try {
    console.log('Running database migrations...');

    // Serialize concurrent migration runs across processes (advisory lock is
    // session-scoped, so it must be held on a dedicated client for the whole
    // pass — pool.query would use a different session per statement).
    lockClient = await pool.connect();
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);

    // Step 1: Run base schema (optional — an established database no longer
    // needs it, and the runtime DB user may not own the tables, in which
    // case even IF NOT EXISTS statements throw ownership errors)
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      try {
        console.log('Applying base schema.sql...');
        const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
        await pool.query(schemaSQL);
      } catch (schemaError) {
        console.warn(
          '⚠ Base schema skipped (established database / insufficient privileges):',
          (schemaError as Error).message
        );
      }
    } else {
      console.log('schema.sql not packaged — skipping base schema (existing database assumed)');
    }
    console.log('✓ Base schema applied successfully');
    
    // Step 2: Check if migration tracking table exists
    const hasTracking = await hasMigrationTrackingTable();
    let appliedMigrations = new Set<string>();
    
    if (hasTracking) {
      console.log('✓ Migration tracking table found - using explicit tracking');
      appliedMigrations = await getAppliedMigrations();
      console.log(`  Found ${appliedMigrations.size} previously applied migration(s)`);
    } else {
      console.log('⚠ Migration tracking table not found - using legacy error-code approach');
      console.log('  (This is normal for fresh databases or before migration 025 is applied)');
    }
    
    // Step 3: Run migration files in migrations/ folder
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql') && !f.startsWith('._')) // Exclude macOS resource fork files
        .sort(); // Run in alphabetical order
      
      if (migrationFiles.length > 0) {
        const pendingMigrations = hasTracking
          ? migrationFiles.filter(file => !appliedMigrations.has(file))
          : migrationFiles;
        
        console.log(`\nFound ${migrationFiles.length} migration file(s) total:`);
        if (hasTracking && pendingMigrations.length < migrationFiles.length) {
          console.log(`  ${migrationFiles.length - pendingMigrations.length} already applied, ${pendingMigrations.length} pending`);
        }
        
        for (const file of migrationFiles) {
          // Skip if already applied (when using tracking table)
          if (hasTracking && appliedMigrations.has(file)) {
            console.log(`  ⊘ Skipped (already applied): ${file}`);
            continue;
          }
          
          console.log(`  Applying migration: ${file}...`);
          try {
            const migrationSQL = fs.readFileSync(
              path.join(migrationsDir, file),
              'utf-8'
            );
            await pool.query(migrationSQL);
            console.log(`  ✓ Applied: ${file}`);
            
            // Record migration in tracking table (if it exists)
            if (hasTracking) {
              await recordMigration(file);
            }
          } catch (migrationError: any) {
            // Legacy error handling for backward compatibility
            if (migrationError.code === '42710' || migrationError.code === '42P07') {
              console.log(`  ⚠ Already applied (skipped): ${file}`);
              // Record in tracking table if it exists (for consistency)
              if (hasTracking) {
                await recordMigration(file);
              }
            } else if (migrationError.code === '42501') {
              // Permission denied - log warning but continue
              console.log(`  ⚠ Permission denied (skipped): ${file} - ${migrationError.message}`);
            } else {
              console.error(`  ✗ Failed to apply ${file}:`, migrationError.message);
              throw migrationError;
            }
          }
        }
      } else {
        console.log('No migration files found in migrations/ folder');
      }
    } else {
      console.log('Migrations folder does not exist, skipping individual migrations');
    }
    
    console.log('\n✓ All migrations completed successfully!');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    failure = error;
  } finally {
    // Release the advisory lock BEFORE any process.exit (finally blocks do
    // not run after process.exit). Session close releases it anyway; the
    // explicit unlock just keeps the pool client clean for reuse.
    if (lockClient) {
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
      } catch (unlockError) {
        console.warn('⚠ Failed to release migration advisory lock (released on disconnect):', unlockError);
      }
      lockClient.release();
    }
  }

  if (failure) {
    if (exitOnDone) process.exit(1); // CLI mode: hard failure
    throw failure; // startup mode: caller decides (serve with existing schema)
  }
  if (exitOnDone) process.exit(0);
}

// CLI entrypoint (npm run migrate / node dist/database/migrate.js).
// When imported by server.ts the caller invokes runMigrations() itself.
if (require.main === module) {
  runMigrations();
}
