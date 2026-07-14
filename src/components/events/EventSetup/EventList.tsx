/**
 * EventList Component
 * 
 * Displays the list of events with participant information.
 */

import React from 'react';
import { Calendar, MapPin, DollarSign, Users, Info } from 'lucide-react';
import { TradeShow, User } from '../../../App';
import { formatDateRange } from '../../../utils/dateUtils';

interface EventListProps {
  events: TradeShow[];
  user: User;
  canManageEvents: boolean;
  onViewDetails: (event: TradeShow) => void;
  onEdit: (event: TradeShow) => void;
  onDelete: (eventId: string) => void;
}

export const EventList: React.FC<EventListProps> = ({
  events,
  user,
  canManageEvents,
  onViewDetails,
  onEdit,
  onDelete
}) => {
  if (events.length === 0) {
    return (
      <div className="card relative overflow-hidden p-12 text-center">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500/60 to-transparent"
        />
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-100">
          <Calendar className="w-8 h-8" />
        </div>
        <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900 mb-1.5">No events found</h3>
        <p className="text-sm text-gray-500">Create your first trade show event to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:gap-5 lg:gap-6">
      {events.map((event) => (
        <div key={event.id} className="card card-hover p-4 md:p-5 lg:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900">{event.name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {event.venue}, {event.city}, {event.state}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDateRange(event.startDate, event.endDate)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {event.budget && (user.role === 'admin' || user.role === 'developer' || user.role === 'accountant') && (
                <span className="chip bg-accent-50 px-2.5 py-1 text-xs text-accent-800 ring-accent-200/70">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span className="font-semibold tabular-nums">${event.budget.toLocaleString()}</span>
                </span>
              )}
              <button
                onClick={() => onViewDetails(event)}
                className="btn-ghost px-3 py-1.5"
              >
                <Info className="w-4 h-4" />
                Details
              </button>
              {canManageEvents && (
                <>
                  <button
                    onClick={() => onEdit(event)}
                    className="rounded-lg px-3 py-1.5 min-h-[44px] lg:min-h-0 text-sm font-medium text-brand-600 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(event.id)}
                    className="rounded-lg px-3 py-1.5 min-h-[44px] lg:min-h-0 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Participants with hover popup */}
          <div className="relative inline-block group">
            <div className="flex items-center gap-1.5 text-sm text-gray-500 cursor-help">
              <Users className="w-4 h-4" />
              <span>{event.participants?.length || 0} participants</span>
            </div>
            
            {/* Popup on hover */}
            {event.participants && event.participants.length > 0 && (
              <div className="absolute left-0 top-full z-10 mt-2 min-w-[200px] rounded-lg bg-white p-3 opacity-0 invisible shadow-elevation-3 ring-1 ring-gray-200 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Participants</div>
                <div className="space-y-1">
                  {event.participants.map((participant, index) => (
                    <div
                      key={index}
                      className="text-sm text-gray-600 flex items-center gap-2"
                    >
                      <span className="chip-dot bg-brand-500"></span>
                      {participant.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

