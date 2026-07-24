/**
 * ShowHero — 2.0 masthead. The show is the headline, set on a deep
 * brand-gradient canvas with a soft radial glow: LIVE shows get a pulsing
 * eyebrow and a day-progress rail; upcoming shows get a countdown. The
 * switcher rides the masthead in glass style.
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
  const progressPct = isLive && dayTotal > 0 ? Math.min((dayCurrent / dayTotal) * 100, 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-700 via-brand-600 to-accent-600 p-4 shadow-brand-lg sm:p-5 md:p-6">
      {/* Atmosphere: soft glows + faint grid so the canvas isn't flat */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-28 -left-10 h-56 w-56 rounded-full bg-accent-300/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            {isLive && (
              <span aria-hidden="true" className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-300" />
              </span>
            )}
            {eyebrowText(show, isLive, dayCurrent, dayTotal)}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:truncate sm:text-3xl md:text-4xl">
            {show.name}
          </h1>
        </div>

        {shows.length > 1 && (
          <label className="inline-flex min-h-[44px] items-center lg:min-h-0">
            <span className="sr-only">Switch show</span>
            <select
              value={show.id}
              onChange={e => onSelectShow(e.target.value)}
              className="min-h-[44px] cursor-pointer rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 lg:min-h-0 [color-scheme:dark]"
            >
              {shows.map(s => (
                <option key={s.id} value={s.id} className="text-stone-900">
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Live progress rail */}
      {isLive && (
        <div className="relative mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white/90 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
