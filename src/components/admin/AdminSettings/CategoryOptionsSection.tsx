/**
 * CategoryOptionsSection Component
 *
 * Category options management section.
 */

import React from 'react';
import { Tag, Plus, Pencil, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { usePicklists } from '../../../contexts/PicklistContext';
import { findUnmappedCategories } from '../../../utils/categoryMapping';

interface CategoryOption {
  name: string;
  zohoExpenseAccountIds?: {
    haute_brands?: string | null;
    boomin_brands?: string | null;
    nirvana_kulture?: string | null;
  } | null;
}

interface CategoryOptionsSectionProps {
  categoryOptions: CategoryOption[];
  newCategoryOption: string;
  setNewCategoryOption: (value: string) => void;
  newCategoryZohoHauteId: string;
  setNewCategoryZohoHauteId: (value: string) => void;
  newCategoryZohoBoomId: string;
  setNewCategoryZohoBoomId: (value: string) => void;
  newCategoryZohoNirvanaId: string;
  setNewCategoryZohoNirvanaId: (value: string) => void;
  editingCategoryIndex: number | null;
  editCategoryValue: string;
  setEditCategoryValue: (value: string) => void;
  editCategoryZohoHauteId: string;
  setEditCategoryZohoHauteId: (value: string) => void;
  editCategoryZohoBoomId: string;
  setEditCategoryZohoBoomId: (value: string) => void;
  editCategoryZohoNirvanaId: string;
  setEditCategoryZohoNirvanaId: (value: string) => void;
  isSaving: boolean;
  onAddCategory: () => void;
  onRemoveCategory: (option: CategoryOption) => void;
  onStartEdit: (index: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (index: number) => void;
}

/* Categories offered by the live picklist that this table cannot book to. */
const UnmappedCategoryNotice: React.FC<{ categoryOptions: CategoryOption[] }> = ({
  categoryOptions,
}) => {
  const { categories, source, zohoPostingOwner } = usePicklists();

  // Only a concern once the dropdown stops being fed by this very table...
  if (source !== 'midas') return null;
  // ...and only while Trade Show is the one posting to Zoho. Under
  // EXPENSE_BACKEND=midas, Midas posts and reads its own mapping, so gaps here
  // change nothing and reporting them would send an accountant chasing ghosts.
  if (zohoPostingOwner !== 'trade-show') return null;

  const unmapped = findUnmappedCategories(
    categories.map((c) => c.name),
    categoryOptions
  );
  if (unmapped.length === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-5">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-900">
            {unmapped.length} {unmapped.length === 1 ? 'category has' : 'categories have'} no Zoho
            account ID
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            These are selectable on expenses but will book to the brand default account until an ID
            is added below.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {unmapped.map((name) => (
              <span
                key={name}
                className="chip bg-white px-2 py-0.5 text-[11px] text-amber-900 ring-amber-200"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* Row actions: always visible on touch devices; revealed on hover/focus
   when a hover-capable pointer is present. */
const ROW_ACTIONS_CLASS =
  'flex shrink-0 items-center gap-1 transition-opacity ' +
  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 ' +
  '[@media(hover:hover)]:group-focus-within:opacity-100';

export const CategoryOptionsSection: React.FC<CategoryOptionsSectionProps> = ({
  categoryOptions,
  newCategoryOption,
  setNewCategoryOption,
  newCategoryZohoHauteId,
  setNewCategoryZohoHauteId,
  newCategoryZohoBoomId,
  setNewCategoryZohoBoomId,
  newCategoryZohoNirvanaId,
  setNewCategoryZohoNirvanaId,
  editingCategoryIndex,
  editCategoryValue,
  setEditCategoryValue,
  editCategoryZohoHauteId,
  setEditCategoryZohoHauteId,
  editCategoryZohoBoomId,
  setEditCategoryZohoBoomId,
  editCategoryZohoNirvanaId,
  setEditCategoryZohoNirvanaId,
  isSaving,
  onAddCategory,
  onRemoveCategory,
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
            <Tag className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="card-title">Expense Categories</h3>
              <span className="chip bg-stone-50 px-2 py-0.5 text-[11px] text-stone-500 ring-stone-200">
                {categoryOptions?.length || 0}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-stone-500">Categories offered when logging expenses.</p>
          </div>
        </div>
      </div>

      {/* Add form */}
      <UnmappedCategoryNotice categoryOptions={categoryOptions} />

      <div className="border-b border-stone-100 bg-stone-50/60 px-4 py-4 sm:px-5">
        <p className="micro-label">Add a category</p>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="new-category-name" className="mb-1 block text-xs font-semibold text-stone-700">
              Category name
            </label>
            <input
              id="new-category-name"
              type="text"
              value={newCategoryOption}
              onChange={(e) => setNewCategoryOption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAddCategory()}
              className="input-field"
              placeholder="e.g., Travel - Flight"
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-stone-700">Zoho expense account IDs</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={newCategoryZohoHauteId}
                onChange={(e) => setNewCategoryZohoHauteId(e.target.value)}
                className="input-field py-2 sm:text-xs"
                placeholder="Haute Zoho ID"
                aria-label="Haute Zoho ID"
              />
              <input
                type="text"
                value={newCategoryZohoBoomId}
                onChange={(e) => setNewCategoryZohoBoomId(e.target.value)}
                className="input-field py-2 sm:text-xs"
                placeholder="Boomin Zoho ID"
                aria-label="Boomin Zoho ID"
              />
              <input
                type="text"
                value={newCategoryZohoNirvanaId}
                onChange={(e) => setNewCategoryZohoNirvanaId(e.target.value)}
                className="input-field py-2 sm:text-xs"
                placeholder="Nirvana Zoho ID"
                aria-label="Nirvana Zoho ID"
              />
            </div>
            <p className="mt-1 text-xs text-stone-500">Optional — maps this category to Zoho Books per brand.</p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={onAddCategory}
              disabled={!newCategoryOption || isSaving}
              className="btn-primary px-4 py-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add category</span>
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      {categoryOptions.length === 0 ? (
        <div className="px-4 py-10 text-center sm:px-5">
          <Tag className="mx-auto h-6 w-6 text-stone-300" />
          <p className="mt-2 text-sm font-medium text-stone-700">No categories yet</p>
          <p className="mt-1 text-xs text-stone-500">Add your first category using the form above.</p>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <ul className="divide-y divide-stone-100">
            {categoryOptions.map((option, index) => (
              <li
                key={index}
                className={
                  editingCategoryIndex === index
                    ? 'bg-stone-50 px-4 py-4 sm:px-5'
                    : 'group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-stone-50 sm:px-5'
                }
              >
                {editingCategoryIndex === index ? (
                  <div className="w-full space-y-2">
                    <input
                      type="text"
                      value={editCategoryValue}
                      onChange={(e) => setEditCategoryValue(e.target.value)}
                      className="input-field py-2 sm:text-sm"
                      placeholder="Category name"
                      aria-label="Category name"
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        type="text"
                        value={editCategoryZohoHauteId}
                        onChange={(e) => setEditCategoryZohoHauteId(e.target.value)}
                        className="input-field py-2 sm:text-xs"
                        placeholder="Haute Zoho ID"
                        aria-label="Haute Zoho ID"
                      />
                      <input
                        type="text"
                        value={editCategoryZohoBoomId}
                        onChange={(e) => setEditCategoryZohoBoomId(e.target.value)}
                        className="input-field py-2 sm:text-xs"
                        placeholder="Boomin Zoho ID"
                        aria-label="Boomin Zoho ID"
                      />
                      <input
                        type="text"
                        value={editCategoryZohoNirvanaId}
                        onChange={(e) => setEditCategoryZohoNirvanaId(e.target.value)}
                        className="input-field py-2 sm:text-xs"
                        placeholder="Nirvana Zoho ID"
                        aria-label="Nirvana Zoho ID"
                      />
                    </div>
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
                        disabled={isSaving || !editCategoryValue.trim()}
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
                      <span className="block truncate font-medium text-stone-900">{option.name}</span>
                      {(option.zohoExpenseAccountIds?.haute_brands || option.zohoExpenseAccountIds?.boomin_brands || option.zohoExpenseAccountIds?.nirvana_kulture) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {option.zohoExpenseAccountIds.haute_brands && (
                            <span className="chip bg-stone-50 px-2 py-0.5 text-[11px] text-stone-500 ring-stone-200">
                              Haute&nbsp;<span className="font-mono">{option.zohoExpenseAccountIds.haute_brands}</span>
                            </span>
                          )}
                          {option.zohoExpenseAccountIds.boomin_brands && (
                            <span className="chip bg-stone-50 px-2 py-0.5 text-[11px] text-stone-500 ring-stone-200">
                              Boomin&nbsp;<span className="font-mono">{option.zohoExpenseAccountIds.boomin_brands}</span>
                            </span>
                          )}
                          {option.zohoExpenseAccountIds.nirvana_kulture && (
                            <span className="chip bg-stone-50 px-2 py-0.5 text-[11px] text-stone-500 ring-stone-200">
                              Nirvana&nbsp;<span className="font-mono">{option.zohoExpenseAccountIds.nirvana_kulture}</span>
                            </span>
                          )}
                        </div>
                      )}
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
                        onClick={() => onRemoveCategory(option)}
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
        </div>
      )}
    </section>
  );
};
