/**
 * AddParticipantModal — add people to a show without leaving the checklist.
 *
 * Lists users who are not yet on the event roster, with search and
 * multi-select. Saving calls the participants endpoint (which only touches
 * the roster) and hands control back so the caller can refresh.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, X, Search, Check } from 'lucide-react';
import { api } from '../../utils/api';
import { TradeShow, User } from '../../App';

interface AddParticipantModalProps {
  event: TradeShow;
  onClose: () => void;
  onAdded: () => void;
}

export const AddParticipantModal: React.FC<AddParticipantModalProps> = ({
  event,
  onClose,
  onAdded,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const data = (await api.getUsers()) as User[];
        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('[AddParticipantModal] Failed to load users:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const existingIds = useMemo(
    () => new Set((event.participants || []).map(p => p.id)),
    [event.participants]
  );

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter(u => !existingIds.has(u.id) && u.role !== 'pending')
      .filter(u => !q || u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, existingIds, query]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await api.addEventParticipants(event.id, [...selected]);
      onAdded();
      onClose();
    } catch (error) {
      console.error('[AddParticipantModal] Failed to add participants:', error);
      alert('Failed to add people to this show. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-xl bg-white shadow-elevation-3 sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-stone-100 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
              <UserPlus aria-hidden="true" className="h-5 w-5 text-brand-600" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold tracking-tight text-stone-900">
                Add people to this show
              </h3>
              <p className="text-xs text-stone-500">{event.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost p-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-stone-100 p-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or email"
              className="w-full rounded-lg border border-stone-300 py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="p-4 text-sm text-stone-500">Loading people…</p>
          ) : candidates.length === 0 ? (
            <p className="p-4 text-sm text-stone-500">
              {query ? 'No one matches that search.' : 'Everyone is already on this show.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {candidates.map(u => {
                const isSelected = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => toggle(u.id)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-brand-50' : 'hover:bg-stone-50'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          isSelected
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-stone-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-stone-900">
                          {u.name}
                        </span>
                        <span className="block truncate text-xs text-stone-500">
                          {u.email} · {u.role}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex gap-3 border-t border-stone-100 p-4">
          <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || selected.size === 0}
            className="btn-primary flex-1"
          >
            {saving
              ? 'Adding…'
              : selected.size > 0
                ? `Add ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`
                : 'Add to show'}
          </button>
        </div>
      </div>
    </div>
  );
};
