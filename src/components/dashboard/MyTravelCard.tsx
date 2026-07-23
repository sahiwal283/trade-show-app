/**
 * MyTravelCard — the signed-in user's flight, hotel, and car for the show
 * on screen, lifted out of the buried Checklist tab onto the Dashboard.
 * Confirmation numbers are the hero (one-tap copy via ItineraryCard).
 */

import React, { useEffect, useState } from 'react';
import { Plane, Hotel, Car, ArrowRight } from 'lucide-react';
import { User, TradeShow } from '../../App';
import { api } from '../../utils/api';
import { ItineraryCard } from '../checklist/ItineraryCard';
import { formatDateRange, joinSummary } from '../checklist/bookingText';
import type { FlightData, HotelData, CarRentalData } from '../checklist/TradeShowChecklist';

interface MyTravelCardProps {
  user: User;
  show: TradeShow;
  onPageChange: (page: string) => void;
}

interface TravelData {
  flight: FlightData | undefined;
  hotel: HotelData | undefined;
  car: CarRentalData | undefined;
}

/** "Departs Wed, Jul 29 · 8:05 AM" — shown on the flight card when set. */
function formatDeparture(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Departs ${day} · ${time}`;
}

export const MyTravelCard: React.FC<MyTravelCardProps> = ({ user, show, onPageChange }) => {
  const [travel, setTravel] = useState<TravelData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let data: Record<string, unknown> | null = null;
        if (api.USE_SERVER) {
          data = (await api.checklist.getChecklist(show.id)) as Record<string, unknown> | null;
        } else {
          const raw = localStorage.getItem(`tradeshow_checklist_${show.id}`);
          data = raw ? JSON.parse(raw) : null;
        }
        if (cancelled || !data || typeof data !== 'object') {
          if (!cancelled) setTravel(null);
          return;
        }

        const flights = Array.isArray(data.flights) ? (data.flights as FlightData[]) : [];
        const hotels = Array.isArray(data.hotels) ? (data.hotels as HotelData[]) : [];
        const cars = Array.isArray(data.carRentals) ? (data.carRentals as CarRentalData[]) : [];

        setTravel({
          flight: flights.find((f) => f.attendee_id?.toString() === user.id),
          hotel: hotels.find((h) => h.attendee_id?.toString() === user.id),
          car:
            cars.find(
              (r) => r.rental_type === 'individual' && r.assigned_to_id?.toString() === user.id
            ) || cars.find((r) => r.rental_type === 'group'),
        });
      } catch (error) {
        // A show without a checklist is normal — the card just stays hidden.
        console.error('[MyTravelCard] Could not load itinerary:', error);
        if (!cancelled) setTravel(null);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [show.id, user.id]);

  const isParticipant = (show.participants || []).some((p) => p.id === user.id);
  const flight = travel?.flight;
  const hotel = travel?.hotel;
  const car = travel?.car;
  const hasAnyBooking = !!(flight || hotel || car);

  // Not on the roster and nothing booked for them → no card, no clutter.
  if (!hasAnyBooking && !isParticipant) return null;

  // Roster members always see all three slots so travel has a visible home
  // before bookings land; missing slots render as "Not booked yet".
  const showAllSlots = isParticipant;
  const hasGap = !flight?.booked || !hotel?.booked || !car?.booked;

  return (
    <section aria-label="My travel">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
          My Travel · {show.name}
        </h2>
        <button
          onClick={() => onPageChange('checklist')}
          className="inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          Full checklist
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {(flight || showAllSlots) && (
          <ItineraryCard
            icon={Plane}
            label="Flight"
            booked={!!flight?.booked}
            vendor={flight?.carrier}
            confirmation={flight?.confirmation_number}
            dates={formatDeparture(flight?.departure_at)}
            notes={flight?.notes}
          />
        )}
        {(hotel || showAllSlots) && (
          <ItineraryCard
            icon={Hotel}
            label="Hotel"
            booked={!!hotel?.booked}
            vendor={hotel?.property_name}
            confirmation={hotel?.confirmation_number}
            dates={formatDateRange(hotel?.check_in_date, hotel?.check_out_date)}
            notes={hotel?.notes}
          />
        )}
        {(car || showAllSlots) && (
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
        )}
      </div>

      {hasGap && (
        <p className="mt-2 text-xs text-stone-400">
          Details appear here as your coordinator books travel in the Checklist.
        </p>
      )}
    </section>
  );
};
