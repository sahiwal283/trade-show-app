/**
 * Event Participant Service
 * 
 * Handles participant management for events with "best effort" behavior.
 * Extracted from events.ts to separate concerns and improve maintainability.
 */

import { query, pool } from '../config/database';
import { userRepository } from '../database/repositories';
import bcrypt from 'bcrypt';
import { notifyParticipantsAdded } from './telegram/TelegramNotifications';

export interface ParticipantObject {
  id: string;
  name: string;
  email: string;
  username?: string;
  role?: string;
}

/**
 * Process participants for an event (best effort - don't fail event if participant fails)
 * 
 * @param eventId - The event ID to add participants to
 * @param participants - Array of participant objects (full format)
 * @param participantIds - Array of user IDs (legacy format)
 * @param client - Optional database client for transaction support
 * @returns Array of successfully added participant IDs
 */
export async function processParticipants(
  eventId: string,
  participants?: ParticipantObject[],
  participantIds?: string[],
  client?: any,
  options?: { notify?: boolean }
): Promise<string[]> {
  const queryFn = client ? client.query.bind(client) : query;
  const notify = options?.notify ?? true;
  const addedParticipantIds: string[] = [];
  const newlyInsertedIds: string[] = [];

  // Handle full participant objects (new format)
  if (participants && Array.isArray(participants)) {
    console.log(`[EventParticipantService] Processing ${participants.length} participants (best effort)`);
    
    for (const participant of participants) {
      try {
        const userId = await ensureParticipantUser(participant, client);
        if (userId) {
          const inserted = await addParticipantToEvent(eventId, userId, queryFn);
          addedParticipantIds.push(userId);
          if (inserted) newlyInsertedIds.push(userId);
          console.log(`[EventParticipantService] ✓ Added participant ${userId} to event ${eventId}${inserted ? '' : ' (already a participant)'}`);
        }
      } catch (error: any) {
        console.error(`[EventParticipantService] ⚠️ Failed to add participant ${participant.name}:`, error.message);
        // Continue with next participant (best effort)
      }
    }
  } 
  // Handle participant IDs (legacy format)
  else if (participantIds && Array.isArray(participantIds)) {
    console.log(`[EventParticipantService] Processing ${participantIds.length} participant IDs (legacy format)`);
    
    for (const userId of participantIds) {
      try {
        const inserted = await addParticipantToEvent(eventId, userId, queryFn);
        addedParticipantIds.push(userId);
        if (inserted) newlyInsertedIds.push(userId);
        console.log(`[EventParticipantService] ✓ Added participant ${userId} to event ${eventId}${inserted ? '' : ' (already a participant)'}`);
      } catch (error: any) {
        console.error(`[EventParticipantService] ⚠️ Failed to add participant ${userId}:`, error.message);
        // Continue with next participant (best effort)
      }
    }
  }

  if (notify && newlyInsertedIds.length > 0) {
    notifyParticipantsAdded(eventId, newlyInsertedIds);
  }

  return addedParticipantIds;
}

/**
 * Get the current set of participant user IDs for an event.
 */
export async function getCurrentParticipantIds(
  eventId: string,
  client?: any
): Promise<string[]> {
  const queryFn = client ? client.query.bind(client) : query;
  const result = await queryFn(
    'SELECT user_id FROM event_participants WHERE event_id = $1',
    [eventId]
  );
  return (result.rows as Array<{ user_id: string }>).map((r) => r.user_id);
}

/**
 * Ensure participant user exists, create if needed
 * 
 * @param participant - Participant object with user details
 * @param client - Optional database client for transaction support
 * @returns User ID (existing or newly created)
 */
async function ensureParticipantUser(
  participant: ParticipantObject,
  client?: any
): Promise<string | null> {
  const queryFn = client ? client.query.bind(client) : query;
  
  // Check if user exists
  const existingUser = await userRepository.findById(participant.id);
  
  if (existingUser) {
    console.log(`[EventParticipantService] ✓ User already exists: ${participant.id}`);
    return participant.id;
  }

  // User doesn't exist, create them
  console.log(`[EventParticipantService] Creating new user for custom participant: ${participant.name} (${participant.email})`);
  
  try {
    const defaultPassword = await bcrypt.hash('changeme123', 10);
    const roleToUse = participant.role || 'temporary';
    
    console.log(`[EventParticipantService] DEBUG - Inserting user with role: "${roleToUse}"`);
    
    const newUserResult = await queryFn(
      'INSERT INTO users (id, username, password, name, email, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [participant.id, participant.username || participant.email, defaultPassword, participant.name, participant.email, roleToUse]
    );
    
    const userId = newUserResult.rows[0].id;
    console.log(`[EventParticipantService] ✓ Created user: ${userId}`);
    return userId;
  } catch (userError: any) {
    console.error(`[EventParticipantService] ⚠️ Failed to create user ${participant.email}:`, userError.message);
    // Return null to skip this participant
    return null;
  }
}

/**
 * Add participant to event (idempotent - uses ON CONFLICT DO NOTHING)
 * 
 * @param eventId - Event ID
 * @param userId - User ID
 * @param queryFn - Query function (supports transactions)
 */
async function addParticipantToEvent(
  eventId: string,
  userId: string,
  queryFn: typeof query
): Promise<boolean> {
  const result = await queryFn(
    'INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id',
    [eventId, userId]
  );
  return (result as any).rowCount > 0;
}

/**
 * Remove all participants from an event
 * 
 * @param eventId - Event ID
 * @param client - Optional database client for transaction support
 */
export async function removeAllParticipants(eventId: string, client?: any): Promise<void> {
  const queryFn = client ? client.query.bind(client) : query;
  await queryFn('DELETE FROM event_participants WHERE event_id = $1', [eventId]);
  console.log(`[EventParticipantService] Deleted existing participants for event ${eventId}`);
}

