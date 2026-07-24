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
      className="seg-track"
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
            className={`seg-tab ${isActive ? 'seg-tab-active' : 'seg-tab-idle'}`}
          >
            {tab.label}
            {tab.total > 0 && (
              <span
                className={`text-xs font-semibold tabular-nums ${
                  isActive
                    ? isDone ? 'text-accent-200' : 'text-white/75'
                    : isDone ? 'text-accent-600' : 'text-stone-400'
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
