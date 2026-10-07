/**
 * All SQL for sample requests and the catalog. Event-scoped reads join
 * through event_participants so a rep removed from a show drops out of the
 * summary and the dashboard without any cleanup job.
 */
import { query, pool } from '../../config/database';
import {
  SampleCatalog, SampleProductLine, SampleProduct, SampleMaterial, SampleBrand,
  SampleRequestRow, SampleRequestDetail, SampleRequestPayload, SampleRequestStatus,
} from '../../services/sampleRequests/types';

export interface EventItemRow {
  user_id: string; user_name: string; status: SampleRequestStatus;
  product_id: string; singles: number; displays: number; empty_displays: number;
}
export interface EventMaterialRow {
  user_id: string; user_name: string; status: SampleRequestStatus;
  material_id: string; qty: number; notes: string | null;
}
export interface EventRequestRow {
  user_id: string; user_name: string; status: SampleRequestStatus | null; submitted_at: string | null;
}

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

  // ── Requests ───────────────────────────────────────────────────────────
  private async attachContents(row: SampleRequestRow): Promise<SampleRequestDetail> {
    const [items, materials] = await Promise.all([
      query(`SELECT product_id, singles, displays, empty_displays FROM sample_request_items WHERE request_id = $1`, [row.id]),
      query(`SELECT material_id, qty, notes FROM sample_request_materials WHERE request_id = $1`, [row.id]),
    ]);
    return {
      ...row,
      items: items.rows.map((i: any) => ({ productId: i.product_id, singles: i.singles, displays: i.displays, emptyDisplays: i.empty_displays })),
      materials: materials.rows.map((m: any) => ({ materialId: m.material_id, qty: m.qty, notes: m.notes })),
    };
  }

  async findRequest(eventId: string, userId: string): Promise<SampleRequestDetail | null> {
    const r = await query(`SELECT * FROM sample_requests WHERE event_id = $1 AND user_id = $2`, [eventId, userId]);
    if (!r.rows[0]) return null;
    return this.attachContents(r.rows[0]);
  }

  async upsertDraft(eventId: string, userId: string): Promise<SampleRequestDetail> {
    const r = await query(
      `INSERT INTO sample_requests (event_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (event_id, user_id) DO UPDATE SET updated_at = sample_requests.updated_at
       RETURNING *`,
      [eventId, userId]
    );
    return this.attachContents(r.rows[0]);
  }

  async replaceContents(requestId: string, payload: SampleRequestPayload): Promise<void> {
    const items = payload.items.filter((i) => i.singles > 0 || i.displays > 0 || i.emptyDisplays > 0);
    const materials = payload.materials.filter((m) => m.qty > 0 || (m.notes && m.notes.trim().length > 0));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM sample_request_items WHERE request_id = $1`, [requestId]);
      await client.query(`DELETE FROM sample_request_materials WHERE request_id = $1`, [requestId]);
      if (items.length > 0) {
        await client.query(
          `INSERT INTO sample_request_items (request_id, product_id, singles, displays, empty_displays)
           SELECT $1::uuid, * FROM UNNEST($2::uuid[], $3::int[], $4::int[], $5::int[])`,
          [requestId, items.map((i) => i.productId), items.map((i) => i.singles), items.map((i) => i.displays), items.map((i) => i.emptyDisplays)]
        );
      }
      if (materials.length > 0) {
        await client.query(
          `INSERT INTO sample_request_materials (request_id, material_id, qty, notes)
           SELECT $1::uuid, * FROM UNNEST($2::uuid[], $3::int[], $4::text[])`,
          [requestId, materials.map((m) => m.materialId), materials.map((m) => m.qty), materials.map((m) => m.notes?.trim() || null)]
        );
      }
      await client.query(`UPDATE sample_requests SET updated_at = now() WHERE id = $1`, [requestId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async markSubmitted(requestId: string): Promise<SampleRequestRow> {
    const r = await query(
      `UPDATE sample_requests SET status = 'submitted', submitted_at = now(), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [requestId]
    );
    return r.rows[0];
  }

  async findRequestsForUser(userId: string): Promise<Array<{ event_id: string; status: SampleRequestStatus; submitted_at: string | null }>> {
    const r = await query(`SELECT event_id, status, submitted_at FROM sample_requests WHERE user_id = $1`, [userId]);
    return r.rows;
  }

  // ── Event-wide reads (through the roster) ──────────────────────────────
  async findEventRequests(eventId: string): Promise<EventRequestRow[]> {
    const r = await query(
      `SELECT ep.user_id, u.name AS user_name, sr.status, sr.submitted_at
       FROM event_participants ep
       JOIN users u ON u.id = ep.user_id
       LEFT JOIN sample_requests sr ON sr.event_id = ep.event_id AND sr.user_id = ep.user_id
       WHERE ep.event_id = $1
       ORDER BY u.name`,
      [eventId]
    );
    return r.rows;
  }

  async findEventItems(eventId: string): Promise<EventItemRow[]> {
    const r = await query(
      `SELECT sr.user_id, u.name AS user_name, sr.status,
              i.product_id, i.singles, i.displays, i.empty_displays
       FROM sample_requests sr
       JOIN event_participants ep ON ep.event_id = sr.event_id AND ep.user_id = sr.user_id
       JOIN users u ON u.id = sr.user_id
       JOIN sample_request_items i ON i.request_id = sr.id
       WHERE sr.event_id = $1`,
      [eventId]
    );
    return r.rows;
  }

  async findEventMaterials(eventId: string): Promise<EventMaterialRow[]> {
    const r = await query(
      `SELECT sr.user_id, u.name AS user_name, sr.status, m.material_id, m.qty, m.notes
       FROM sample_requests sr
       JOIN event_participants ep ON ep.event_id = sr.event_id AND ep.user_id = sr.user_id
       JOIN users u ON u.id = sr.user_id
       JOIN sample_request_materials m ON m.request_id = sr.id
       WHERE sr.event_id = $1`,
      [eventId]
    );
    return r.rows;
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
