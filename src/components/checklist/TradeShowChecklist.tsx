/**
 * TradeShowChecklist — Editorial Finance booking board for show logistics.
 *
 * One designed surface: masthead with the event switcher, a segmented
 * Admin/My tab control, the readiness story (display numeral), then a
 * booking board — Booth / Flights / Hotels / Cars / Tasks / Samples tabs, each
 * labeled with its done/total count. Only the active tab renders.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, TradeShow } from '../../App';
import { api } from '../../utils/api';
import { parseLocalDate } from '../../utils/dateUtils';
import { AlertCircle } from 'lucide-react';
import { BookingBoard } from './BookingBoard';
import { UserChecklist } from './UserChecklist';
import { ChecklistMasthead } from './ChecklistMasthead';
import type { BoardTabKey } from './BookingBoardTabs';

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

/**
 * Default show for the checklist: a live show wins, otherwise the next
 * upcoming one, otherwise the most recently ended past show. Never "whatever
 * was created last" — that is how bookings land on the wrong show.
 */
function pickDefaultEvent(events: TradeShow[]): TradeShow {
  const now = new Date();
  const startOf = (e: TradeShow) => parseLocalDate(e.showStartDate || e.startDate);
  const endOf = (e: TradeShow) => parseLocalDate(e.showEndDate || e.endDate || e.startDate);

  const live = events.find(e => startOf(e) <= now && endOf(e) >= now);
  if (live) return live;

  const upcoming = events
    .filter(e => startOf(e) > now)
    .sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  if (upcoming.length > 0) return upcoming[0];

  const past = [...events].sort((a, b) => endOf(b).getTime() - endOf(a).getTime());
  return past[0];
}

export const TradeShowChecklist: React.FC<TradeShowChecklistProps> = ({ user }) => {
  const isPrivilegedUser = user.role === 'admin' || user.role === 'coordinator' || user.role === 'developer';
  const initialHash = () => new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const [activeTab, setActiveTab] = useState<ChecklistTab>(() =>
    initialHash().get('tab') === 'my' ? 'user' : isPrivilegedUser ? 'admin' : 'user');
  // A deep link's board-tab request is bound to its show, so it can only land on that show's board.
  const [boardRequest, setBoardRequest] = useState<{ eventId: string; tab: BoardTabKey } | null>(() => {
    const h = initialHash();
    const id = h.get('event');
    return h.get('tab') === 'samples' && id ? { eventId: id, tab: 'samples' } : null;
  });
  const clearBoardRequest = useCallback(() => setBoardRequest(null), []);
  const [events, setEvents] = useState<TradeShow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(false);
  // Which show the loaded checklist belongs to; the board only mounts when it matches the selection.
  const [loadedEventId, setLoadedEventId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeTab === 'admin') loadEvents();
  }, [activeTab]);

  const loadSeq = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedEventId;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  // A deep link followed while the page is open. Reps' links are handled by UserChecklist.
  useEffect(() => {
    if (!isPrivilegedUser) return;
    const onHashChange = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const linkedId = params.get('event');
      if (!linkedId) return;
      const tab = params.get('tab');
      if (tab === 'my') { setActiveTab('user'); return; }   // embedded UserChecklist consumes it
      if (tab === 'samples') setActiveTab('admin');         // a bare event link leaves the tab alone
      const loaded = eventsRef.current;
      const known = loaded.some((e) => e.id === linkedId);
      if (tab === 'samples' && (known || loaded.length === 0)) setBoardRequest({ eventId: linkedId, tab: 'samples' });
      if (known) setSelectedEventId(linkedId);
      // Events not loaded yet: loadEvents reads the hash. Otherwise consume it (an unknown id is dropped).
      if (loaded.length > 0) history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [isPrivilegedUser]);

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

        // Deep link from an event card (#event=<id>) wins over the default
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const linkedId = params.get('event');
        if (linkedId && eventsArray.some((e) => e.id === linkedId)) {
          setSelectedEventId(linkedId);
          // The admin tab consumes this hash; UserChecklist clears its own.
          if (activeTab === 'admin') {
            history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        } else if (linkedId && activeTab === 'admin') {
          // Unresolvable link: drop the request and the hash, fall back to the default show.
          setBoardRequest(null);
          history.replaceState(null, '', window.location.pathname + window.location.search);
          if (eventsArray.length > 0 && !selectedEventId) setSelectedEventId(pickDefaultEvent(eventsArray).id);
        } else if (eventsArray.length > 0 && !selectedEventId) {
          const defaultEvent = pickDefaultEvent(eventsArray);
          console.log('[Checklist] Auto-selecting default event:', defaultEvent.id, defaultEvent.name);
          setSelectedEventId(defaultEvent.id);
        }
      }
    } catch (error) {
      console.error('[Checklist] Error loading events:', error);
      setEvents([]);
    }
  };

  // background=true refreshes data without unmounting the board — this is what
  // preserves unsaved row edits, the expanded row, and the active tab.
  const loadChecklist = async (eventId: string, opts: { background?: boolean } = {}) => {
    // A background reload for a show that is no longer selected must not supersede the current show's load.
    if (opts.background && eventId !== selectedIdRef.current) return;
    if (!opts.background) { setLoading(true); setLoadedEventId(null); }
    const myLoad = ++loadSeq.current;
    try {
      if (api.USE_SERVER) {
        console.log('[Checklist] Loading checklist for event:', eventId);
        const data = await api.checklist.getChecklist(eventId) as unknown;
        if (myLoad !== loadSeq.current) return;   // a newer load superseded this one
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
        setLoadedEventId(eventId);
      }
    } catch (error) {
      if (myLoad !== loadSeq.current) return;
      console.error('[Checklist] Error loading checklist:', error);
      setChecklist(null);
    } finally {
      if (myLoad === loadSeq.current) setLoading(false);
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

  if (!isPrivilegedUser) {
    return <UserChecklist user={user} />;
  }

  const progress = getProgressSummary(checklist);

  const tabClasses = (tab: ChecklistTab) =>
    `seg-tab ${activeTab === tab ? 'seg-tab-active' : 'seg-tab-idle'}`;

  // For privileged users, show tabs
  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
      {/* Masthead — the show is the headline; switcher + readiness ride it */}
      <ChecklistMasthead
        events={events}
        selectedEvent={selectedEvent || null}
        onSelectEvent={(id) => { setBoardRequest(null); setSelectedEventId(id); }}
        showSelector={activeTab === 'admin'}
        progress={activeTab === 'admin' && checklist && !loading ? progress : null}
      />

      {/* Tabs — segmented control */}
      <div className="seg-track">
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

          {selectedEvent && (loading || (checklist && loadedEventId !== selectedEventId)) && (
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

          {selectedEvent && !loading && checklist && loadedEventId === selectedEventId && (
            <BookingBoard
              key={selectedEvent.id}
              checklist={checklist}
              user={user}
              event={selectedEvent}
              saving={saving}
              requestedTab={boardRequest && boardRequest.eventId === selectedEvent.id ? boardRequest.tab : null}
              onRequestedTabHandled={clearBoardRequest}
              onUpdate={updateChecklist}
              onReload={() => loadChecklist(selectedEventId!, { background: true })}
              onRosterChanged={() => {
                loadEvents();
                loadChecklist(selectedEventId!, { background: true });
              }}
            />
          )}
        </>
      )}
    </div>
  );
};
