/**
 * CategoryOptionsSection Component
 * 
 * Category options management section.
 */

import React from 'react';
import { Tag, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

interface CategoryOption {
  name: string;
  zohoExpenseAccountId?: string | null;
}

interface CategoryOptionsSectionProps {
  categoryOptions: CategoryOption[];
  newCategoryOption: string;
  setNewCategoryOption: (value: string) => void;
  newCategoryZohoAccountId: string;
  setNewCategoryZohoAccountId: (value: string) => void;
  editingCategoryIndex: number | null;
  editCategoryValue: string;
  setEditCategoryValue: (value: string) => void;
  editCategoryZohoAccountId: string;
  setEditCategoryZohoAccountId: (value: string) => void;
  isSaving: boolean;
  onAddCategory: () => void;
  onRemoveCategory: (option: CategoryOption) => void;
  onStartEdit: (index: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (index: number) => void;
}

export const CategoryOptionsSection: React.FC<CategoryOptionsSectionProps> = ({
  categoryOptions,
  newCategoryOption,
  setNewCategoryOption,
  newCategoryZohoAccountId,
  setNewCategoryZohoAccountId,
  editingCategoryIndex,
  editCategoryValue,
  setEditCategoryValue,
  editCategoryZohoAccountId,
  setEditCategoryZohoAccountId,
  isSaving,
  onAddCategory,
  onRemoveCategory,
  onStartEdit,
  onCancelEdit,
  onSaveEdit
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5 lg:p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
          <Tag className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Expense Categories</h3>
            <span className="text-xs text-gray-500">{categoryOptions?.length || 0} configured</span>
          </div>
          <p className="text-gray-600">Manage expense category options</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={newCategoryOption}
              onChange={(e) => setNewCategoryOption(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onAddCategory()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter new category name..."
            />
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={newCategoryZohoAccountId}
              onChange={(e) => setNewCategoryZohoAccountId(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Zoho Expense Account ID (optional)"
            />
            <button
              onClick={onAddCategory}
              disabled={!newCategoryOption || isSaving}
              className="bg-purple-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {categoryOptions.map((option, index) => (
            <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gray-50 p-3 rounded-lg">
              {editingCategoryIndex === index ? (
                <div className="w-full space-y-2">
                  <input
                    type="text"
                    value={editCategoryValue}
                    onChange={(e) => setEditCategoryValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Category name"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editCategoryZohoAccountId}
                      onChange={(e) => setEditCategoryZohoAccountId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Zoho Expense Account ID"
                    />
                    <button
                      onClick={() => onSaveEdit(index)}
                      disabled={isSaving || !editCategoryValue.trim()}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onCancelEdit}
                      disabled={isSaving}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <span className="text-gray-900">{option.name}</span>
                    {option.zohoExpenseAccountId && (
                      <div className="text-xs text-emerald-600 mt-0.5">
                        Zoho: {option.zohoExpenseAccountId}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onStartEdit(index)}
                      disabled={isSaving}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onRemoveCategory(option)}
                      disabled={isSaving}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
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

