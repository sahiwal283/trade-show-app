/**
 * TradeShowChecklist — Editorial Finance booking board for show logistics.
 *
 * One designed surface: masthead with the event switcher, a segmented
 * Admin/My tab control, the readiness story (display numeral), then a
 * booking board — Booth / Flights / Hotels / Cars / Tasks tabs, each
 * labeled with its done/total count. Only the active tab renders.
 */

import React, { useState, useEffect } from 'react';
import { User, TradeShow } from '../../App';
import { api } from '../../utils/api';
import { AlertCircle } from 'lucide-react';
import { BookingBoard } from './BookingBoard';
import { UserChecklist } from './UserChecklist';

export interface ChecklistData {
  id: number;
  event_id: number;
  booth_ordered: boolean;
  booth_notes: string | null;
  booth_map_url: string | null;
  electricity_ordered: boolean;
  electricity_notes: string | null;
  flights: FlightData[];
  hotels: HotelData[];
  carRentals: CarRentalData[];
  boothShipping: BoothShippingData[];
  customItems: CustomItemData[];
}

export interface FlightData {
  id?: number;
  attendee_id: string | null;
  attendee_name: string;
  carrier: string | null;
  confirmation_number: string | null;
  notes: string | null;
  booked: boolean;
  /** ISO timestamp — drives check-in push reminders (T-24h and T-3h) */
  departure_at?: string | null;
}

export interface HotelData {
  id?: number;
  attendee_id: string | null;
  attendee_name: string;
  property_name: string | null;
  confirmation_number: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  notes: string | null;
  booked: boolean;
}

export interface CarRentalData {
  id?: number;
  provider: string | null;
  confirmation_number: string | null;
  pickup_date: string | null;
  return_date: string | null;
  notes: string | null;
  booked: boolean;
  rental_type?: 'individual' | 'group';
  assigned_to_id?: string | null;
  assigned_to_name?: string | null;
}

export interface BoothShippingData {
  id?: number;
  shipping_method: 'manual' | 'carrier';
  carrier_name: string | null;
  tracking_number: string | null;
  shipping_date: string | null;
  delivery_date: string | null;
  notes: string | null;
  shipped: boolean;
}

export interface CustomItemData {
  id?: number;
  checklist_id: number;
  title: string;
  description: string | null;
  completed: boolean;
  position: number;
  created_at?: string;
  updated_at?: string;
}

interface TradeShowChecklistProps {
  user: User;
}

type ChecklistTab = 'admin' | 'user';

/** Overall completion — same counting rules the page has always used:
 *  booth (1) + electricity (1) + every flight/hotel/rental + shipping (1). */
function getProgressSummary(checklist: ChecklistData | null): {
  completed: number;
  total: number;
  pct: number;
} {
  if (!checklist) return { completed: 0, total: 0, pct: 0 };

  let completed = 0;
  let total = 0;

  total += 1;
  if (checklist.booth_ordered) completed += 1;

  total += 1;
  if (checklist.electricity_ordered) completed += 1;

  total += checklist.flights.length;
  completed += checklist.flights.filter(f => f.booked).length;

  total += checklist.hotels.length;
  completed += checklist.hotels.filter(h => h.booked).length;

  total += checklist.carRentals.length;
  completed += checklist.carRentals.filter(c => c.booked).length;

  total += 1;
  if (checklist.boothShipping.length > 0 && checklist.boothShipping[0].shipped) completed += 1;

  return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

export const TradeShowChecklist: React.FC<TradeShowChecklistProps> = ({ user }) => {
  const isPrivilegedUser = user.role === 'admin' || user.role === 'coordinator' || user.role === 'developer';
  const [activeTab, setActiveTab] = useState<ChecklistTab>(isPrivilegedUser ? 'admin' : 'user');
  const [events, setEvents] = useState<TradeShow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeTab === 'admin') {
      loadEvents();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedEventId) {
      loadChecklist(selectedEventId);
    }
  }, [selectedEventId]);

  const loadEvents = async () => {
    try {
      if (api.USE_SERVER) {
        console.log('[Checklist] Fetching events...');
        const data = await api.getEvents();
        console.log('[Checklist] API response:', data);

        // Defensive check: ensure data is an array
        if (!data) {
          console.error('[Checklist] API returned null/undefined');
          setEvents([]);
          return;
        }

        // Normalize to array if needed
        const eventsArray = Array.isArray(data) ? data : [];

        console.log('[Checklist] Loaded events:', eventsArray.length, 'events');
        setEvents(eventsArray);

        if (eventsArray.length > 0 && !selectedEventId) {
          console.log('[Checklist] Auto-selecting first event:', eventsArray[0].id);
          setSelectedEventId(eventsArray[0].id);
        }
      }
    } catch (error) {
      console.error('[Checklist] Error loading events:', error);
      setEvents([]);
    }
  };

  const loadChecklist = async (eventId: string) => {
    setLoading(true);
    try {
      if (api.USE_SERVER) {
        console.log('[Checklist] Loading checklist for event:', eventId);
        const data = await api.checklist.getChecklist(eventId) as unknown;
        console.log('[Checklist] Checklist loaded:', data);

        // Defensive normalization: ensure all arrays exist and are actually arrays
        if (!data || typeof data !== 'object') {
          console.warn('[Checklist] No data received from API or invalid data type');
          setChecklist(null);
          return;
        }

        // Type guard: ensure data is an object with expected structure
        const dataObj = data as Record<string, unknown>;

        // Normalize response data to ensure all arrays exist
        const normalizedData: ChecklistData = {
          id: typeof dataObj.id === 'number' ? dataObj.id : 0,
          event_id: typeof dataObj.event_id === 'number' ? dataObj.event_id : 0,
          booth_ordered: typeof dataObj.booth_ordered === 'boolean' ? dataObj.booth_ordered : false,
          booth_notes: typeof dataObj.booth_notes === 'string' ? dataObj.booth_notes : null,
          booth_map_url: typeof dataObj.booth_map_url === 'string' ? dataObj.booth_map_url : null,
          electricity_ordered: typeof dataObj.electricity_ordered === 'boolean' ? dataObj.electricity_ordered : false,
          electricity_notes: typeof dataObj.electricity_notes === 'string' ? dataObj.electricity_notes : null,
          // Ensure flights is an array
          flights: Array.isArray(dataObj.flights) ? dataObj.flights as FlightData[] : [],
          // Ensure hotels is an array
          hotels: Array.isArray(dataObj.hotels) ? dataObj.hotels as HotelData[] : [],
          // Ensure carRentals is an array
          carRentals: Array.isArray(dataObj.carRentals) ? dataObj.carRentals as CarRentalData[] : [],
          // Ensure boothShipping is an array
          boothShipping: Array.isArray(dataObj.boothShipping) ? dataObj.boothShipping as BoothShippingData[] : [],
          // Ensure customItems is an array
          customItems: Array.isArray(dataObj.customItems) ? dataObj.customItems as CustomItemData[] : [],
        };

        console.log('[Checklist] Normalized checklist data:', normalizedData);
        setChecklist(normalizedData);
      }
    } catch (error) {
      console.error('[Checklist] Error loading checklist:', error);
      setChecklist(null);
    } finally {
      setLoading(false);
    }
  };

  const updateChecklist = async (updates: Partial<ChecklistData>) => {
    if (!checklist) return;

    setSaving(true);
    try {
      if (api.USE_SERVER) {
        await api.checklist.updateChecklist(checklist.id, {
          boothOrdered: updates.booth_ordered ?? checklist.booth_ordered,
          boothNotes: updates.booth_notes ?? checklist.booth_notes,
          electricityOrdered: updates.electricity_ordered ?? checklist.electricity_ordered,
          electricityNotes: updates.electricity_notes ?? checklist.electricity_notes
        });
        setChecklist({ ...checklist, ...updates });
      }
    } catch (error) {
      console.error('[Checklist] Error updating checklist:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  // For regular users, show only User Checklist
  if (!isPrivilegedUser) {
    return <UserChecklist user={user} />;
  }

  const progress = getProgressSummary(checklist);

  const tabClasses = (tab: ChecklistTab) =>
    `min-h-[44px] rounded-full px-4 py-1.5 text-sm font-semibold transition-colors lg:min-h-0 ${
      activeTab === tab
        ? 'bg-white text-stone-900 shadow-elevation-1'
        : 'text-stone-500 hover:text-stone-800'
    }`;

  // For privileged users, show tabs
  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
      {/* Masthead */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            Logistics
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
            Checklist
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Manage logistics and preparations for trade shows
          </p>
        </div>

        {activeTab === 'admin' && (
          <label className="inline-flex min-h-[44px] w-full items-center sm:w-auto lg:min-h-0">
            <span className="sr-only">Select event</span>
            <select
              value={selectedEventId || ''}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full max-w-full cursor-pointer rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-elevation-1 transition-colors hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-brand-500 sm:w-auto sm:text-xs"
            >
              {events.length === 0 ? (
                <option value="">No events available</option>
              ) : (
                events.map(event => (
                  <option key={event.id} value={event.id}>
                    {event.name} - {new Date(event.startDate).toLocaleDateString()}
                  </option>
                ))
              )}
            </select>
          </label>
        )}
      </div>

      {/* Tabs — segmented control */}
      <div className="inline-flex rounded-full bg-stone-100 p-1">
        <button type="button" onClick={() => setActiveTab('admin')} className={tabClasses('admin')}>
          Admin Checklist
        </button>
        <button type="button" onClick={() => setActiveTab('user')} className={tabClasses('user')}>
          My Checklist
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'user' ? (
        <UserChecklist user={user} embedded />
      ) : (
        <>
          {!selectedEvent && (
            <div className="card flex items-start gap-3 p-4 md:p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <AlertCircle aria-hidden="true" className="w-5 h-5 text-amber-600" />
              </span>
              <div>
                <p className="font-semibold text-stone-900">No Event Selected</p>
                <p className="mt-1 text-sm text-stone-500">
                  Please select an event from the dropdown above to manage its checklist.
                </p>
              </div>
            </div>
          )}

          {selectedEvent && loading && (
            <div aria-busy="true" className="card p-10 md:p-12">
              <div className="flex flex-col items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand-600" />
                <p className="mt-4 text-sm text-stone-500">Loading checklist...</p>
              </div>
            </div>
          )}

          {selectedEvent && !loading && !checklist && (
            <div className="card flex items-start gap-3 p-4 md:p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
                <AlertCircle aria-hidden="true" className="w-5 h-5 text-red-600" />
              </span>
              <div>
                <p className="font-semibold text-stone-900">Failed to Load Checklist</p>
                <p className="mt-1 text-sm text-stone-500">
                  Unable to load the checklist data. Please try refreshing the page or contact support if the issue persists.
                </p>
              </div>
            </div>
          )}

          {selectedEvent && !loading && checklist && (
            <BookingBoard
              checklist={checklist}
              user={user}
              event={selectedEvent}
              saving={saving}
              onUpdate={updateChecklist}
              onReload={() => loadChecklist(selectedEventId!)}
              progress={progress}
            />
          )}
        </>
      )}
    </div>
  );
};
