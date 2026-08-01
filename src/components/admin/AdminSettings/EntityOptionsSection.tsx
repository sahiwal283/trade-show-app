/**
 * EntityOptionsSection Component
 *
 * Entity options management section.
 */

import React from 'react';
import { Building2, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

interface EntityOptionsSectionProps {
  entityOptions: string[];
  newEntityOption: string;
  setNewEntityOption: (value: string) => void;
  editingEntityIndex: number | null;
  editEntityValue: string;
  setEditEntityValue: (value: string) => void;
  isSaving: boolean;
  onAddEntity: () => void;
  onRemoveEntity: (option: string) => void;
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

export const EntityOptionsSection: React.FC<EntityOptionsSectionProps> = ({
  entityOptions,
  newEntityOption,
  setNewEntityOption,
  editingEntityIndex,
  editEntityValue,
  setEditEntityValue,
  isSaving,
  onAddEntity,
  onRemoveEntity,
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
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="card-title">Entities</h3>
              <span className="chip bg-stone-50 px-2 py-0.5 text-[11px] text-stone-500 ring-stone-200">
                {entityOptions?.length || 0}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-stone-500">Business entities used for Zoho assignments.</p>
          </div>
        </div>
      </div>

      {/* Add form */}
      <div className="border-b border-stone-100 bg-stone-50/60 px-4 py-4 sm:px-5">
        <label htmlFor="new-entity-name" className="micro-label">Add an entity</label>
        <div className="mt-2 flex gap-2">
          <input
            id="new-entity-name"
            type="text"
            value={newEntityOption}
            onChange={(e) => setNewEntityOption(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddEntity()}
            className="input-field min-w-0 flex-1"
            placeholder="e.g., Entity A - Main Operations"
          />
          <button
            onClick={onAddEntity}
            disabled={!newEntityOption || isSaving}
            className="btn-primary shrink-0 px-4 py-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* List */}
      {entityOptions.length === 0 ? (
        <div className="px-4 py-10 text-center sm:px-5">
          <Building2 className="mx-auto h-6 w-6 text-stone-300" />
          <p className="mt-2 text-sm font-medium text-stone-700">No entities yet</p>
          <p className="mt-1 text-xs text-stone-500">Add your first entity using the form above.</p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {entityOptions.map((option, index) => (
            <li
              key={index}
              className={
                editingEntityIndex === index
                  ? 'bg-stone-50 px-4 py-3 sm:px-5'
                  : 'group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-stone-50 sm:px-5'
              }
            >
              {editingEntityIndex === index ? (
                <div className="flex w-full items-center gap-2">
                  <input
                    type="text"
                    value={editEntityValue}
                    onChange={(e) => setEditEntityValue(e.target.value)}
                    className="input-field min-w-0 flex-1 py-2 sm:text-sm"
                    placeholder="Entity name"
                    aria-label="Entity name"
                  />
                  <div className="flex shrink-0 gap-1">
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
                      disabled={isSaving || !editEntityValue.trim()}
                      className="btn-ghost p-2 text-brand-600 hover:text-brand-700 disabled:opacity-50"
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium text-stone-900">{option}</span>
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
                      onClick={() => onRemoveEntity(option)}
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
