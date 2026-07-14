/**
 * EventFilters Component
 * 
 * Filter toggles for viewing active/past events and all/my events.
 */

import React from 'react';
import { User } from '../../../App';

interface EventFiltersProps {
  user: User;
  viewMode: 'active' | 'past';
  setViewMode: (mode: 'active' | 'past') => void;
  filterMode: 'all' | 'my';
  setFilterMode: (mode: 'all' | 'my') => void;
  activeEventsCount: number;
  pastEventsCount: number;
}

export const EventFilters: React.FC<EventFiltersProps> = ({
  user,
  viewMode,
  setViewMode,
  filterMode,
  setFilterMode,
  activeEventsCount,
  pastEventsCount
}) => {
  const showFilterToggle = user.role === 'admin' || user.role === 'developer' || user.role === 'accountant' || user.role === 'coordinator';

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="card flex sm:inline-flex rounded-xl p-1">
        <button
          onClick={() => setViewMode('active')}
          className={`flex-1 sm:flex-initial rounded-lg px-3 sm:px-6 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
            viewMode === 'active'
              ? 'bg-gradient-to-r from-brand-600 to-accent-500 text-white shadow-brand'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          Active Events ({activeEventsCount})
        </button>
        <button
          onClick={() => setViewMode('past')}
          className={`flex-1 sm:flex-initial rounded-lg px-3 sm:px-6 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
            viewMode === 'past'
              ? 'bg-gradient-to-r from-brand-600 to-accent-500 text-white shadow-brand'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          Past Events ({pastEventsCount})
        </button>
      </div>

      {showFilterToggle && (
        <div className="card flex sm:inline-flex rounded-xl p-1">
          <button
            onClick={() => setFilterMode('all')}
            className={`flex-1 sm:flex-initial rounded-lg px-3 sm:px-6 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
              filterMode === 'all'
                ? 'bg-brand-600 text-white shadow-brand'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            All Events
          </button>
          <button
            onClick={() => setFilterMode('my')}
            className={`flex-1 sm:flex-initial rounded-lg px-3 sm:px-6 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
              filterMode === 'my'
                ? 'bg-brand-600 text-white shadow-brand'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            My Events
          </button>
        </div>
      )}
    </div>
  );
};

