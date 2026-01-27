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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5 lg:p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
          <CreditCard className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Card Options</h3>
            <span className="text-xs text-gray-500">{cardOptions?.length || 0} configured</span>
          </div>
          <p className="text-gray-600">Manage available payment card options</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-3">
          {/* Card Name and Last 4 */}
          <div className="flex gap-3">
            <input
              type="text"
              value={newCardName}
              onChange={(e) => setNewCardName(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Card name (e.g., Haute Inc USD Amex)"
            />
            <input
              type="text"
              value={newCardLastFour}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                setNewCardLastFour(value);
              }}
              className="w-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Last 4"
              maxLength={4}
            />
          </div>
          
          {/* Entity Selection */}
          <div className="flex gap-3">
            <select
              value={newCardEntity}
              onChange={(e) => setNewCardEntity(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">Personal Card (No Entity)</option>
              {entityOptions.map((entity, idx) => (
                <option key={idx} value={entity}>{entity}</option>
              ))}
            </select>
          </div>
          
          {/* Zoho Payment Account ID and Add Button */}
          <div className="flex gap-3">
            <input
              type="text"
              value={newCardZohoAccountId}
              onChange={(e) => setNewCardZohoAccountId(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Zoho Payment Account ID (optional)"
            />
            <button
              onClick={onAddCard}
              disabled={!newCardName || !newCardLastFour || newCardLastFour.length !== 4 || isSaving}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {cardOptions.map((option, index) => (
            <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gray-50 p-3 rounded-lg">
              {editingCardIndex === index ? (
                <div className="w-full space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editCardName}
                      onChange={(e) => setEditCardName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Card name"
                    />
                    <input
                      type="text"
                      value={editCardLastFour}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setEditCardLastFour(value);
                      }}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Last 4"
                      maxLength={4}
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={editCardEntity}
                      onChange={(e) => setEditCardEntity(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      <option value="">Personal Card (No Entity)</option>
                      {entityOptions.map((entity, idx) => (
                        <option key={idx} value={entity}>{entity}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editCardZohoAccountId}
                      onChange={(e) => setEditCardZohoAccountId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Zoho Payment Account ID"
                    />
                    <button
                      onClick={() => onSaveEdit(index)}
                      disabled={isSaving || !editCardName || !editCardLastFour || editCardLastFour.length !== 4}
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
                    <div className="text-gray-900 font-medium">{option.name} | {option.lastFour}</div>
                    <div className="text-sm mt-0.5 space-y-0.5">
                      {option.entity ? (
                        <span className="text-blue-600 font-medium">{option.entity}</span>
                      ) : (
                        <span className="text-gray-500">Personal Card</span>
                      )}
                      {option.zohoPaymentAccountId && (
                        <div className="text-xs text-emerald-600">
                          Zoho: {option.zohoPaymentAccountId}
                        </div>
                      )}
                    </div>
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
                      onClick={() => onRemoveCard(option)}
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

