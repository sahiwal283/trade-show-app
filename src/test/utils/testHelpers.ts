/**
 * Shared Test Utilities
 * 
 * Common mocks and helpers for frontend tests
 * Reduces duplication across test files
 */

import { User, TradeShow } from '../../App';
import { ChecklistData, FlightData, HotelData, CarRentalData } from '../../components/checklist/TradeShowChecklist';

/**
 * Create a mock user for testing
 */
export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'admin',
    username: 'testuser',
    ...overrides,
  };
}

/**
 * Create a mock event for testing
 */
export function createMockEvent(overrides?: Partial<TradeShow>): TradeShow {
  return {
    id: 'event-1',
    name: 'Test Event',
    venue: 'Test Venue',
    city: 'Test City',
    state: 'CA',
    startDate: '2025-11-01',
    endDate: '2025-11-03',
    showStartDate: '2025-11-01',
    showEndDate: '2025-11-03',
    travelStartDate: '2025-10-31',
    travelEndDate: '2025-11-04',
    status: 'upcoming',
    coordinatorId: 'user-1',
    participants: [
      { id: 'user-1', name: 'Test User', email: 'test@example.com', role: 'admin', username: 'testuser' },
    ],
    ...overrides,
  };
}

/**
 * Create an empty mock checklist for testing
 */
export function createEmptyChecklist(overrides?: Partial<ChecklistData>): ChecklistData {
  return {
    id: 1,
    event_id: 1,
    booth_ordered: false,
    booth_notes: null,
    booth_map_url: null,
    electricity_ordered: false,
    electricity_notes: null,
    flights: [],
    hotels: [],
    carRentals: [],
    boothShipping: [],
    customItems: [],
    ...overrides,
  };
}

/**
 * Create a mock checklist with sample data
 */
export function createMockChecklist(overrides?: Partial<ChecklistData>): ChecklistData {
  return {
    ...createEmptyChecklist(),
    flights: [
      {
        id: 1,
        attendee_id: 'user-1',
        attendee_name: 'Test User',
        carrier: 'United Airlines',
        confirmation_number: 'ABC123',
        notes: 'Window seat preferred',
        booked: false,
      },
    ],
    hotels: [
      {
        id: 1,
        attendee_id: 'user-1',
        attendee_name: 'Test User',
        property_name: 'Marriott Downtown',
        confirmation_number: 'MAR123',
        check_in_date: '2025-11-10',
        check_out_date: '2025-11-15',
        notes: 'King bed',
        booked: false,
      },
    ],
    carRentals: [
      {
        id: 1,
        provider: 'Enterprise',
        confirmation_number: 'ENT123',
        pickup_date: '2025-11-10',
        return_date: '2025-11-15',
        notes: 'SUV preferred',
        booked: false,
        rental_type: 'group',
      },
    ],
    ...overrides,
  };
}

/**
 * Create a mock flight data
 */
export function createMockFlight(overrides?: Partial<FlightData>): FlightData {
  return {
    attendee_id: 'user-1',
    attendee_name: 'Test User',
    carrier: 'United Airlines',
    confirmation_number: 'ABC123',
    notes: null,
    booked: false,
    ...overrides,
  };
}

/**
 * Create a mock hotel data
 */
export function createMockHotel(overrides?: Partial<HotelData>): HotelData {
  return {
    attendee_id: 'user-1',
    attendee_name: 'Test User',
    property_name: 'Marriott Downtown',
    confirmation_number: 'MAR123',
    check_in_date: '2025-11-10',
    check_out_date: '2025-11-15',
    notes: null,
    booked: false,
    ...overrides,
  };
}

/**
 * Create a mock car rental data
 */
export function createMockCarRental(overrides?: Partial<CarRentalData>): CarRentalData {
  return {
    provider: 'Enterprise',
    confirmation_number: 'ENT123',
    pickup_date: '2025-11-10',
    return_date: '2025-11-15',
    notes: null,
    booked: false,
    rental_type: 'group',
    ...overrides,
  };
}

