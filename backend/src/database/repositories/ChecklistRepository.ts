/**
 * Checklist Repository
 * 
 * Handles all database operations for event checklists (trade show logistics).
 */

import { BaseRepository } from './BaseRepository';
import { NotFoundError } from '../../utils/errors';

export interface EventChecklist {
  id: number;
  event_id: string;
  booth_ordered: boolean;
  booth_notes?: string;
  electricity_ordered: boolean;
  electricity_notes?: string;
  booth_map_url?: string;
  templates_applied: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistFlight {
  id: number;
  checklist_id: number;
  attendee_id?: string;
  attendee_name: string;
  carrier?: string;
  confirmation_number?: string;
  notes?: string;
  booked: boolean;
  departure_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistHotel {
  id: number;
  checklist_id: number;
  attendee_id?: string;
  attendee_name: string;
  property_name?: string;
  confirmation_number?: string;
  check_in_date?: string;
  check_out_date?: string;
  notes?: string;
  booked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistCarRental {
  id: number;
  checklist_id: number;
  provider?: string;
  confirmation_number?: string;
  pickup_date?: string;
  return_date?: string;
  notes?: string;
  booked: boolean;
  rental_type: 'group' | 'individual';
  assigned_to_id?: string;
  assigned_to_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistBoothShipping {
  id: number;
  checklist_id: number;
  shipping_method: 'manual' | 'carrier';
  carrier_name?: string;
  tracking_number?: string;
  shipping_date?: string;
  delivery_date?: string;
  notes?: string;
  shipped: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistCustomItem {
  id: number;
  checklist_id: number;
  title: string;
  description?: string;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplate {
  id: number;
  title: string;
  description?: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class ChecklistRepository extends BaseRepository<EventChecklist> {
  protected tableName = 'event_checklists';

  /**
   * Find checklist by event ID
   */
  async findByEventId(eventId: string): Promise<EventChecklist | null> {
    const result = await this.executeQuery<EventChecklist>(
      `SELECT * FROM ${this.tableName} WHERE event_id = $1`,
      [eventId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create new checklist for event
   */
  async create(eventId: string): Promise<EventChecklist> {
    const result = await this.executeQuery<EventChecklist>(
      `INSERT INTO ${this.tableName} (event_id) 
       VALUES ($1) 
       RETURNING *`,
      [eventId]
    );
    return result.rows[0];
  }

  /**
   * Update checklist main fields
   */
  async updateMainFields(id: number, data: {
    boothOrdered?: boolean;
    boothNotes?: string;
    electricityOrdered?: boolean;
    electricityNotes?: string;
    boothMapUrl?: string;
  }): Promise<EventChecklist> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.boothOrdered !== undefined) {
      fields.push(`booth_ordered = $${paramIndex++}`);
      values.push(data.boothOrdered);
    }
    if (data.boothNotes !== undefined) {
      fields.push(`booth_notes = $${paramIndex++}`);
      values.push(data.boothNotes);
    }
    if (data.electricityOrdered !== undefined) {
      fields.push(`electricity_ordered = $${paramIndex++}`);
      values.push(data.electricityOrdered);
    }
    if (data.electricityNotes !== undefined) {
      fields.push(`electricity_notes = $${paramIndex++}`);
      values.push(data.electricityNotes);
    }
    if (data.boothMapUrl !== undefined) {
      fields.push(`booth_map_url = $${paramIndex++}`);
      values.push(data.boothMapUrl);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const result = await this.executeQuery<EventChecklist>(
      `UPDATE ${this.tableName} 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Checklist', id.toString());
    }

    return result.rows[0];
  }

  /**
   * Mark templates as applied
   */
  async markTemplatesApplied(id: number): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET templates_applied = true, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [id]
    );
  }

  // ==================== FLIGHTS ====================

  /**
   * Get all flights for a checklist
   */
  async getFlights(checklistId: number): Promise<ChecklistFlight[]> {
    const result = await this.executeQuery<ChecklistFlight>(
      `SELECT * FROM checklist_flights WHERE checklist_id = $1 ORDER BY id`,
      [checklistId]
    );
    return result.rows;
  }

  /**
   * Create flight
   */
  async createFlight(data: {
    checklistId: number;
    attendeeId?: string;
    attendeeName: string;
    carrier?: string;
    confirmationNumber?: string;
    notes?: string;
    booked?: boolean;
    departureAt?: string | null;
  }): Promise<ChecklistFlight> {
    const result = await this.executeQuery<ChecklistFlight>(
      `INSERT INTO checklist_flights
       (checklist_id, attendee_id, attendee_name, carrier, confirmation_number, notes, booked, departure_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.checklistId,
        data.attendeeId || null,
        data.attendeeName,
        data.carrier || null,
        data.confirmationNumber || null,
        data.notes || null,
        data.booked || false,
        data.departureAt || null
      ]
    );
    return result.rows[0];
  }

  /**
   * Update flight
   */
  async updateFlight(id: number, data: Partial<ChecklistFlight>): Promise<ChecklistFlight> {
    const fields = Object.keys(data).filter(key => key !== 'id' && key !== 'created_at' && key !== 'updated_at');
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = fields.map(field => (data as any)[field]);

    const result = await this.executeQuery<ChecklistFlight>(
      `UPDATE checklist_flights 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Flight', id.toString());
    }

    return result.rows[0];
  }

  /**
   * Delete flight
   */
  async deleteFlight(id: number): Promise<boolean> {
    const result = await this.executeQuery(
      `DELETE FROM checklist_flights WHERE id = $1`,
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  // ==================== HOTELS ====================

  /**
   * Get all hotels for a checklist
   */
  async getHotels(checklistId: number): Promise<ChecklistHotel[]> {
    const result = await this.executeQuery<ChecklistHotel>(
      `SELECT * FROM checklist_hotels WHERE checklist_id = $1 ORDER BY id`,
      [checklistId]
    );
    return result.rows;
  }

  /**
   * Create hotel
   */
  async createHotel(data: {
    checklistId: number;
    attendeeId?: string;
    attendeeName: string;
    propertyName?: string;
    confirmationNumber?: string;
    checkInDate?: string;
    checkOutDate?: string;
    notes?: string;
    booked?: boolean;
  }): Promise<ChecklistHotel> {
    const result = await this.executeQuery<ChecklistHotel>(
      `INSERT INTO checklist_hotels 
       (checklist_id, attendee_id, attendee_name, property_name, confirmation_number, 
        check_in_date, check_out_date, notes, booked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.checklistId,
        data.attendeeId || null,
        data.attendeeName,
        data.propertyName || null,
        data.confirmationNumber || null,
        data.checkInDate || null,
        data.checkOutDate || null,
        data.notes || null,
        data.booked || false
      ]
    );
    return result.rows[0];
  }

  /**
   * Update hotel
   */
  async updateHotel(id: number, data: Partial<ChecklistHotel>): Promise<ChecklistHotel> {
    const fields = Object.keys(data).filter(key => key !== 'id' && key !== 'created_at' && key !== 'updated_at');
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = fields.map(field => (data as any)[field]);

    const result = await this.executeQuery<ChecklistHotel>(
      `UPDATE checklist_hotels 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Hotel', id.toString());
    }

    return result.rows[0];
  }

  /**
   * Delete hotel
   */
  async deleteHotel(id: number): Promise<boolean> {
    const result = await this.executeQuery(
      `DELETE FROM checklist_hotels WHERE id = $1`,
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  // ==================== CAR RENTALS ====================

  /**
   * Get all car rentals for a checklist
   */
  async getCarRentals(checklistId: number): Promise<ChecklistCarRental[]> {
    const result = await this.executeQuery<ChecklistCarRental>(
      `SELECT * FROM checklist_car_rentals WHERE checklist_id = $1 ORDER BY id`,
      [checklistId]
    );
    return result.rows;
  }

  /**
   * Create car rental
   */
  async createCarRental(data: {
    checklistId: number;
    provider?: string;
    confirmationNumber?: string;
    pickupDate?: string;
    returnDate?: string;
    notes?: string;
    booked?: boolean;
    rentalType?: 'group' | 'individual';
    assignedToId?: string;
    assignedToName?: string;
  }): Promise<ChecklistCarRental> {
    const result = await this.executeQuery<ChecklistCarRental>(
      `INSERT INTO checklist_car_rentals 
       (checklist_id, provider, confirmation_number, pickup_date, return_date, notes, 
        booked, rental_type, assigned_to_id, assigned_to_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.checklistId,
        data.provider || null,
        data.confirmationNumber || null,
        data.pickupDate || null,
        data.returnDate || null,
        data.notes || null,
        data.booked || false,
        data.rentalType || 'group',
        data.assignedToId || null,
        data.assignedToName || null
      ]
    );
    return result.rows[0];
  }

  /**
   * Update car rental
   */
  async updateCarRental(id: number, data: Partial<ChecklistCarRental>): Promise<ChecklistCarRental> {
    const fields = Object.keys(data).filter(key => key !== 'id' && key !== 'created_at' && key !== 'updated_at');
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = fields.map(field => (data as any)[field]);

    const result = await this.executeQuery<ChecklistCarRental>(
      `UPDATE checklist_car_rentals 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('CarRental', id.toString());
    }

    return result.rows[0];
  }

  /**
   * Delete car rental
   */
  async deleteCarRental(id: number): Promise<boolean> {
    const result = await this.executeQuery(
      `DELETE FROM checklist_car_rentals WHERE id = $1`,
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  // ==================== BOOTH SHIPPING ====================

  /**
   * Get all booth shipping entries for a checklist
   */
  async getBoothShipping(checklistId: number): Promise<ChecklistBoothShipping[]> {
    const result = await this.executeQuery<ChecklistBoothShipping>(
      `SELECT * FROM checklist_booth_shipping WHERE checklist_id = $1 ORDER BY id`,
      [checklistId]
    );
    return result.rows;
  }

  /**
   * Create booth shipping entry
   */
  async createBoothShipping(data: {
    checklistId: number;
    shippingMethod: 'manual' | 'carrier';
    carrierName?: string;
    trackingNumber?: string;
    shippingDate?: string;
    deliveryDate?: string;
    notes?: string;
    shipped?: boolean;
  }): Promise<ChecklistBoothShipping> {
    const result = await this.executeQuery<ChecklistBoothShipping>(
      `INSERT INTO checklist_booth_shipping 
       (checklist_id, shipping_method, carrier_name, tracking_number, shipping_date, 
        delivery_date, notes, shipped)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.checklistId,
        data.shippingMethod,
        data.carrierName || null,
        data.trackingNumber || null,
        data.shippingDate || null,
        data.deliveryDate || null,
        data.notes || null,
        data.shipped || false
      ]
    );
    return result.rows[0];
  }

  /**
   * Update booth shipping entry
   */
  async updateBoothShipping(id: number, data: Partial<ChecklistBoothShipping>): Promise<ChecklistBoothShipping> {
    const fields = Object.keys(data).filter(key => key !== 'id' && key !== 'created_at' && key !== 'updated_at');
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = fields.map(field => (data as any)[field]);

    const result = await this.executeQuery<ChecklistBoothShipping>(
      `UPDATE checklist_booth_shipping 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *`,
      [id, ...values]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('BoothShipping', id.toString());
    }

    return result.rows[0];
  }

  /**
   * Delete booth shipping entry
   */
  async deleteBoothShipping(id: number): Promise<boolean> {
    const result = await this.executeQuery(
      `DELETE FROM checklist_booth_shipping WHERE id = $1`,
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  // ==================== CUSTOM ITEMS ====================

  /**
   * Get all custom items for a checklist
   */
  async getCustomItems(checklistId: number): Promise<ChecklistCustomItem[]> {
    const result = await this.executeQuery<ChecklistCustomItem>(
      `SELECT * FROM checklist_custom_items WHERE checklist_id = $1 ORDER BY position, id`,
      [checklistId]
    );
    return result.rows;
  }

  /**
   * Create custom item
   */
  async createCustomItem(data: {
    checklistId: number;
    title: string;
    description?: string;
    position?: number;
  }): Promise<ChecklistCustomItem> {
    const result = await this.executeQuery<ChecklistCustomItem>(
      `INSERT INTO checklist_custom_items 
       (checklist_id, title, description, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.checklistId, data.title, data.description || null, data.position || 0]
    );
    return result.rows[0];
  }

  /**
   * Update custom item
   */
  async updateCustomItem(id: number, data: {
    title?: string;
    description?: string;
    completed?: boolean;
    position?: number;
  }): Promise<ChecklistCustomItem> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.completed !== undefined) {
      fields.push(`completed = $${paramIndex++}`);
      values.push(data.completed);
    }
    if (data.position !== undefined) {
      fields.push(`position = $${paramIndex++}`);
      values.push(data.position);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const result = await this.executeQuery<ChecklistCustomItem>(
      `UPDATE checklist_custom_items 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('CustomItem', id.toString());
    }

    return result.rows[0];
  }

  /**
   * Delete custom item
   */
  async deleteCustomItem(id: number): Promise<boolean> {
    const result = await this.executeQuery(
      `DELETE FROM checklist_custom_items WHERE id = $1`,
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  // ==================== TEMPLATES ====================

  /**
   * Get all active templates
   */
  async getActiveTemplates(): Promise<ChecklistTemplate[]> {
    const result = await this.executeQuery<ChecklistTemplate>(
      `SELECT * FROM checklist_templates WHERE is_active = true ORDER BY position, id`
    );
    return result.rows;
  }

  /**
   * Get all templates (including inactive)
   */
  async getAllTemplates(): Promise<ChecklistTemplate[]> {
    const result = await this.executeQuery<ChecklistTemplate>(
      `SELECT * FROM checklist_templates ORDER BY position, id`
    );
    return result.rows;
  }

  /**
   * Create template
   */
  async createTemplate(data: {
    title: string;
    description?: string;
    position?: number;
  }): Promise<ChecklistTemplate> {
    const result = await this.executeQuery<ChecklistTemplate>(
      `INSERT INTO checklist_templates (title, description, position, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [data.title, data.description || null, data.position || 0]
    );
    return result.rows[0];
  }

  /**
   * Update template
   */
  async updateTemplate(id: number, data: {
    title?: string;
    description?: string;
    position?: number;
    is_active?: boolean;
  }): Promise<ChecklistTemplate> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.position !== undefined) {
      fields.push(`position = $${paramIndex++}`);
      values.push(data.position);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(data.is_active);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const result = await this.executeQuery<ChecklistTemplate>(
      `UPDATE checklist_templates 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Template', id.toString());
    }

    return result.rows[0];
  }

  /**
   * Soft delete template (set is_active = false)
   */
  async softDeleteTemplate(id: number): Promise<boolean> {
    const result = await this.executeQuery<ChecklistTemplate>(
      `UPDATE checklist_templates SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * Apply templates to a checklist (creates custom items from templates)
   */
  async applyTemplatesToChecklist(checklistId: number): Promise<number> {
    // Get all active templates
    const templates = await this.getActiveTemplates();

    // Insert each template as a custom item for this checklist
    const insertPromises = templates.map(template =>
      this.executeQuery(
        `INSERT INTO checklist_custom_items (checklist_id, title, description, position, completed)
         VALUES ($1, $2, $3, $4, false)
         ON CONFLICT DO NOTHING`,
        [checklistId, template.title, template.description, template.position]
      )
    );

    await Promise.all(insertPromises);

    // Mark templates as applied
    await this.markTemplatesApplied(checklistId);

    return templates.length;
  }
}

// Export singleton instance
export const checklistRepository = new ChecklistRepository();

