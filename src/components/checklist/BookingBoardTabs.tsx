/**
 * BookingBoardTabs — segmented control for the coordinator booking board.
 *
 * Each tab wears its done/total count ("Flights 2/5"). The bar scrolls
 * horizontally on small screens so the page itself never overflows.
 */

import React from 'react';
import { boardTabId, boardPanelId } from './bookingText';

export type BoardTabKey = 'booth' | 'flights' | 'hotels' | 'cars' | 'tasks';

export interface BoardTab {
  key: BoardTabKey;
  label: string;
  completed: number;
  total: number;
}

interface BookingBoardTabsProps {
  tabs: BoardTab[];
  active: BoardTabKey;
  onChange: (key: BoardTabKey) => void;
}

export const BookingBoardTabs: React.FC<BookingBoardTabsProps> = ({ tabs, active, onChange }) => (
  <div className="overflow-x-auto">
    <div
      role="tablist"
      aria-label="Booking sections"
      className="inline-flex min-w-max gap-1 rounded-full bg-stone-100 p-1"
    >
      {tabs.map(tab => {
        const isActive = tab.key === active;
        const isDone = tab.total > 0 && tab.completed >= tab.total;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={boardTabId(tab.key)}
            aria-selected={isActive}
            aria-controls={boardPanelId(tab.key)}
            onClick={() => onChange(tab.key)}
            className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors sm:px-4 lg:min-h-0 ${
              isActive
                ? 'bg-white text-stone-900 shadow-elevation-1'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {tab.label}
            {tab.total > 0 && (
              <span
                className={`text-xs font-semibold tabular-nums ${
                  isDone ? 'text-accent-600' : 'text-stone-400'
                }`}
              >
                {tab.completed}/{tab.total}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);
