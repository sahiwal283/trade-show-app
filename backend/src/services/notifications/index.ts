/** The notification catalog: every trigger Argo notifies about lives here. */
export { notifyMany, logNotifyError } from './notifyMany';
export { eventParticipants, usersWithRole, activeUsers } from './recipients';
export { eventById, eventByChecklistId } from './eventRefs';
export type { EventSnapshot } from './eventRefs';

export { eventNotifications, diffEventDetails } from './eventNotifications';
export type { DetailChange, AfterUpdateInput } from './eventNotifications';

export { boothNotifications } from './boothNotifications';
export type { ComponentReport } from './boothNotifications';

export { travelNotifications, classifyBooking, FLIGHT, HOTEL, CAR_RENTAL } from './travelNotifications';
export type { BookingRow, BookingEffect, BookingConfig } from './travelNotifications';

export { adminNotifications } from './adminNotifications';
export type { PendingUser } from './adminNotifications';

export { ReminderScheduler, reminderScheduler } from './ReminderScheduler';
export { REMINDER_DEFINITIONS } from './reminderDefinitions';
export type { ReminderDefinition, DueRow } from './reminderDefinitions';

export { expenseNotifications, CONVERSATION_KINDS } from './expenseNotifications';
