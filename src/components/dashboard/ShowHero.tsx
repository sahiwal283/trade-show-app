/**
 * ShowHero Component
 *
 * Editorial masthead for the dashboard: the show is the headline. Shows a
 * LIVE eyebrow with day count while a show is running, an UP NEXT framing
 * before it starts, and a show switcher when there is more than one show.
 */

import { TradeShow } from '../../App';
import { getDaysUntil, formatDateRange } from '../../utils/dateUtils';

interface ShowHeroProps {
  show: TradeShow;
  shows: TradeShow[];
  isLive: boolean;
  dayCurrent: number;
  dayTotal: number;
  onSelectShow: (id: string) => void;
}

function eyebrowText(show: TradeShow, isLive: boolean, dayCurrent: number, dayTotal: number): string {
  const place = [show.city, show.state].filter(Boolean).join(', ');
  if (isLive) {
    return `Live now · Day ${dayCurrent} of ${dayTotal}${place ? ` · ${place}` : ''}`;
  }
  const days = getDaysUntil(show.showStartDate || show.startDate);
  if (days > 0) {
    return `Up next · in ${days} day${days === 1 ? '' : 's'}${place ? ` · ${place}` : ''}`;
  }
  return `Wrapped · ${formatDateRange(show.showStartDate || show.startDate, show.showEndDate || show.endDate)}${place ? ` · ${place}` : ''}`;
}

export function ShowHero({ show, shows, isLive, dayCurrent, dayTotal, onSelectShow }: ShowHeroProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
          {isLive && (
            <span aria-hidden="true" className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
            </span>
          )}
          {eyebrowText(show, isLive, dayCurrent, dayTotal)}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">
          {show.name}
        </h1>
      </div>

      {shows.length > 1 && (
        <label className="inline-flex min-h-[44px] items-center lg:min-h-0">
          <span className="sr-only">Switch show</span>
          <select
            value={show.id}
            onChange={e => onSelectShow(e.target.value)}
            className="cursor-pointer rounded-full border border-stone-200 bg-white px-4 py-1.5 text-xs font-medium text-stone-600 shadow-elevation-1 transition-colors hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {shows.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
