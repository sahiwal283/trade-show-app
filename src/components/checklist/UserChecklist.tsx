/**
 * UserChecklist — "My Itinerary" for the signed-in user.
 *
 * Read-only cards for the user's Flight, Hotel, and Car on the selected
 * show: confirmation number displayed large with one-tap copy, vendor,
 * dates, and notes. Renders its own masthead when it is the whole page;
 * `embedded` hides it when the parent page already provides one.
 */

import React, { useState, useEffect } from 'react';
import { Plane, Hotel, Car, CalendarOff, AlertCircle } from 'lucide-react';
import { User, TradeShow } from '../../App';
import { api } from '../../utils/api';
import { FlightData, HotelData, CarRentalData } from './TradeShowChecklist';
import { ItineraryCard } from './ItineraryCard';
import { joinSummary, formatDateRange } from './bookingText';

interface UserChecklistProps {
  user: User;
  /** True when rendered inside the checklist page tabs (masthead already shown). */
  embedded?: boolean;
}

/** The slice of the checklist the itinerary needs. */
interface ItineraryData {
  flights: FlightData[];
  hotels: HotelData[];
  carRentals: CarRentalData[];
}

export const UserChecklist: React.FC<UserChecklistProps> = ({ user, embedded = false }) => {
  const [events, setEvents] = useState<TradeShow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryData | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingItinerary, setLoadingItinerary] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        if (!api.USE_SERVER) return;
        const data = await api.getEvents();
        const allEvents: TradeShow[] = Array.isArray(data) ? data : [];

        // Prefer shows the user is on the roster for; fall back to all.
        const mine = allEvents.filter(event =>
          (event.participants || []).some(p => p.id === user.id)
        );
        const visible = mine.length > 0 ? mine : allEvents;

        setEvents(visible);
        if (visible.length > 0) {
          setSelectedEventId(visible[0].id);
        }
      } catch (error) {
        console.error('[UserChecklist] Error loading events:', error);
        setEvents([]);
      } finally {
        setLoadingEvents(false);
      }
    };

    loadEvents();
  }, [user.id]);

  useEffect(() => {
    if (!selectedEventId) return;

    const loadItinerary = async () => {
      setLoadingItinerary(true);
      setLoadFailed(false);
      try {
        if (!api.USE_SERVER) return;
        const data = (await api.checklist.getChecklist(selectedEventId)) as Record<string, unknown> | null;
        if (!data || typeof data !== 'object') {
          setItinerary(null);
          setLoadFailed(true);
          return;
        }
        setItinerary({
          flights: Array.isArray(data.flights) ? (data.flights as FlightData[]) : [],
          hotels: Array.isArray(data.hotels) ? (data.hotels as HotelData[]) : [],
          carRentals: Array.isArray(data.carRentals) ? (data.carRentals as CarRentalData[]) : [],
        });
      } catch (error) {
        console.error('[UserChecklist] Error loading itinerary:', error);
        setItinerary(null);
        setLoadFailed(true);
      } finally {
        setLoadingItinerary(false);
      }
    };

    loadItinerary();
  }, [selectedEventId]);

  const flight = itinerary?.flights.find(f => f.attendee_id?.toString() === user.id);
  const hotel = itinerary?.hotels.find(h => h.attendee_id?.toString() === user.id);
  // The user's car: their individual rental first, else the shared group car.
  const car =
    itinerary?.carRentals.find(
      r => r.rental_type === 'individual' && r.assigned_to_id?.toString() === user.id
    ) || itinerary?.carRentals.find(r => r.rental_type === 'group');

  const loading = loadingEvents || loadingItinerary;

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
      {/* Masthead (standalone page only) */}
      {!embedded && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            Travel
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
            My Itinerary
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Your bookings for the show — confirmations at a glance
          </p>
        </div>
      )}

      {/* Show switcher */}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="micro-label">{embedded ? 'My itinerary' : 'Show'}</p>
          <label className="inline-flex min-h-[44px] w-full items-center sm:w-auto lg:min-h-0">
            <span className="sr-only">Select show</span>
            <select
              value={selectedEventId || ''}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full max-w-full cursor-pointer rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-elevation-1 transition-colors hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-brand-500 sm:w-auto sm:text-xs"
            >
              {events.map(event => (
                <option key={event.id} value={event.id}>
                  {event.name} - {new Date(event.startDate).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loading && (
        <div aria-busy="true" className="card p-10 md:p-12">
          <div className="flex flex-col items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand-600" />
            <p className="mt-4 text-sm text-stone-500">Loading your itinerary...</p>
          </div>
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="card flex items-start gap-3 p-4 md:p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100">
            <CalendarOff aria-hidden="true" className="w-5 h-5 text-stone-400" />
          </span>
          <div>
            <p className="font-semibold text-stone-900">No shows yet</p>
            <p className="mt-1 text-sm text-stone-500">
              Once you're added to a trade show, your flight, hotel, and car details will appear here.
            </p>
          </div>
        </div>
      )}

      {!loading && events.length > 0 && loadFailed && (
        <div className="card flex items-start gap-3 p-4 md:p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
            <AlertCircle aria-hidden="true" className="w-5 h-5 text-amber-600" />
          </span>
          <div>
            <p className="font-semibold text-stone-900">Itinerary unavailable</p>
            <p className="mt-1 text-sm text-stone-500">
              We couldn't load your bookings for this show. Try refreshing, or check with your coordinator.
            </p>
          </div>
        </div>
      )}

      {!loading && events.length > 0 && !loadFailed && itinerary && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ItineraryCard
            icon={Plane}
            label="Flight"
            booked={!!flight?.booked}
            vendor={flight?.carrier}
            confirmation={flight?.confirmation_number}
            notes={flight?.notes}
          />
          <ItineraryCard
            icon={Hotel}
            label="Hotel"
            booked={!!hotel?.booked}
            vendor={hotel?.property_name}
            confirmation={hotel?.confirmation_number}
            dates={formatDateRange(hotel?.check_in_date, hotel?.check_out_date)}
            notes={hotel?.notes}
          />
          <ItineraryCard
            icon={Car}
            label="Car"
            booked={!!car?.booked}
            vendor={car?.provider}
            confirmation={car?.confirmation_number}
            dates={formatDateRange(car?.pickup_date, car?.return_date)}
            meta={
              car
                ? joinSummary([
                    car.rental_type === 'group' ? 'Group rental — shared vehicle' : null,
                    car.rental_type === 'individual' ? 'Reserved for you' : null,
                  ])
                : null
            }
            notes={car?.notes}
          />
        </div>
      )}
    </div>
  );
};
