/**
 * ElectricityOrderCard Component
 * 
 * Electricity ordered checkbox with notes.
 */

import React from 'react';
import { CheckCircle2, Circle, Zap, Receipt, Eye } from 'lucide-react';
import { ChecklistData } from '../../TradeShowChecklist';

interface ElectricityOrderCardProps {
  checklist: ChecklistData;
  electricityNotes: string;
  setElectricityNotes: (notes: string) => void;
  onElectricityToggle: () => Promise<void>;
  onNotesBlur: () => Promise<void>;
  saving: boolean;
  receiptCount: number;
  onViewReceipt: () => void;
  onUploadReceipt: () => void;
}

export const ElectricityOrderCard: React.FC<ElectricityOrderCardProps> = ({
  checklist,
  electricityNotes,
  setElectricityNotes,
  onElectricityToggle,
  onNotesBlur,
  saving,
  receiptCount,
  onViewReceipt,
  onUploadReceipt
}) => {
  return (
    <div className="border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition-colors">
      <button
        onClick={onElectricityToggle}
        disabled={saving}
        className="flex items-start gap-3 w-full text-left group"
      >
        {checklist.electricity_ordered ? (
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 group-hover:scale-110 transition-transform" />
        ) : (
          <Circle className="w-6 h-6 text-stone-400 flex-shrink-0 group-hover:text-stone-600 transition-colors" />
        )}
        <div className="flex-1 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-600" />
          <div>
            <p className={`font-semibold ${checklist.electricity_ordered ? 'text-stone-900' : 'text-stone-700'}`}>
              Electricity Ordered
            </p>
            <p className="text-sm text-stone-500 mt-1">Order power/electrical hookups for the booth</p>
          </div>
        </div>
      </button>

      <div className="mt-3 ml-9 space-y-2">
        <textarea
          value={electricityNotes}
          onChange={(e) => setElectricityNotes(e.target.value)}
          onBlur={onNotesBlur}
          placeholder="Add notes (voltage, number of outlets, special requirements, etc.)"
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm resize-none"
          rows={2}
        />
        <div className="flex items-center gap-2">
          {receiptCount > 0 && (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                <CheckCircle2 className="w-3 h-3" />
                {receiptCount} Receipt{receiptCount !== 1 ? 's' : ''}
              </span>
              <button
                onClick={onViewReceipt}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                title="View receipt"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
            </>
          )}
          <button
            onClick={onUploadReceipt}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
          >
            <Receipt className="w-4 h-4" />
            {receiptCount > 0 ? 'Add Another' : 'Upload Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
};

