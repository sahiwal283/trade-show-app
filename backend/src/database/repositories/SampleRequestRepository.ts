/**
 * All SQL for sample requests and the catalog. There is ONE shared request per
 * event (sample_requests.event_id is unique); any participant may edit it.
 * Edits arrive as a field-level patch (only the fields the client changed, per
 * row), merged into the current row in one transaction that first locks the
 * parent request so concurrent patches serialize: two people editing different
 * fields of one row both keep their numbers. Every changed field is recorded in
 * sample_request_changes, so the history always matches what is stored.
 */
import { query, pool } from '../../config/database';
import { NotFoundError } from '../../utils/errors';
import {
  SampleCatalog, SampleProductLine, SampleProduct, SampleMaterial, SampleBrand,
  SampleRequestRow, SampleRequestPayload, SampleRequestPatch, SampleRequestStatus, SampleChangeRow, SampleChangeField, UserRef,
} from '../../services/sampleRequests/types';

const ACTIVE = (includeInactive: boolean) => (includeInactive ? '' : 'WHERE is_active = TRUE');

class SampleRequestRepository {
  // ── Catalog ────────────────────────────────────────────────────────────
  async getCatalog(includeInactive = false): Promise<SampleCatalog> {
    const [lines, products, materials] = await Promise.all([
      query(`SELECT * FROM sample_product_lines ${ACTIVE(includeInactive)} ORDER BY brand, position, name`),
      query(`SELECT * FROM sample_products ${ACTIVE(includeInactive)} ORDER BY position, name`),
      query(`SELECT * FROM sample_materials ${ACTIVE(includeInactive)} ORDER BY position, name`),
    ]);
    return {
      lines: lines.rows as SampleProductLine[],
      products: products.rows as SampleProduct[],
      materials: materials.rows as SampleMaterial[],
    };
  }

  async createLine(input: { brand: SampleBrand; name: string }): Promise<SampleProductLine> {
    const r = await query(
      `INSERT INTO sample_product_lines (brand, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM sample_product_lines WHERE brand = $1))
       RETURNING *`,
      [input.brand, input.name]
    );
    return r.rows[0];
  }

  async updateLine(id: string, patch: { name?: string; is_active?: boolean }): Promise<SampleProductLine | null> {
    const r = await query(
      `UPDATE sample_product_lines
       SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.is_active ?? null]
    );
    return r.rows[0] || null;
  }

  async createProduct(input: { product_line_id: string; name: string }): Promise<SampleProduct> {
    const r = await query(
      `INSERT INTO sample_products (product_line_id, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM sample_products WHERE product_line_id = $1))
       RETURNING *`,
      [input.product_line_id, input.name]
    );
    return r.rows[0];
  }

  async updateProduct(id: string, patch: { name?: string; is_active?: boolean }): Promise<SampleProduct | null> {
    const r = await query(
      `UPDATE sample_products
       SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.is_active ?? null]
    );
    return r.rows[0] || null;
  }

  async createMaterial(input: { name: string }): Promise<SampleMaterial> {
    const r = await query(
      `INSERT INTO sample_materials (name, position)
       VALUES ($1, (SELECT COALESCE(MAX(position), 0) + 1 FROM sample_materials))
       RETURNING *`,
      [input.name]
    );
    return r.rows[0];
  }

  async updateMaterial(id: string, patch: { name?: string; is_active?: boolean }): Promise<SampleMaterial | null> {
    const r = await query(
      `UPDATE sample_materials
       SET name = COALESCE($2, name), is_active = COALESCE($3, is_active), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.is_active ?? null]
    );
    return r.rows[0] || null;
  }

  /** Positions become 1..n in the order given. Ids not listed are untouched. */
  async reorder(kind: 'lines' | 'products' | 'materials', orderedIds: string[]): Promise<void> {
    const table = { lines: 'sample_product_lines', products: 'sample_products', materials: 'sample_materials' }[kind];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(`UPDATE ${table} SET position = $2, updated_at = now() WHERE id = $1`, [orderedIds[i], i + 1]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ── Shared request ─────────────────────────────────────────────────────
  async findByEvent(eventId: string): Promise<SampleRequestRow | null> {
    const r = await query(`SELECT * FROM sample_requests WHERE event_id = $1`, [eventId]);
    return r.rows[0] || null;
  }

  /** Creates the event's single draft row if missing; otherwise returns it unchanged. */
  async upsertEventDraft(eventId: string, createdBy: string): Promise<SampleRequestRow> {
    const r = await query(
      `INSERT INTO sample_requests (event_id, created_by)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO UPDATE SET updated_at = sample_requests.updated_at
       RETURNING *`,
      [eventId, createdBy]
    );
    return r.rows[0];
  }

  async getContents(requestId: string): Promise<{ items: SampleRequestPayload['items']; materials: SampleRequestPayload['materials'] }> {
    const [items, materials] = await Promise.all([
      query(`SELECT product_id, singles, displays, empty_displays FROM sample_request_items WHERE request_id = $1`, [requestId]),
      query(`SELECT material_id, qty, notes FROM sample_request_materials WHERE request_id = $1`, [requestId]),
    ]);
    return {
      items: items.rows.map((i: any) => ({ productId: i.product_id, singles: i.singles, displays: i.displays, emptyDisplays: i.empty_displays })),
      materials: materials.rows.map((m: any) => ({ materialId: m.material_id, qty: m.qty, notes: m.notes })),
    };
  }

  /**
   * Field-level merge. For each row in the patch: lock the current row, lay the
   * provided fields over it (absent fields keep their stored value), upsert (or
   * delete when the merged row is all zero/blank), and log one change row per
   * provided field whose value differs. One transaction, so history matches storage.
   */
  async applyRows(requestId: string, userId: string, patch: SampleRequestPatch): Promise<void> {
    const client = await pool.connect();
    const log = (kind: 'item' | 'material', targetId: string, field: SampleChangeField, oldV: unknown, newV: unknown) =>
      client.query(
        `INSERT INTO sample_request_changes (request_id, user_id, kind, target_id, field, old_value, new_value, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
        [requestId, userId, kind, targetId, field, oldV == null ? null : String(oldV), newV == null ? null : String(newV)]
      );
    try {
      await client.query('BEGIN');
      // Serialize patches per request so every read below sees committed state.
      const parent = await client.query(
        `SELECT id FROM sample_requests WHERE id = $1 FOR NO KEY UPDATE`,
        [requestId]
      );
      if (parent.rows.length === 0) throw new NotFoundError('Sample request', requestId);
      let anyChange = false;
      for (const it of patch.items) {
        const cur = await client.query(
          `SELECT singles, displays, empty_displays FROM sample_request_items WHERE request_id = $1 AND product_id = $2 FOR UPDATE`,
          [requestId, it.productId]
        );
        const old: { singles: number; displays: number; empty_displays: number } =
          cur.rows[0] ?? { singles: 0, displays: 0, empty_displays: 0 };
        const next = { ...old };
        if (it.singles !== undefined) next.singles = it.singles;
        if (it.displays !== undefined) next.displays = it.displays;
        if (it.emptyDisplays !== undefined) next.empty_displays = it.emptyDisplays;
        const changed = (['singles', 'displays', 'empty_displays'] as const).filter((k) => old[k] !== next[k]);
        if (changed.length === 0) continue;
        anyChange = true;
        if (next.singles === 0 && next.displays === 0 && next.empty_displays === 0) {
          await client.query(`DELETE FROM sample_request_items WHERE request_id = $1 AND product_id = $2`, [requestId, it.productId]);
        } else {
          await client.query(
            `INSERT INTO sample_request_items (request_id, product_id, singles, displays, empty_displays)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (request_id, product_id) DO UPDATE
               SET singles = EXCLUDED.singles, displays = EXCLUDED.displays, empty_displays = EXCLUDED.empty_displays`,
            [requestId, it.productId, next.singles, next.displays, next.empty_displays]
          );
        }
        for (const k of changed) await log('item', it.productId, k, old[k], next[k]);
      }
      for (const m of patch.materials) {
        const cur = await client.query(
          `SELECT qty, notes FROM sample_request_materials WHERE request_id = $1 AND material_id = $2 FOR UPDATE`,
          [requestId, m.materialId]
        );
        const old: { qty: number; notes: string | null } = { qty: cur.rows[0]?.qty ?? 0, notes: cur.rows[0]?.notes ?? null };
        const next = { ...old };
        if (m.qty !== undefined) next.qty = m.qty;
        if (m.notes !== undefined) next.notes = m.notes && m.notes.trim().length > 0 ? m.notes.trim() : null;
        const changed = (['qty', 'notes'] as const).filter((k) => old[k] !== next[k]);
        if (changed.length === 0) continue;
        anyChange = true;
        if (next.qty === 0 && next.notes === null) {
          await client.query(`DELETE FROM sample_request_materials WHERE request_id = $1 AND material_id = $2`, [requestId, m.materialId]);
        } else {
          await client.query(
            `INSERT INTO sample_request_materials (request_id, material_id, qty, notes)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (request_id, material_id) DO UPDATE SET qty = EXCLUDED.qty, notes = EXCLUDED.notes`,
            [requestId, m.materialId, next.qty, next.notes]
          );
        }
        for (const k of changed) await log('material', m.materialId, k, old[k], next[k]);
      }
      if (anyChange) {
        await client.query(
          `UPDATE sample_requests SET last_edited_by = $2, last_edited_at = clock_timestamp(), updated_at = now() WHERE id = $1`,
          [requestId, userId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async markSubmitted(requestId: string, userId: string): Promise<SampleRequestRow> {
    const r = await query(
      `UPDATE sample_requests SET status = 'submitted', submitted_at = now(), submitted_by = $2, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [requestId, userId]
    );
    return r.rows[0];
  }

  async findStatusByEvents(eventIds: string[]): Promise<Array<{ event_id: string; status: SampleRequestStatus; submitted_at: string | null; last_edited_at: string | null }>> {
    if (eventIds.length === 0) return [];
    const r = await query(
      `SELECT event_id, status, submitted_at, last_edited_at FROM sample_requests WHERE event_id = ANY($1::uuid[])`,
      [eventIds]
    );
    return r.rows;
  }

  async listChanges(requestId: string, limit = 200): Promise<SampleChangeRow[]> {
    const r = await query(
      `SELECT c.id, c.user_id, u.name AS user_name, c.kind, c.target_id, c.field, c.old_value, c.new_value, c.changed_at,
              COALESCE(p.name, m.name) AS target_name, l.name AS line_name, l.brand
       FROM sample_request_changes c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN sample_products p ON c.kind = 'item' AND p.id = c.target_id
       LEFT JOIN sample_product_lines l ON l.id = p.product_line_id
       LEFT JOIN sample_materials m ON c.kind = 'material' AND m.id = c.target_id
       WHERE c.request_id = $1
       ORDER BY c.changed_at DESC
       LIMIT $2`,
      [requestId, limit]
    );
    return r.rows.map((row: any) => ({
      id: row.id, userId: row.user_id, userName: row.user_name, kind: row.kind, targetId: row.target_id,
      targetName: row.target_name ?? 'Unknown', lineName: row.line_name ?? null, brand: row.brand ?? null,
      field: row.field, oldValue: row.old_value, newValue: row.new_value, changedAt: row.changed_at,
    }));
  }

  async userRefs(ids: Array<string | null>): Promise<Map<string, UserRef>> {
    const wanted = [...new Set(ids.filter((v): v is string => !!v))];
    if (wanted.length === 0) return new Map();
    const r = await query(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [wanted]);
    return new Map(r.rows.map((u: any) => [u.id, { id: u.id, name: u.name }]));
  }

  // ── Setting ────────────────────────────────────────────────────────────
  async getPullerUserId(): Promise<string | null> {
    // Only an existing, active user counts; a deleted or deactivated puller reads as unset.
    const r = await query(
      `SELECT u.id FROM app_settings s
       JOIN users u ON u.id::text = s.value->>'userId'
       WHERE s.key = 'sample_puller_user_id' AND u.is_active = TRUE`
    );
    return r.rows[0]?.id ?? null;
  }
}

export const sampleRequestRepository = new SampleRequestRepository();
