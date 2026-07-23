/**
 * MyTravelCard — the signed-in user's flight, hotel, and car for the show on
 * screen, as one compact card of confirmation rows with one-tap copy. The
 * full itinerary cards live on the Checklist page ("Full checklist" links
 * there) — this card is the at-a-glance version, not a duplicate of them.
 */

import React, { useEffect, useState } from 'react';
import { Plane, Hotel, Car, ArrowRight, Check, Copy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { User, TradeShow } from '../../App';
import { api } from '../../utils/api';
import { formatDateRange, joinSummary } from '../checklist/bookingText';
import { haptics } from '../../utils/haptics';
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

/** "Departs Wed, Jul 29 · 8:05 AM" — shown on the flight row when set. */
function formatDeparture(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Departs ${day} · ${time}`;
}

const COPIED_RESET_MS = 1800;

interface TravelRowProps {
  icon: LucideIcon;
  label: string;
  booked: boolean;
  vendor?: string | null;
  detail?: string | null;
  confirmation?: string | null;
}

function TravelRow({ icon: Icon, label, booked, vendor, detail, confirmation }: TravelRowProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (!confirmation) return;
    try {
      await navigator.clipboard.writeText(confirmation);
      haptics.success();
      setCopied(true);
    } catch (error) {
      console.error('[MyTravelCard] Failed to copy confirmation:', error);
    }
  };

  return (
    <div className="flex min-h-[52px] items-center gap-3 px-3 py-2.5">
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          booked ? 'bg-accent-50 text-accent-600' : 'bg-stone-100 text-stone-400'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        {booked ? (
          <>
            <p className="truncate text-sm font-medium text-stone-900">{vendor || label}</p>
            {detail && <p className="truncate text-xs tabular-nums text-stone-500">{detail}</p>}
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-stone-400">{label}</p>
            <p className="text-xs text-stone-400">Not booked yet</p>
          </>
        )}
      </div>

      {booked && confirmation && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label} confirmation ${confirmation}`}
          className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 lg:min-h-[36px] ${
            copied ? 'bg-accent-50 text-accent-700' : 'text-stone-900 hover:bg-brand-50'
          }`}
        >
          {confirmation}
          {copied ? (
            <Check aria-hidden="true" className="h-3.5 w-3.5 text-accent-600" strokeWidth={3} />
          ) : (
            <Copy aria-hidden="true" className="h-3.5 w-3.5 text-brand-600" />
          )}
        </button>
      )}
    </div>
  );
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

  const showAllSlots = isParticipant;

  return (
    <section aria-label="My travel">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
          My Travel
        </h2>
        <button
          onClick={() => onPageChange('checklist')}
          className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700 lg:min-h-[32px]"
        >
          Full checklist
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="card divide-y divide-stone-100">
        {(flight || showAllSlots) && (
          <TravelRow
            icon={Plane}
            label="Flight"
            booked={!!flight?.booked}
            vendor={flight?.carrier}
            detail={formatDeparture(flight?.departure_at)}
            confirmation={flight?.confirmation_number}
          />
        )}
        {(hotel || showAllSlots) && (
          <TravelRow
            icon={Hotel}
            label="Hotel"
            booked={!!hotel?.booked}
            vendor={hotel?.property_name}
            detail={formatDateRange(hotel?.check_in_date, hotel?.check_out_date)}
            confirmation={hotel?.confirmation_number}
          />
        )}
        {(car || showAllSlots) && (
          <TravelRow
            icon={Car}
            label="Car"
            booked={!!car?.booked}
            vendor={car?.provider}
            detail={joinSummary([
              formatDateRange(car?.pickup_date, car?.return_date),
              car?.rental_type === 'group' ? 'Shared vehicle' : null,
            ])}
            confirmation={car?.confirmation_number}
          />
        )}
      </div>
    </section>
  );
};
