/**
 * Idempotency-key helpers for offline sync (idempotency_keys table).
 *
 * Claim-first protocol (atomic, race-safe):
 *   1. claimIdempotencyKey — INSERT the key BEFORE creating the entity.
 *      Exactly one concurrent request wins the insert; the others see
 *      claimed=false and must NOT create the entity. An expired row for the
 *      same key is re-claimed in the same statement (its previous entity is
 *      no longer protected once the key expires — pre-existing semantics).
 *   2. finalizeIdempotencyKey — record the created entity id on the claim.
 *   3. releaseIdempotencyKey — roll the claim back when entity creation
 *      failed, so a client retry with the same key can succeed.
 *
 * The old check-then-insert flow (SELECT, create, INSERT ... ON CONFLICT DO
 * NOTHING) had a window where two requests with the same key both passed the
 * SELECT and both created an expense.
 */

import { query } from '../config/database';

/** Placeholder entity_id while the claiming request is still creating. */
export const IDEMPOTENCY_PENDING = '';

export const CLAIM_IDEMPOTENCY_KEY_SQL = `
  INSERT INTO idempotency_keys (key, entity_type, entity_id)
  VALUES ($1, $2, $3)
  ON CONFLICT (key) DO UPDATE SET
    entity_type = EXCLUDED.entity_type,
    entity_id = EXCLUDED.entity_id,
    created_at = CURRENT_TIMESTAMP,
    expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
  WHERE idempotency_keys.expires_at <= NOW()
  RETURNING key
`;

/**
 * Atomically claim an idempotency key. Returns true when this request won
 * the claim (fresh key, or reclaimed an expired one) and may create the
 * entity; false when another request holds or completed it.
 */
export async function claimIdempotencyKey(key: string, entityType: string): Promise<boolean> {
  const result = await query(CLAIM_IDEMPOTENCY_KEY_SQL, [key, entityType, IDEMPOTENCY_PENDING]);
  return (result.rowCount ?? 0) > 0;
}

/** Record the created/updated entity id on a claim this request holds. */
export async function finalizeIdempotencyKey(key: string, entityId: string): Promise<void> {
  await query(`UPDATE idempotency_keys SET entity_id = $2 WHERE key = $1`, [key, entityId]);
}

/**
 * Roll back a claim after entity creation failed. Only removes the row while
 * it is still pending, so a completed claim can never be deleted by accident.
 */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  await query(`DELETE FROM idempotency_keys WHERE key = $1 AND entity_id = $2`, [
    key,
    IDEMPOTENCY_PENDING,
  ]);
}

/**
 * Look up the entity a non-expired key resolved to. Returns null when the
 * key is unknown/expired, and the pending placeholder ('') while the
 * claiming request is still in flight.
 */
export async function lookupIdempotencyKey(key: string): Promise<string | null> {
  const result = await query(
    'SELECT entity_id FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
    [key]
  );
  return result.rows.length > 0 ? result.rows[0].entity_id : null;
}
