/**
 * ChecklistSummary Component
 * 
 * Displays event checklist summary with travel details.
 */

import React from 'react';
import { CheckCircle2, Circle, Plane, Hotel, Car, Users2, Loader2 } from 'lucide-react';
import { User } from '../../../App';
import { formatLocalDate } from '../../../utils/dateUtils';
import { ChecklistSummary as ChecklistSummaryType } from './hooks';

interface ChecklistSummaryProps {
  user: User;
  checklistData: ChecklistSummaryType | null;
  loadingChecklist: boolean;
}

export const ChecklistSummary: React.FC<ChecklistSummaryProps> = ({
  user,
  checklistData,
  loadingChecklist
}) => {
  if (loadingChecklist) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!checklistData) {
    return <p className="text-stone-500 text-sm italic">Checklist not available</p>;
  }

  const userFlight = checklistData.flights?.find(f => f.attendee_id === user.id);
  const userHotel = checklistData.hotels?.find(h => h.attendee_id === user.id);
  const carRentals = checklistData.carRentals || [];

  return (
    <div className="space-y-4">
      {/* Overall Checklist Status */}
      <div className="space-y-3 rounded-lg bg-stone-50/80 p-4 ring-1 ring-inset ring-stone-200/70">
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Overall Status</h4>
        
        {/* Booth & Electricity */}
        <div className="flex items-center gap-3">
          {checklistData.booth_ordered ? (
            <CheckCircle2 className="w-5 h-5 text-accent-600 flex-shrink-0" />
          ) : (
            <Circle className="w-5 h-5 text-stone-400 flex-shrink-0" />
          )}
          <span className="text-sm text-stone-700">Booth Space Ordered</span>
        </div>

        <div className="flex items-center gap-3">
          {checklistData.electricity_ordered ? (
            <CheckCircle2 className="w-5 h-5 text-accent-600 flex-shrink-0" />
          ) : (
            <Circle className="w-5 h-5 text-stone-400 flex-shrink-0" />
          )}
          <span className="text-sm text-stone-700">Electricity Ordered</span>
        </div>

        {/* Flights */}
        <div className="flex items-center gap-3">
          <Plane className="w-5 h-5 text-brand-600 flex-shrink-0" />
          <span className="text-sm text-stone-700">
            Flights: {checklistData.flights_booked}/{checklistData.flights_total} booked
          </span>
        </div>

        {/* Hotels */}
        <div className="flex items-center gap-3">
          <Hotel className="w-5 h-5 text-accent-600 flex-shrink-0" />
          <span className="text-sm text-stone-700">
            Hotels: {checklistData.hotels_booked}/{checklistData.hotels_total} booked
          </span>
        </div>

        {/* Car Rentals */}
        {checklistData.car_rentals_total > 0 && (
          <div className="flex items-center gap-3">
            <Car className="w-5 h-5 text-orange-600 flex-shrink-0" />
            <span className="text-sm text-stone-700">
              Car Rentals: {checklistData.car_rentals_booked}/{checklistData.car_rentals_total} booked
            </span>
          </div>
        )}

        {/* Booth Shipping */}
        <div className="flex items-center gap-3">
          {checklistData.booth_shipped ? (
            <CheckCircle2 className="w-5 h-5 text-accent-600 flex-shrink-0" />
          ) : (
            <Circle className="w-5 h-5 text-stone-400 flex-shrink-0" />
          )}
          <span className="text-sm text-stone-700">Booth Shipped</span>
        </div>
      </div>

      {/* Personal Travel Details - Only show if user is a participant */}
      {(userFlight || userHotel || carRentals.length > 0) && (
        <div className="space-y-3 rounded-lg bg-brand-50 p-4 ring-1 ring-inset ring-brand-200/70">
          <h4 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-800">
            <Users2 className="w-4 h-4" />
            Your Travel Details
          </h4>

          {/* User's Flight Info */}
          {userFlight && (
            <div className="space-y-2 rounded-lg bg-white p-3 shadow-elevation-1 ring-1 ring-stone-200/70">
              <div className="flex items-center gap-2 mb-2">
                <Plane className="w-4 h-4 text-brand-600" />
                <span className="font-medium text-stone-900 text-sm">Flight</span>
                {userFlight.booked && (
                  <CheckCircle2 className="w-4 h-4 text-accent-600 ml-auto" />
                )}
              </div>
              {userFlight.carrier && (
                <div className="text-sm">
                  <span className="text-stone-500">Carrier:</span>
                  <span className="text-stone-900 ml-2">{userFlight.carrier}</span>
                </div>
              )}
              {userFlight.confirmation_number && (
                <div className="text-sm">
                  <span className="text-stone-500">Confirmation:</span>
                  <span className="text-stone-900 ml-2 font-mono">{userFlight.confirmation_number}</span>
                </div>
              )}
              {userFlight.notes && (
                <div className="text-sm">
                  <span className="text-stone-500">Notes:</span>
                  <span className="text-stone-900 ml-2">{userFlight.notes}</span>
                </div>
              )}
            </div>
          )}

          {/* User's Hotel Info */}
          {userHotel && (
            <div className="space-y-2 rounded-lg bg-white p-3 shadow-elevation-1 ring-1 ring-stone-200/70">
              <div className="flex items-center gap-2 mb-2">
                <Hotel className="w-4 h-4 text-accent-600" />
                <span className="font-medium text-stone-900 text-sm">Hotel</span>
                {userHotel.booked && (
                  <CheckCircle2 className="w-4 h-4 text-accent-600 ml-auto" />
                )}
              </div>
              {userHotel.property_name && (
                <div className="text-sm">
                  <span className="text-stone-500">Property:</span>
                  <span className="text-stone-900 ml-2">{userHotel.property_name}</span>
                </div>
              )}
              {userHotel.confirmation_number && (
                <div className="text-sm">
                  <span className="text-stone-500">Confirmation:</span>
                  <span className="text-stone-900 ml-2 font-mono">{userHotel.confirmation_number}</span>
                </div>
              )}
              {(userHotel.check_in_date || userHotel.check_out_date) && (
                <div className="text-sm">
                  <span className="text-stone-500">Dates:</span>
                  <span className="text-stone-900 ml-2">
                    {userHotel.check_in_date ? formatLocalDate(userHotel.check_in_date) : '—'} to {userHotel.check_out_date ? formatLocalDate(userHotel.check_out_date) : '—'}
                  </span>
                </div>
              )}
              {userHotel.notes && (
                <div className="text-sm">
                  <span className="text-stone-500">Notes:</span>
                  <span className="text-stone-900 ml-2">{userHotel.notes}</span>
                </div>
              )}
            </div>
          )}

          {/* Car Rentals - Shared by all attendees */}
          {carRentals.map((rental) => (
            <div key={rental.id} className="space-y-2 rounded-lg bg-white p-3 shadow-elevation-1 ring-1 ring-stone-200/70">
              <div className="flex items-center gap-2 mb-2">
                <Car className="w-4 h-4 text-orange-600" />
                <span className="font-medium text-stone-900 text-sm">Car Rental</span>
                {rental.booked && (
                  <CheckCircle2 className="w-4 h-4 text-accent-600 ml-auto" />
                )}
              </div>
              {rental.provider && (
                <div className="text-sm">
                  <span className="text-stone-500">Provider:</span>
                  <span className="text-stone-900 ml-2">{rental.provider}</span>
                </div>
              )}
              {rental.confirmation_number && (
                <div className="text-sm">
                  <span className="text-stone-500">Confirmation:</span>
                  <span className="text-stone-900 ml-2 font-mono">{rental.confirmation_number}</span>
                </div>
              )}
              {(rental.pickup_date || rental.return_date) && (
                <div className="text-sm">
                  <span className="text-stone-500">Dates:</span>
                  <span className="text-stone-900 ml-2">
                    {rental.pickup_date ? formatLocalDate(rental.pickup_date) : '—'} to {rental.return_date ? formatLocalDate(rental.return_date) : '—'}
                  </span>
                </div>
              )}
              {rental.notes && (
                <div className="text-sm">
                  <span className="text-stone-500">Notes:</span>
                  <span className="text-stone-900 ml-2">{rental.notes}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

