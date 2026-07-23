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
  show: Pick<TradeShow, 'id' | 'name'>;
  onPageChange: (page: string) => void;
}

interface TravelData {
  flight: FlightData | undefined;
  hotel: HotelData | undefined;
  car: CarRentalData | undefined;
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

  // Nothing assigned to this user → no card, no clutter.
  if (!travel || (!travel.flight && !travel.hotel && !travel.car)) return null;

  const { flight, hotel, car } = travel;

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
        {flight && (
          <ItineraryCard
            icon={Plane}
            label="Flight"
            booked={!!flight.booked}
            vendor={flight.carrier}
            confirmation={flight.confirmation_number}
            notes={flight.notes}
          />
        )}
        {hotel && (
          <ItineraryCard
            icon={Hotel}
            label="Hotel"
            booked={!!hotel.booked}
            vendor={hotel.property_name}
            confirmation={hotel.confirmation_number}
            dates={formatDateRange(hotel.check_in_date, hotel.check_out_date)}
            notes={hotel.notes}
          />
        )}
        {car && (
          <ItineraryCard
            icon={Car}
            label="Car"
            booked={!!car.booked}
            vendor={car.provider}
            confirmation={car.confirmation_number}
            dates={formatDateRange(car.pickup_date, car.return_date)}
            meta={joinSummary([
              car.rental_type === 'group' ? 'Group rental — shared vehicle' : null,
              car.rental_type === 'individual' ? 'Reserved for you' : null,
            ])}
            notes={car.notes}
          />
        )}
      </div>
    </section>
  );
};
