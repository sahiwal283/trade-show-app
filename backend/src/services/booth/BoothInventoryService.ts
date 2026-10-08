/**
 * Booth Inventory Service — bulk movement.
 *
 * One request moves a whole booth or a whole crate. Everything happens in a
 * single transaction, and every affected entity gets its own movement row via
 * BoothMovementService (never a direct insert).
 *
 * Cascade rules:
 *   moveBooth      — the booth, its containers, and its components that are
 *                    either inside those containers or loose (no container)
 *   moveContainer  — the container and components whose current_container_id
 *                    is that container. NEVER by booth_id: a borrowed crate
 *                    may hold another booth's pieces.
 */

import { PoolClient } from 'pg';
import { NotFoundError } from '../../utils/errors';
import { query as dbQuery } from '../../config/database';
import { boothMovementService, MovementEntry, MovementEventType } from './BoothMovementService';
import { BoothMovement } from '../../database/repositories/BoothMovementRepository';
import { boothNotifications, logNotifyError } from '../notifications';

export interface ReportRequest {
  kind: 'damage' | 'missing';
  condition?: string | null;
  notes?: string | null;
  eventId?: string | null;
  idempotencyKey?: string | null;
  performedBy: string;
}

export interface ExceptionRow {
  component_id: string;
  component_name: string;
  asset_tag: string | null;
  booth_id: string;
  booth_name: string;
  condition: string;
  current_status: string;
  notes: string | null;
  reported_at: string;
  reported_by_name: string | null;
}

export interface BulkMoveRequest {
  toLocationId?: string | null;
  toStatus?: string | null;
  eventId?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  performedBy: string;
}

export interface BulkMoveResult {
  movedBooths: number;
  movedContainers: number;
  movedComponents: number;
  /**
   * Components belonging to this booth that did NOT move because they are
   * currently inside a container that is not part of this booth. They are
   * physically elsewhere, so moving them would be a lie — but the caller
   * should be told, not left to discover it at the venue.
   */
  strandedComponents: number;
  movementIds: string[];
}

interface Movable {
  id: string;
  current_location_id: string | null;
  current_status: string;
}

/**
 * A move can change location, status, or both. Pick the event type that
 * describes what actually changed; location wins when both did, because
 * "where is it" is the question the timeline is usually answering.
 */
function eventTypeFor(locationChanged: boolean, statusChanged: boolean): MovementEventType | null {
  if (locationChanged) return 'location_change';
  if (statusChanged) return 'status_change';
  return null;
}

export class BoothInventoryService {
  private async applyMove(
    client: PoolClient,
    table: 'booths' | 'booth_containers' | 'booth_components',
    entityType: 'booth' | 'container' | 'component',
    entity: Movable,
    boothId: string | null,
    req: BulkMoveRequest,
    collected: MovementEntry[]
  ): Promise<boolean> {
    const nextLocation = req.toLocationId !== undefined && req.toLocationId !== null
      ? req.toLocationId : entity.current_location_id;
    const nextStatus = req.toStatus ?? entity.current_status;

    const locationChanged = nextLocation !== entity.current_location_id;
    const statusChanged = nextStatus !== entity.current_status;
    const eventType = eventTypeFor(locationChanged, statusChanged);
    if (!eventType) return false;

    await client.query(
      `UPDATE ${table}
          SET current_location_id = $1, current_status = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $3`,
      [nextLocation, nextStatus, entity.id]
    );

    collected.push({
      componentId: entityType === 'component' ? entity.id : null,
      containerId: entityType === 'container' ? entity.id : null,
      boothId,
      eventType,
      fromLocationId: entity.current_location_id,
      toLocationId: nextLocation,
      fromStatus: entity.current_status,
      toStatus: nextStatus,
      eventId: req.eventId ?? null,
      performedBy: req.performedBy,
      notes: req.notes ?? null,
      idempotencyKey: boothMovementService.derivedKey(req.idempotencyKey, entityType, entity.id),
    });
    return true;
  }

  async moveContainer(containerId: string, req: BulkMoveRequest): Promise<BulkMoveResult> {
    return boothMovementService.withTransaction(async (client) => {
      const { rows: containers } = await client.query(
        `SELECT id, booth_id, current_location_id, current_status
           FROM booth_containers WHERE id = $1 FOR UPDATE`,
        [containerId]
      );
      if (!containers[0]) throw new NotFoundError('Container', containerId);
      const container = containers[0];

      const { rows: components } = await client.query(
        `SELECT id, booth_id, current_location_id, current_status
           FROM booth_components WHERE current_container_id = $1 FOR UPDATE`,
        [containerId]
      );

      const entries: MovementEntry[] = [];
      let movedContainers = 0;
      let movedComponents = 0;

      if (await this.applyMove(client, 'booth_containers', 'container', container, container.booth_id, req, entries)) {
        movedContainers = 1;
      }
      for (const component of components) {
        // Attribute the movement to the COMPONENT's own booth, not the
        // container's: a borrowed crate can hold another booth's pieces, and
        // booth_movements.booth_id exists so a booth's own history is one
        // indexed query. Tagging it with the container's owner would make
        // that history wrong for exactly the borrowed-crate case the
        // never-filter-by-booth_id cascade rule exists to handle.
        if (await this.applyMove(client, 'booth_components', 'component', component, component.booth_id, req, entries)) {
          movedComponents += 1;
        }
      }

      const movements = [];
      for (const entry of entries) {
        movements.push(await boothMovementService.record(entry, client));
      }

      return {
        movedBooths: 0,
        movedContainers,
        movedComponents,
        strandedComponents: 0,
        movementIds: movements.map((m) => m.id),
      };
    });
  }

  async moveBooth(boothId: string, req: BulkMoveRequest): Promise<BulkMoveResult> {
    return boothMovementService.withTransaction(async (client) => {
      const { rows: booths } = await client.query(
        `SELECT id, current_location_id, current_status FROM booths WHERE id = $1 FOR UPDATE`,
        [boothId]
      );
      if (!booths[0]) throw new NotFoundError('Booth', boothId);

      const { rows: containers } = await client.query(
        `SELECT id, current_location_id, current_status
           FROM booth_containers WHERE booth_id = $1 FOR UPDATE`,
        [boothId]
      );
      // Components inside this booth's containers, plus loose ones that
      // belong to the booth and are not packed anywhere. The first branch can
      // pick up a component that belongs to a DIFFERENT booth (a piece
      // borrowed into one of this booth's containers), so booth_id is
      // selected per row rather than assumed to be this booth's id.
      const { rows: components } = await client.query(
        `SELECT id, booth_id, current_location_id, current_status
           FROM booth_components
          WHERE current_container_id IN (
                  SELECT id FROM booth_containers WHERE booth_id = $1)
             OR (booth_id = $1 AND current_container_id IS NULL)
          FOR UPDATE`,
        [boothId]
      );

      // Components that belong to this booth but are currently packed inside
      // a container this booth does NOT own — e.g. lent out to another
      // booth's crate. They cannot travel with this move (that crate isn't
      // going anywhere), so the cascade correctly leaves them untouched. But
      // silently skipping them is a surprise the caller should be told about
      // rather than discover at the venue. Counted inside the same
      // transaction/FOR UPDATE scope so it reflects state at move time.
      const { rows: strandedRows } = await client.query(
        `SELECT COUNT(*)::int AS cnt
           FROM booth_components
          WHERE booth_id = $1
            AND current_container_id IS NOT NULL
            AND current_container_id NOT IN (
                  SELECT id FROM booth_containers WHERE booth_id = $1)`,
        [boothId]
      );
      const strandedComponents = strandedRows[0].cnt;

      const entries: MovementEntry[] = [];
      let movedBooths = 0;
      let movedContainers = 0;
      let movedComponents = 0;

      // The booth row itself gets no movement row (movements reference a
      // component or a container by constraint); its columns still update.
      const booth = booths[0];
      const nextLocation = req.toLocationId ?? booth.current_location_id;
      const nextStatus = req.toStatus ?? booth.current_status;
      if (nextLocation !== booth.current_location_id || nextStatus !== booth.current_status) {
        await client.query(
          `UPDATE booths SET current_location_id = $1, current_status = $2,
                  updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [nextLocation, nextStatus, boothId]
        );
        movedBooths = 1;
      }

      for (const container of containers) {
        if (await this.applyMove(client, 'booth_containers', 'container', container, boothId, req, entries)) {
          movedContainers += 1;
        }
      }
      for (const component of components) {
        // Same attribution fix as moveContainer: a component picked up via
        // the "inside this booth's containers" branch may belong to a
        // different booth (a borrowed piece), so tag its movement with its
        // own booth_id, not this booth's.
        if (await this.applyMove(client, 'booth_components', 'component', component, component.booth_id, req, entries)) {
          movedComponents += 1;
        }
      }

      const movements = [];
      for (const entry of entries) {
        movements.push(await boothMovementService.record(entry, client));
      }

      return {
        movedBooths, movedContainers, movedComponents, strandedComponents,
        movementIds: movements.map((m) => m.id),
      };
    });
  }

  async moveComponent(
    componentId: string,
    req: BulkMoveRequest & { toContainerId?: string | null }
  ): Promise<BulkMoveResult> {
    return boothMovementService.withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, booth_id, current_location_id, current_status, current_container_id
           FROM booth_components WHERE id = $1 FOR UPDATE`,
        [componentId]
      );
      if (!rows[0]) throw new NotFoundError('Component', componentId);
      const component = rows[0];

      const nextLocation = req.toLocationId ?? component.current_location_id;
      const nextStatus = req.toStatus ?? component.current_status;
      const nextContainer = req.toContainerId !== undefined
        ? req.toContainerId : component.current_container_id;

      const locationChanged = nextLocation !== component.current_location_id;
      const statusChanged = nextStatus !== component.current_status;
      const containerChanged = nextContainer !== component.current_container_id;

      if (!locationChanged && !statusChanged && !containerChanged) {
        return { movedBooths: 0, movedContainers: 0, movedComponents: 0, strandedComponents: 0, movementIds: [] };
      }

      await client.query(
        `UPDATE booth_components
            SET current_location_id = $1, current_status = $2,
                current_container_id = $3, updated_at = CURRENT_TIMESTAMP
          WHERE id = $4`,
        [nextLocation, nextStatus, nextContainer, componentId]
      );

      // A container change is the more specific story when both happened.
      const eventType: MovementEventType = containerChanged
        ? 'container_change'
        : (eventTypeFor(locationChanged, statusChanged) as MovementEventType);

      const movement = await boothMovementService.record({
        componentId,
        boothId: component.booth_id,
        eventType,
        fromLocationId: component.current_location_id,
        toLocationId: nextLocation,
        fromContainerId: component.current_container_id,
        toContainerId: nextContainer,
        fromStatus: component.current_status,
        toStatus: nextStatus,
        eventId: req.eventId ?? null,
        performedBy: req.performedBy,
        notes: req.notes ?? null,
        idempotencyKey: boothMovementService.derivedKey(req.idempotencyKey, 'component', componentId),
      }, client);

      return { movedBooths: 0, movedContainers: 0, movedComponents: 1, strandedComponents: 0, movementIds: [movement.id] };
    });
  }

  async reportComponent(componentId: string, req: ReportRequest): Promise<BoothMovement> {
    const movement = await boothMovementService.withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, booth_id, condition, current_status, current_location_id
           FROM booth_components WHERE id = $1 FOR UPDATE`,
        [componentId]
      );
      if (!rows[0]) throw new NotFoundError('Component', componentId);
      const component = rows[0];

      const isMissing = req.kind === 'missing';
      const nextCondition = isMissing
        ? component.condition
        : (req.condition ?? 'damaged');
      // Reporting damage on an already-missing piece must not un-miss it.
      const nextStatus = isMissing
        ? 'missing'
        : (component.current_status === 'missing' ? 'missing' : 'damaged');

      await client.query(
        `UPDATE booth_components
            SET condition = $1, current_status = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3`,
        [nextCondition, nextStatus, componentId]
      );

      return boothMovementService.record({
        componentId,
        boothId: component.booth_id,
        eventType: isMissing ? 'missing_report' : 'damage_report',
        fromStatus: component.current_status,
        toStatus: nextStatus,
        fromCondition: component.condition,
        toCondition: nextCondition,
        fromLocationId: component.current_location_id,
        toLocationId: component.current_location_id,
        eventId: req.eventId ?? null,
        performedBy: req.performedBy,
        notes: req.notes ?? null,
        idempotencyKey: boothMovementService.derivedKey(req.idempotencyKey, 'component', componentId),
      }, client);
    });

    // After commit: the people who look after the booths hear about it.
    void boothNotifications
      .componentReported({ componentId, kind: req.kind, notes: req.notes ?? null }, req.performedBy)
      .catch(logNotifyError('booth.component_reported'));

    return movement;
  }

  async verifyComponent(
    componentId: string,
    req: { eventId?: string | null; notes?: string | null; idempotencyKey?: string | null; performedBy: string }
  ): Promise<BoothMovement> {
    return boothMovementService.withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, booth_id, condition, current_status FROM booth_components
          WHERE id = $1 FOR UPDATE`,
        [componentId]
      );
      if (!rows[0]) throw new NotFoundError('Component', componentId);
      const component = rows[0];

      await client.query(
        `UPDATE booth_components
            SET last_verified_at = CURRENT_TIMESTAMP, last_verified_by = $1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [req.performedBy, componentId]
      );

      return boothMovementService.record({
        componentId,
        boothId: component.booth_id,
        eventType: 'verification',
        fromStatus: component.current_status,
        toStatus: component.current_status,
        eventId: req.eventId ?? null,
        performedBy: req.performedBy,
        notes: req.notes ?? null,
        idempotencyKey: boothMovementService.derivedKey(req.idempotencyKey, 'verify-component', componentId),
      }, client);
    });
  }

  /**
   * Damaged and missing pieces surfaced for one event: anything reported
   * against this event, plus anything currently in a bad state on a booth
   * assigned to it (a piece damaged at the last show is still a problem now).
   */
  async listExceptions(eventId: string): Promise<ExceptionRow[]> {
    const result = await dbQuery(
      `SELECT DISTINCT ON (c.id)
              c.id AS component_id, c.name AS component_name, c.asset_tag,
              c.booth_id, b.name AS booth_name,
              c.condition, c.current_status,
              m.notes, m.created_at AS reported_at, u.name AS reported_by_name
         FROM booth_components c
         JOIN booths b ON b.id = c.booth_id
         JOIN event_booth_assignments a ON a.booth_id = c.booth_id AND a.event_id = $1
         LEFT JOIN booth_movements m
                ON m.component_id = c.id
               AND m.event_type IN ('damage_report','missing_report')
         LEFT JOIN users u ON u.id = m.performed_by
        WHERE c.current_status IN ('missing','damaged')
           OR c.condition IN ('damaged','fair')
        ORDER BY c.id, m.created_at DESC NULLS LAST`,
      [eventId]
    );
    return result.rows as ExceptionRow[];
  }
}

export const boothInventoryService = new BoothInventoryService();
