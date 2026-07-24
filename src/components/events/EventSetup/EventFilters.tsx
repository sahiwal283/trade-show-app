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
      <div className="seg-track flex w-full sm:w-auto">
        <button
          onClick={() => setViewMode('active')}
          className={`seg-tab flex-1 justify-center ${viewMode === 'active' ? 'seg-tab-active' : 'seg-tab-idle'}`}
        >
          Active Events ({activeEventsCount})
        </button>
        <button
          onClick={() => setViewMode('past')}
          className={`seg-tab flex-1 justify-center ${viewMode === 'past' ? 'seg-tab-active' : 'seg-tab-idle'}`}
        >
          Past Events ({pastEventsCount})
        </button>
      </div>

      {showFilterToggle && (
        <div className="seg-track flex w-full sm:w-auto">
          <button
            onClick={() => setFilterMode('all')}
            className={`seg-tab flex-1 justify-center ${filterMode === 'all' ? 'seg-tab-active' : 'seg-tab-idle'}`}
          >
            All Events
          </button>
          <button
            onClick={() => setFilterMode('my')}
            className={`seg-tab flex-1 justify-center ${filterMode === 'my' ? 'seg-tab-active' : 'seg-tab-idle'}`}
          >
            My Events
          </button>
        </div>
      )}
    </div>
  );
};

