import React from 'react';
import { Calendar, MapPin, Users, Clock } from 'lucide-react';
import { TradeShow } from '../../App';
import { parseLocalDate, formatDateRange, getDaysUntil } from '../../utils/dateUtils';

interface UpcomingEventsProps {
  onPageChange: (page: string) => void;
  events: TradeShow[];
}

export const UpcomingEvents: React.FC<UpcomingEventsProps> = ({ events, onPageChange }) => {
  // Filter events: only show if end date hasn't passed yet
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to midnight
  
  const upcomingEvents = events
    .filter(event => {
      // Use utility to parse date without timezone conversion
      const endDate = parseLocalDate(event.endDate);
      return endDate >= today; // Include events that end today or later
    })
    .sort((a, b) => {
      // Sort by start date (closest upcoming event first)
      const dateA = parseLocalDate(a.startDate);
      const dateB = parseLocalDate(b.startDate);
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 3);
  
  const getDaysUntilLabel = (days: number) => {
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-4 border-b border-gray-100">
        <h3 className="card-title">Upcoming Events</h3>
        <button onClick={() => onPageChange('events')} className="card-link">View All</button>
      </div>

      {upcomingEvents.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 ring-1 ring-inset ring-gray-100">
            <Calendar className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-600">No upcoming events</p>
          <p className="text-sm text-gray-400 mt-1">Create your first trade show event</p>
        </div>
      ) : (
        <div className="space-y-3 p-4 md:p-5">
          {upcomingEvents.map((event) => {
            // Check if event is currently in progress (between start and end date)
            const startDate = parseLocalDate(event.startDate);
            const endDate = parseLocalDate(event.endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const isInProgress = today >= startDate && today <= endDate;
            const daysUntil = isInProgress ? 0 : getDaysUntil(event.startDate);
            
            return (
              <div key={event.id} className="group relative rounded-lg border border-gray-200/80 p-4 transition-all duration-200 hover:border-brand-200 hover:shadow-elevation-2">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">{event.name}</h4>
                  <span className={`chip shrink-0 px-2 py-0.5 text-[11px] ${
                    daysUntil === 0 ? 'bg-orange-50 text-orange-700 ring-orange-200/70' :
                    daysUntil <= 7 ? 'bg-amber-50 text-amber-800 ring-amber-200/70' :
                    'bg-brand-50 text-brand-700 ring-brand-200/70'
                  }`}>
                    <span className={`chip-dot ${
                      daysUntil === 0 ? 'bg-orange-500' :
                      daysUntil <= 7 ? 'bg-amber-500' : 'bg-brand-500'
                    }`} />
                    {daysUntil === 0 ? 'In progress' : getDaysUntilLabel(daysUntil)}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex items-center">
                    <MapPin className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span>{event.venue}, {event.city}, {event.state}</span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span>{formatDateRange(event.startDate, event.endDate)}</span>
                  </div>
                  <div className="flex items-center">
                    <Users className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span>{event.participants?.length || 0} participants</span>
                  </div>
                </div>

                {event.budget && (
                  <div className="mt-3 pt-3 border-t border-dashed border-gray-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Budget</span>
                      <span className="font-display font-bold text-gray-900 tabular-nums">${event.budget.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};