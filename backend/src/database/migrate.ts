import { pool } from '../config/database';
import fs from 'fs';
import path from 'path';

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
  try {
    console.log('Running database migrations...');

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
    if (exitOnDone) process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    if (exitOnDone) process.exit(1); // CLI mode: hard failure
    throw error; // startup mode: caller decides (serve with existing schema)
  }
}

// CLI entrypoint (npm run migrate / node dist/database/migrate.js).
// When imported by server.ts the caller invokes runMigrations() itself.
if (require.main === module) {
  runMigrations();
}
