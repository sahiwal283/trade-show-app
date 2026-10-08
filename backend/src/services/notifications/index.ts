/** The notification catalog: every trigger Argo notifies about lives here. */
export { notifyMany, logNotifyError } from './notifyMany';
export { eventParticipants, usersWithRole, activeUsers } from './recipients';
export { eventById, eventByChecklistId } from './eventRefs';
export type { EventSnapshot } from './eventRefs';

export { eventNotifications, diffEventDetails } from './eventNotifications';
export type { DetailChange, AfterUpdateInput } from './eventNotifications';
