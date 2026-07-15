/**
 * BookingBoard — the coordinator's admin surface for one show.
 *
 * Readiness card up top, then a segmented board: Booth / Flights / Hotels /
 * Cars / Tasks tabs, each labeled with its done/total count. Only the
 * active tab's panel renders. All section components keep their existing
 * handlers, API calls, and receipt flows.
 */

import React, { useState } from 'react';
import { User, TradeShow } from '../../App';
import { ChecklistData } from './TradeShowChecklist';
import { BoothSection } from './sections/BoothSection';
import { FlightsSection } from './sections/FlightsSection';
import { HotelsSection } from './sections/HotelsSection';
import { CarRentalsSection } from './sections/CarRentalsSection';
import { CustomItemsSection } from './sections/CustomItemsSection';
import { ChecklistProgressCard } from './ChecklistProgressCard';
import { BookingBoardTabs, BoardTab, BoardTabKey } from './BookingBoardTabs';
import { boardPanelId, boardTabId } from './bookingText';

interface BookingBoardProps {
  checklist: ChecklistData;
  user: User;
  event: TradeShow;
  saving: boolean;
  onUpdate: (updates: Partial<ChecklistData>) => Promise<void>;
  onReload: () => void;
  progress: { completed: number; total: number; pct: number };
}

export const BookingBoard: React.FC<BookingBoardProps> = ({
  checklist,
  user,
  event,
  saving,
  onUpdate,
  onReload,
  progress,
}) => {
  const [boardTab, setBoardTab] = useState<BoardTabKey>('booth');

  // Tab definitions carry the done/total counts the board wears.
  const tabs: BoardTab[] = [
    {
      key: 'booth',
      label: 'Booth',
      completed: (checklist.booth_ordered ? 1 : 0) + (checklist.electricity_ordered ? 1 : 0),
      total: 2,
    },
    {
      key: 'flights',
      label: 'Flights',
      completed: checklist.flights.filter(f => f.booked).length,
      total: checklist.flights.length,
    },
    {
      key: 'hotels',
      label: 'Hotels',
      completed: checklist.hotels.filter(h => h.booked).length,
      total: checklist.hotels.length,
    },
    {
      key: 'cars',
      label: 'Cars',
      completed: checklist.carRentals.filter(c => c.booked).length,
      total: checklist.carRentals.length,
    },
    {
      key: 'tasks',
      label: 'Tasks',
      completed: checklist.customItems.filter(i => i.completed).length,
      total: checklist.customItems.length,
    },
  ];

  // Only the active tab's panel renders.
  const panels: Record<BoardTabKey, React.ReactNode> = {
    booth: (
      <BoothSection
        checklist={checklist}
        user={user}
        event={event}
        onUpdate={onUpdate}
        onReload={onReload}
        saving={saving}
      />
    ),
    flights: (
      <FlightsSection checklist={checklist} user={user} event={event} onReload={onReload} />
    ),
    hotels: (
      <HotelsSection checklist={checklist} user={user} event={event} onReload={onReload} />
    ),
    cars: (
      <CarRentalsSection checklist={checklist} user={user} event={event} onReload={onReload} />
    ),
    tasks: (
      <CustomItemsSection
        checklist={checklist}
        onReload={onReload}
        canEdit={user.role === 'admin' || user.role === 'coordinator' || user.role === 'developer'}
        isAdmin={user.role === 'admin' || user.role === 'developer'}
      />
    ),
  };

  return (
    <>
      <ChecklistProgressCard
        completed={progress.completed}
        total={progress.total}
        pct={progress.pct}
      />

      <BookingBoardTabs tabs={tabs} active={boardTab} onChange={setBoardTab} />

      <div
        role="tabpanel"
        id={boardPanelId(boardTab)}
        aria-labelledby={boardTabId(boardTab)}
        className="card"
      >
        {panels[boardTab]}
      </div>
    </>
  );
};
