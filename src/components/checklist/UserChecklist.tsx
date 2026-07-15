/**
 * UserChecklist Component
 *
 * User-facing checklist with placeholder items for all users. Renders its
 * own masthead when it is the whole page; `embedded` hides it when the
 * parent page already provides one (the Admin/My tabs).
 */

import React from 'react';
import { FileText, Luggage, Clock } from 'lucide-react';
import { User } from '../../App';

interface UserChecklistProps {
  user: User;
  /** True when rendered inside the checklist page tabs (masthead already shown). */
  embedded?: boolean;
}

interface PlaceholderItem {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const PLACEHOLDER_ITEMS: PlaceholderItem[] = [
  {
    key: 'guidelines',
    icon: <FileText className="w-5 h-5" />,
    title: 'Trade Show Guidelines Document',
    description: 'Access comprehensive guidelines and best practices for trade show participation.',
  },
  {
    key: 'packing',
    icon: <Luggage className="w-5 h-5" />,
    title: 'Packing List',
    description: 'Get a personalized packing checklist based on your event and travel details.',
  },
];

export const UserChecklist: React.FC<UserChecklistProps> = ({ embedded = false }) => {
  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
      {/* Masthead (standalone page only) */}
      {!embedded && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            Preparation
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900 md:text-3xl">
            My Checklist
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Personal preparation checklist for trade shows
          </p>
        </div>
      )}

      {/* Placeholder items */}
      <div className="grid gap-4 sm:grid-cols-2">
        {PLACEHOLDER_ITEMS.map(item => (
          <div key={item.key} className="card p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500"
              >
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-bold tracking-tight text-stone-900">
                    {item.title}
                  </h3>
                  <span className="chip bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 ring-amber-200/70">
                    <Clock aria-hidden="true" className="w-3 h-3" />
                    Coming Soon
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-stone-500">{item.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info message */}
      <div className="rounded-card border border-brand-100 bg-brand-50 p-4">
        <p className="text-sm text-brand-900">
          <strong>Note:</strong> These features are currently under development. Check back soon for updates!
        </p>
      </div>
    </div>
  );
};
