/**
 * Sync and Batch Operations Endpoints
 * 
 * Provides efficient batch operations and sync endpoints for offline-first functionality.
 * Includes idempotency support to prevent duplicate submissions.
 */

import { Router } from 'express';
import { query } from '../config/database';
import {
  claimIdempotencyKey,
  finalizeIdempotencyKey,
  releaseIdempotencyKey,
  lookupIdempotencyKey,
  IDEMPOTENCY_PENDING,
} from '../utils/idempotency';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for batch file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') }
});

// ========== IDEMPOTENCY HELPERS ==========
// Claim-first protocol (see utils/idempotency.ts): the key row is inserted
// atomically BEFORE the expense is created, so two concurrent submissions
// with the same key can never both create an expense. The old flow here
// (SELECT key, create expense, INSERT key ON CONFLICT DO NOTHING) raced.

// ========== BATCH EXPENSE OPERATIONS ==========

/**
 * Batch create/update expenses
 * POST /api/sync/expenses/batch
 */
router.post('/expenses/batch', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    if (items.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 items per batch' });
    }

    console.log(`[Sync] Processing batch of ${items.length} expense operations`);

    const results = {
      success: [] as any[],
      failed: [] as any[]
    };

    for (const item of items) {
      let claimedKey = false;
      try {
        const { action, data, idempotencyKey, localId } = item;

        // Atomically claim the idempotency key BEFORE creating anything.
        if (idempotencyKey) {
          claimedKey = await claimIdempotencyKey(idempotencyKey, 'expense');
          if (!claimedKey) {
            const existingId = await lookupIdempotencyKey(idempotencyKey);
            if (existingId && existingId !== IDEMPOTENCY_PENDING) {
              console.log(`[Sync] Skipping duplicate ${action} (idempotency key: ${idempotencyKey})`);
              results.success.push({
                localId,
                remoteId: existingId,
                action,
                status: 'duplicate'
              });
            } else {
              // Another request holds the claim and is still creating —
              // previously this window produced a duplicate expense.
              console.log(`[Sync] Duplicate ${action} in flight (idempotency key: ${idempotencyKey})`);
              results.failed.push({
                localId,
                action,
                error: 'Duplicate submission is still being processed — retry shortly'
              });
            }
            continue;
          }
        }

        let remoteId: string;

        if (action === 'CREATE') {
          // Create new expense
          const result = await query(
            `INSERT INTO expenses (
              event_id, user_id, category, merchant, amount, date, description,
              card_used, reimbursement_required, location, zoho_entity, device_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
              data.event_id,
              data.user_id || req.user?.id,
              data.category,
              data.merchant,
              data.amount,
              data.date,
              data.description,
              data.card_used,
              data.reimbursement_required,
              data.location,
              data.zoho_entity || null,
              data.device_id
            ]
          );

          remoteId = result.rows[0].id;

          // Record the created entity on the claimed key
          if (idempotencyKey) {
            await finalizeIdempotencyKey(idempotencyKey, remoteId);
          }

          results.success.push({
            localId,
            remoteId,
            action,
            data: result.rows[0]
          });

        } else if (action === 'UPDATE') {
          // Update existing expense
          const expenseId = data.id || localId;
          
          const result = await query(
            `UPDATE expenses
             SET category = $1, merchant = $2, amount = $3, date = $4,
                 description = $5, card_used = $6, reimbursement_required = $7,
                 location = $8, zoho_entity = $9, device_id = $10,
                 updated_at = CURRENT_TIMESTAMP, version = version + 1
             WHERE id = $11
             RETURNING *`,
            [
              data.category,
              data.merchant,
              data.amount,
              data.date,
              data.description,
              data.card_used,
              data.reimbursement_required,
              data.location,
              data.zoho_entity,
              data.device_id,
              expenseId
            ]
          );

          if (result.rows.length === 0) {
            throw new Error(`Expense ${expenseId} not found`);
          }

          remoteId = result.rows[0].id;

          // Record the created entity on the claimed key
          if (idempotencyKey) {
            await finalizeIdempotencyKey(idempotencyKey, remoteId);
          }

          results.success.push({
            localId,
            remoteId,
            action,
            data: result.rows[0]
          });

        } else {
          throw new Error(`Unknown action: ${action}`);
        }

      } catch (error: any) {
        console.error(`[Sync] Item failed:`, error);
        // Roll the key claim back so a client retry with the same key works
        // (matches the old behavior of not storing keys for failed items).
        if (claimedKey && item.idempotencyKey) {
          await releaseIdempotencyKey(item.idempotencyKey).catch((releaseError) =>
            console.error(`[Sync] Failed to release idempotency key ${item.idempotencyKey}:`, releaseError)
          );
        }
        results.failed.push({
          localId: item.localId,
          action: item.action,
          error: error.message
        });
      }
    }

    console.log(`[Sync] Batch complete: ${results.success.length} success, ${results.failed.length} failed`);

    res.json(results);

  } catch (error: any) {
    console.error('[Sync] Batch operation error:', error);
    res.status(500).json({ error: 'Batch operation failed', message: error.message });
  }
});

// ========== FULL SYNC ENDPOINT ==========

/**
 * Full sync - send local changes and receive server updates
 * POST /api/sync
 */
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { lastSyncTime, items } = req.body;

    console.log(`[Sync] Full sync requested. Last sync: ${lastSyncTime}, Items: ${items?.length || 0}`);

    const result = {
      updates: [] as any[],      // Server changes since lastSyncTime
      conflicts: [] as any[],     // Items with conflicts
      success: [] as any[],       // Successfully applied local changes
      failed: [] as any[],        // Failed local changes
      syncTime: new Date().toISOString()
    };

    // Process local changes (if any)
    if (items && Array.isArray(items)) {
      for (const item of items) {
        try {
          // Process similar to batch endpoint
          // (Implementation would be similar to above)
          result.success.push({
            localId: item.localId,
            remoteId: 'temp-id',  // Would be actual ID
            action: item.action
          });
        } catch (error: any) {
          result.failed.push({
            localId: item.localId,
            error: error.message
          });
        }
      }
    }

    // Fetch server updates since lastSyncTime
    if (lastSyncTime) {
      const serverUpdates = await query(
        `SELECT * FROM expenses
         WHERE updated_at > $1
         AND (user_id = $2 OR $2 IN (
           SELECT id FROM users WHERE role IN ('admin', 'accountant', 'developer')
         ))
         ORDER BY updated_at ASC`,
        [new Date(lastSyncTime), req.user?.id]
      );

      result.updates = serverUpdates.rows;
    }

    console.log(`[Sync] Sync complete: ${result.success.length} applied, ${result.updates.length} updates`);

    res.json(result);

  } catch (error: any) {
    console.error('[Sync] Full sync error:', error);
    res.status(500).json({ error: 'Sync failed', message: error.message });
  }
});

// ========== CONFLICT RESOLUTION ==========

/**
 * Get conflicts for resolution
 * GET /api/sync/conflicts
 */
router.get('/conflicts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // This would identify expenses with version conflicts
    // For now, return empty array (conflicts handled client-side with last-write-wins)
    res.json({ conflicts: [] });
  } catch (error: any) {
    console.error('[Sync] Get conflicts error:', error);
    res.status(500).json({ error: 'Failed to fetch conflicts' });
  }
});

/**
 * Resolve a conflict
 * POST /api/sync/conflicts/:id/resolve
 */
router.post('/conflicts/:id/resolve', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { resolution, data } = req.body;

    // Apply resolution
    // Implementation would depend on conflict resolution strategy

    res.json({ success: true, id });
  } catch (error: any) {
    console.error('[Sync] Resolve conflict error:', error);
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

// ========== SYNC STATUS ==========

/**
 * Get sync status (pending items, last sync time, etc.)
 * GET /api/sync/status
 */
router.get('/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Get user's last sync time (would be stored per device)
    const lastSync = await query(
      `SELECT MAX(last_sync_at) as last_sync
       FROM expenses
       WHERE user_id = $1`,
      [req.user?.id]
    );

    // Count pending items (items created/updated after last sync)
    const pendingCount = await query(
      `SELECT COUNT(*) as count
       FROM expenses
       WHERE user_id = $1
       AND updated_at > COALESCE((
         SELECT MAX(last_sync_at) FROM expenses WHERE user_id = $1
       ), '1970-01-01')`,
      [req.user?.id]
    );

    res.json({
      lastSyncTime: lastSync.rows[0]?.last_sync || null,
      pendingCount: parseInt(pendingCount.rows[0]?.count || '0', 10),
      serverTime: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Sync] Get status error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

export default router;

