/**
 * Event Utility Functions
 *
 * Functions for filtering and managing events, including
 * automatic removal of old events from dropdowns.
 */

import { TradeShow, User } from '../App';
import { parseLocalDate } from './dateUtils';

/**
 * Filters out events that are more than 1 month + 1 day past their end date.
 * 
 * This keeps dropdowns clean by automatically removing old events that are
 * no longer relevant for new expense submissions.
 * 
 * Example: If event ends on 11/3/25, it will be removed from dropdowns
 * after 12/4/25 (1 month + 1 day later).
 * 
 * @param events - Array of events to filter
 * @returns Filtered array of events (only recent/active events)
 */
export function filterActiveEvents(events: TradeShow[]): TradeShow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  
  return events.filter(event => {
    // Parse the event end date as a local date (avoids the UTC off-by-one)
    const endDate = parseLocalDate(event.endDate);
    
    // Calculate cutoff date: end date + 1 month + 1 day
    const cutoffDate = new Date(endDate);
    cutoffDate.setMonth(cutoffDate.getMonth() + 1); // Add 1 month
    cutoffDate.setDate(cutoffDate.getDate() + 1);   // Add 1 day
    
    // Keep event if today is before the cutoff date
    return today < cutoffDate;
  });
}

/**
 * Filters events to only show those where the user is a participant.
 * 
 * Admin, accountant, developer, and coordinator roles can see all events regardless of participation.
 * Regular users (salesperson) can only see events where they are listed as participants.
 * 
 * This ensures users can only submit expenses to events they're actually attending,
 * except coordinators who need to submit expenses for event logistics (flights, hotels, etc.).
 * 
 * @param events - Array of events to filter
 * @param user - Current logged-in user
 * @returns Filtered array of events (only user's events or all for admins/accountants/developers/coordinators)
 */
export function filterEventsByParticipation(events: TradeShow[], user: User): TradeShow[] {
  // Admin, accountant, developer, and coordinator can see all events
  if (user.role === 'admin' || user.role === 'accountant' || user.role === 'developer' || user.role === 'coordinator') {
    return events;
  }
  
  // Regular users can only see events where they are participants
  return events.filter(event => {
    // Check if user is in the participants list
    return event.participants.some(participant => participant.id === user.id);
  });
}
