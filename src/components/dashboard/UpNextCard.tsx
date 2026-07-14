/**
 * UpNextCard Component
 *
 * Quiet footer card pointing at the next scheduled show.
 */

import { TradeShow } from '../../App';
import { formatDateRange } from '../../utils/dateUtils';
import { money } from './format';

interface UpNextCardProps {
  show: TradeShow;
  onPageChange: (page: string) => void;
}

export function UpNextCard({ show, onPageChange }: UpNextCardProps) {
  const going = show.participants.length;
  return (
    <section aria-label="Up next" className="card p-4 md:p-5">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
        Up next
      </h2>
      <button
        type="button"
        onClick={() => onPageChange('events')}
        className="min-h-[44px] w-full rounded-lg text-left transition-colors hover:text-brand-700 lg:min-h-0"
      >
        <p className="text-sm font-bold text-stone-900">{show.name}</p>
        <p className="text-xs text-stone-400">
          {formatDateRange(show.showStartDate || show.startDate, show.showEndDate || show.endDate)}
          {show.budget ? ` · budget ${money(show.budget)}` : ''}
          {going > 0 ? ` · ${going} going` : ''}
        </p>
      </button>
    </section>
  );
}
