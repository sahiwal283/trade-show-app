/**
 * ItineraryCard — one read-only travel card on "My Itinerary": Flight,
 * Hotel, or Car. The confirmation number is the hero (display type,
 * selectable, one-tap copy); vendor, dates, and notes stay quiet.
 */

import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const COPIED_RESET_MS = 1800;

function CopyButton({ value, subject }: { value: string; subject: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch (error) {
      console.error('[ItineraryCard] Failed to copy confirmation:', error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${subject} confirmation number`}
      className={`inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors lg:min-h-0 ${
        copied
          ? 'bg-accent-50 text-accent-700'
          : 'text-brand-600 hover:bg-brand-50 hover:text-brand-700'
      }`}
    >
      {copied ? (
        <>
          <Check aria-hidden="true" className="w-3.5 h-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy aria-hidden="true" className="w-3.5 h-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

interface ItineraryCardProps {
  icon: LucideIcon;
  /** Micro-label header, e.g. "Flight". */
  label: string;
  booked: boolean;
  /** Carrier / property / provider name. */
  vendor?: string | null;
  confirmation?: string | null;
  /** Preformatted date line, e.g. "Mar 3–7". */
  dates?: string | null;
  notes?: string | null;
  /** Quiet meta line, e.g. "Group rental — shared vehicle". */
  meta?: string | null;
}

export const ItineraryCard: React.FC<ItineraryCardProps> = ({
  icon: Icon,
  label,
  booked,
  vendor,
  confirmation,
  dates,
  notes,
  meta,
}) => (
  <section aria-label={label} className="card flex flex-col p-4 sm:p-5">
    {/* Header */}
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          booked ? 'bg-accent-50 text-accent-600' : 'bg-stone-100 text-stone-400'
        }`}
      >
        <Icon className="w-4 h-4" />
      </span>
      <p className="micro-label">{label}</p>
    </div>

    {booked ? (
      <div className="mt-3 min-w-0">
        {vendor && (
          <p className="truncate text-sm font-semibold text-stone-900">{vendor}</p>
        )}

        {/* Confirmation number — the hero */}
        {confirmation ? (
          <div className="mt-2">
            <p className="micro-label">Confirmation</p>
            <div className="flex items-start justify-between gap-1.5">
              <p className="min-w-0 select-all break-all font-display text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
                {confirmation}
              </p>
              <CopyButton value={confirmation} subject={label} />
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">Booked — no confirmation number on file.</p>
        )}

        {dates && <p className="mt-2 text-sm tabular-nums text-stone-600">{dates}</p>}
        {meta && <p className="mt-1 text-xs text-stone-400">{meta}</p>}
        {notes && (
          <p className="mt-2 border-t border-stone-100 pt-2 text-sm text-stone-500">{notes}</p>
        )}
      </div>
    ) : (
      <div className="mt-3 rounded-xl border border-dashed border-stone-200 p-4">
        <p className="text-sm font-medium text-stone-500">Not booked yet</p>
        <p className="mt-0.5 text-xs text-stone-400">Your coordinator is on it.</p>
      </div>
    )}
  </section>
);
