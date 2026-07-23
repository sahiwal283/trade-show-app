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
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 md:p-5 lg:p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center">
          <Building2 className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Entity Options</h3>
            <span className="text-xs text-stone-500">{entityOptions?.length || 0} configured</span>
          </div>
          <p className="text-sm text-stone-600">Manage Zoho entity assignments</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={newEntityOption}
            onChange={(e) => setNewEntityOption(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddEntity()}
            className="min-w-0 flex-1 px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter new entity option..."
          />
          <button
            onClick={onAddEntity}
            disabled={!newEntityOption || isSaving}
            className="bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Add</span>
          </button>
        </div>

        <div className="space-y-2">
          {entityOptions.map((option, index) => (
            <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-stone-50 p-3 rounded-lg">
              {editingEntityIndex === index ? (
                <>
                  <input
                    type="text"
                    value={editEntityValue}
                    onChange={(e) => setEditEntityValue(e.target.value)}
                    className="min-w-0 flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Entity name"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSaveEdit(index)}
                      disabled={isSaving || !editEntityValue.trim()}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onCancelEdit}
                      disabled={isSaving}
                      className="p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-50"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex-1 text-stone-900">{option}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onStartEdit(index)}
                      disabled={isSaving}
                      className="p-2 text-stone-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onRemoveEntity(option)}
                      disabled={isSaving}
                      className="p-2 text-stone-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

