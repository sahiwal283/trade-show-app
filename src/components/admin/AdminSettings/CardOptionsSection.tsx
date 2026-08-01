/**
 * CardOptionsSection Component
 *
 * Card options management section.
 */

import React from 'react';
import { CreditCard, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

interface CardOption {
  name: string;
  lastFour: string;
  entity?: string | null;
  zohoPaymentAccountId?: string | null;
}

interface CardOptionsSectionProps {
  cardOptions: CardOption[];
  entityOptions: string[];
  newCardName: string;
  setNewCardName: (value: string) => void;
  newCardLastFour: string;
  setNewCardLastFour: (value: string) => void;
  newCardEntity: string;
  setNewCardEntity: (value: string) => void;
  newCardZohoAccountId: string;
  setNewCardZohoAccountId: (value: string) => void;
  editingCardIndex: number | null;
  editCardName: string;
  setEditCardName: (value: string) => void;
  editCardLastFour: string;
  setEditCardLastFour: (value: string) => void;
  editCardEntity: string;
  setEditCardEntity: (value: string) => void;
  editCardZohoAccountId: string;
  setEditCardZohoAccountId: (value: string) => void;
  isSaving: boolean;
  onAddCard: () => void;
  onRemoveCard: (option: CardOption) => void;
  onStartEdit: (index: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (index: number) => void;
}

/* Row actions: always visible on touch devices; revealed on hover/focus
   when a hover-capable pointer is present. */
const ROW_ACTIONS_CLASS =
  'flex shrink-0 items-center gap-1 transition-opacity ' +
  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ' +
  '[@media(hover:hover)]:group-focus-within:opacity-100';

export const CardOptionsSection: React.FC<CardOptionsSectionProps> = ({
  cardOptions,
  entityOptions,
  newCardName,
  setNewCardName,
  newCardLastFour,
  setNewCardLastFour,
  newCardEntity,
  setNewCardEntity,
  newCardZohoAccountId,
  setNewCardZohoAccountId,
  editingCardIndex,
  editCardName,
  setEditCardName,
  editCardLastFour,
  setEditCardLastFour,
  editCardEntity,
  setEditCardEntity,
  editCardZohoAccountId,
  setEditCardZohoAccountId,
  isSaving,
  onAddCard,
  onRemoveCard,
  onStartEdit,
  onCancelEdit,
  onSaveEdit
}) => {
  return (
    <section className="card overflow-hidden">
      {/* Header */}
      <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
            <CreditCard className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="card-title">Payment Cards</h3>
              <span className="chip bg-stone-50 px-2 py-0.5 text-[11px] text-stone-500 ring-stone-200">
                {cardOptions?.length || 0}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-stone-500">Cards offered on expense forms.</p>
          </div>
        </div>
      </div>

      {/* Add form */}
      <div className="border-b border-stone-100 bg-stone-50/60 px-4 py-4 sm:px-5">
        <p className="micro-label">Add a card</p>
        <div className="mt-3 space-y-3">
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="new-card-name" className="mb-1 block text-xs font-semibold text-stone-700">
                Card name
              </label>
              <input
                id="new-card-name"
                type="text"
                value={newCardName}
                onChange={(e) => setNewCardName(e.target.value)}
                className="input-field"
                placeholder="e.g., Haute Inc USD Amex"
              />
            </div>
            <div className="w-20 shrink-0 sm:w-24">
              <label htmlFor="new-card-last-four" className="mb-1 block text-xs font-semibold text-stone-700">
                Last 4
              </label>
              <input
                id="new-card-last-four"
                type="text"
                value={newCardLastFour}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setNewCardLastFour(value);
                }}
                className="input-field"
                placeholder="0000"
                maxLength={4}
              />
            </div>
          </div>

          <div>
            <label htmlFor="new-card-entity" className="mb-1 block text-xs font-semibold text-stone-700">
              Entity
            </label>
            <select
              id="new-card-entity"
              value={newCardEntity}
              onChange={(e) => setNewCardEntity(e.target.value)}
              className="input-field"
            >
              <option value="">Personal Card (No Entity)</option>
              {entityOptions.map((entity, idx) => (
                <option key={idx} value={entity}>{entity}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="new-card-zoho-id" className="mb-1 block text-xs font-semibold text-stone-700">
              Zoho payment account ID
            </label>
            <input
              id="new-card-zoho-id"
              type="text"
              value={newCardZohoAccountId}
              onChange={(e) => setNewCardZohoAccountId(e.target.value)}
              className="input-field"
              placeholder="Optional"
            />
            <p className="mt-1 text-xs text-stone-500">Links this card to a Zoho Books payment account.</p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onAddCard}
              disabled={!newCardName || !newCardLastFour || newCardLastFour.length !== 4 || isSaving}
              className="btn-primary px-4 py-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add card</span>
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      {cardOptions.length === 0 ? (
        <div className="px-4 py-10 text-center sm:px-5">
          <CreditCard className="mx-auto h-6 w-6 text-stone-300" />
          <p className="mt-2 text-sm font-medium text-stone-700">No cards yet</p>
          <p className="mt-1 text-xs text-stone-500">Add your first card using the form above.</p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {cardOptions.map((option, index) => (
            <li
              key={index}
              className={
                editingCardIndex === index
                  ? 'bg-stone-50 px-4 py-4 sm:px-5'
                  : 'group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-stone-50 sm:px-5'
              }
            >
              {editingCardIndex === index ? (
                <div className="w-full space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editCardName}
                      onChange={(e) => setEditCardName(e.target.value)}
                      className="input-field min-w-0 flex-1 py-2 sm:text-sm"
                      placeholder="Card name"
                      aria-label="Card name"
                    />
                    <input
                      type="text"
                      value={editCardLastFour}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setEditCardLastFour(value);
                      }}
                      className="input-field w-20 shrink-0 py-2 sm:w-24 sm:text-sm"
                      placeholder="Last 4"
                      aria-label="Last four digits"
                      maxLength={4}
                    />
                  </div>
                  <select
                    value={editCardEntity}
                    onChange={(e) => setEditCardEntity(e.target.value)}
                    className="input-field py-2 sm:text-sm"
                    aria-label="Entity"
                  >
                    <option value="">Personal Card (No Entity)</option>
                    {entityOptions.map((entity, idx) => (
                      <option key={idx} value={entity}>{entity}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editCardZohoAccountId}
                    onChange={(e) => setEditCardZohoAccountId(e.target.value)}
                    className="input-field py-2 sm:text-sm"
                    placeholder="Zoho Payment Account ID"
                    aria-label="Zoho payment account ID"
                  />
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={onCancelEdit}
                      disabled={isSaving}
                      className="btn-ghost p-2 disabled:opacity-50"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onSaveEdit(index)}
                      disabled={isSaving || !editCardName || !editCardLastFour || editCardLastFour.length !== 4}
                      className="btn-ghost p-2 text-brand-600 hover:text-brand-700 disabled:opacity-50"
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate font-medium text-stone-900">{option.name}</span>
                      <span className="font-mono text-xs text-stone-500">&bull;&bull;&bull;&bull; {option.lastFour}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {option.entity ? (
                        <span className="chip bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700 ring-brand-200/70">
                          {option.entity}
                        </span>
                      ) : (
                        <span className="text-xs text-stone-400">Personal card</span>
                      )}
                      {option.zohoPaymentAccountId && (
                        <span className="font-mono text-[11px] text-stone-400">
                          Zoho {option.zohoPaymentAccountId}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={ROW_ACTIONS_CLASS}>
                    <button
                      onClick={() => onStartEdit(index)}
                      disabled={isSaving}
                      className="btn-ghost p-2 disabled:opacity-50"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onRemoveCard(option)}
                      disabled={isSaving}
                      className="btn-ghost p-2 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
