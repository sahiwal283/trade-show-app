/**
 * Repository Index
 * 
 * Central export point for all repository classes.
 * Repositories provide a clean abstraction layer for database operations,
 * separating data access logic from business logic in routes and services.
 */

// Export base repository
export { BaseRepository } from './BaseRepository';

// Export repositories and their interfaces
export { ExpenseRepository, expenseRepository } from './ExpenseRepository';
export type { Expense, ExpenseWithDetails } from './ExpenseRepository';

export { UserRepository, userRepository } from './UserRepository';
export type { User, UserWithoutPassword } from './UserRepository';

export { EventRepository, eventRepository } from './EventRepository';
export type { Event, EventWithStats, EventWithParticipants } from './EventRepository';

export { AuditLogRepository, auditLogRepository } from './AuditLogRepository';
export type { AuditLog, AuditLogFilters } from './AuditLogRepository';

export { ApiRequestRepository, apiRequestRepository } from './ApiRequestRepository';
export type { ApiRequest, ApiRequestStats } from './ApiRequestRepository';

export { ChecklistRepository, checklistRepository } from './ChecklistRepository';
export type {
  EventChecklist,
  ChecklistFlight,
  ChecklistHotel,
  ChecklistCarRental,
  ChecklistBoothShipping,
  ChecklistCustomItem
} from './ChecklistRepository';

export { RoleRepository, roleRepository } from './RoleRepository';
export type { Role } from './RoleRepository';

export { UserChecklistRepository, userChecklistRepository } from './UserChecklistRepository';
export type { UserChecklistItem } from './UserChecklistRepository';

export { inventoryLocationRepository, InventoryLocationRepository } from './InventoryLocationRepository';
export type { InventoryLocation, LocationFilters } from './InventoryLocationRepository';

export { boothRepository, BoothRepository } from './BoothRepository';
export type { Booth, BoothWithCounts, BoothFilters } from './BoothRepository';

export { boothContainerRepository, BoothContainerRepository } from './BoothContainerRepository';
export type { BoothContainer } from './BoothContainerRepository';

export { boothComponentRepository, BoothComponentRepository } from './BoothComponentRepository';
export type { BoothComponent, ComponentFilters } from './BoothComponentRepository';

export { boothMovementRepository, BoothMovementRepository } from './BoothMovementRepository';
export type { BoothMovement, MovementQueryOptions } from './BoothMovementRepository';

export { eventBoothAssignmentRepository, EventBoothAssignmentRepository } from './EventBoothAssignmentRepository';
export type { EventBoothAssignment } from './EventBoothAssignmentRepository';

export { boothAttachmentRepository, BoothAttachmentRepository } from './BoothAttachmentRepository';
export type { BoothAttachment, AttachmentEntityType } from './BoothAttachmentRepository';

export { badgeScanRepository, BadgeScanRepository } from './BadgeScanRepository';
export type { BadgeScan, BadgeScanFilters, PushResult } from './BadgeScanRepository';

