/**
 * ExpenseAuditService
 * 
 * Handles audit logging for expense changes
 */

import { query } from '../config/database';

export interface AuditLogEntry {
  id: string;
  expenseId: string;
  userId: string;
  userName: string;
  action: 'created' | 'updated' | 'status_changed' | 'entity_assigned' | 'pushed_to_zoho' | 'receipt_replaced';
  changes: Record<string, { old: any; new: any }>;
  timestamp: string;
}

function normalizeChangesJson(
  raw: unknown
): Record<string, { old: any; new: any }> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, { old: any; new: any }>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, { old: any; new: any }>;
  }
  return {};
}

export class ExpenseAuditService {
  /**
   * Log an expense change
   */
  static async logChange(
    expenseId: string,
    userId: string,
    userName: string,
    action: AuditLogEntry['action'],
    changes: Record<string, { old: any; new: any }>
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO expense_audit_log (expense_id, user_id, user_name, action, changes)
         VALUES ($1, $2, $3, $4, $5)`,
        [expenseId, userId, userName, action, JSON.stringify(changes)]
      );
      console.log(`[Audit] Logged ${action} for expense ${expenseId} by ${userName}`);
    } catch (error) {
      console.error('[Audit] Failed to log change:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Get audit trail for an expense
   */
  static async getAuditTrail(expenseId: string): Promise<AuditLogEntry[]> {
    try {
      const result = await query(
        `SELECT 
          id,
          expense_id,
          user_id,
          user_name,
          action,
          changes,
          timestamp
         FROM expense_audit_log
         WHERE expense_id = $1
         ORDER BY timestamp DESC`,
        [expenseId]
      );

      return result.rows.map(row => ({
        id: row.id,
        expenseId: row.expense_id,
        userId: row.user_id,
        userName: row.user_name,
        action: row.action,
        changes: normalizeChangesJson(row.changes),
        timestamp: row.timestamp
      }));
    } catch (error) {
      console.error('[Audit] Failed to get audit trail:', error);
      return [];
    }
  }

  /**
   * Compare old and new expense data to detect changes
   */
  static detectChanges(
    oldExpense: Record<string, any>,
    newExpense: Record<string, any>,
    fieldsToTrack: string[]
  ): Record<string, { old: any; new: any }> {
    const changes: Record<string, { old: any; new: any }> = {};

    for (const field of fieldsToTrack) {
      const oldValue = oldExpense[field];
      const newValue = newExpense[field];

      // Handle null/undefined comparison
      if (oldValue !== newValue) {
        // Skip if both are null/undefined
        if (oldValue == null && newValue == null) continue;
        
        // Skip if values are equal when converted to string (handles type differences)
        if (String(oldValue) === String(newValue)) continue;

        changes[field] = {
          old: oldValue,
          new: newValue
        };
      }
    }

    return changes;
  }
}

