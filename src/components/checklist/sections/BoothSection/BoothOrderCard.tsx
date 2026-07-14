/**
 * BoothOrderCard Component
 * 
 * Booth space ordered checkbox with notes and map upload.
 */

import React from 'react';
import { CheckCircle2, Circle, Receipt, Eye } from 'lucide-react';
import { ChecklistData } from '../../TradeShowChecklist';
import { BoothMapUpload } from './BoothMapUpload';

interface BoothOrderCardProps {
  checklist: ChecklistData;
  boothNotes: string;
  setBoothNotes: (notes: string) => void;
  onBoothToggle: () => Promise<void>;
  onNotesBlur: () => Promise<void>;
  onMapUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDeleteMap: () => Promise<void>;
  uploadingMap: boolean;
  saving: boolean;
  receiptCount: number;
  onViewReceipt: () => void;
  onUploadReceipt: () => void;
  boothMapInputRef: React.RefObject<HTMLInputElement>;
}

export const BoothOrderCard: React.FC<BoothOrderCardProps> = ({
  checklist,
  boothNotes,
  setBoothNotes,
  onBoothToggle,
  onNotesBlur,
  onMapUpload,
  onDeleteMap,
  uploadingMap,
  saving,
  receiptCount,
  onViewReceipt,
  onUploadReceipt,
  boothMapInputRef
}) => {

  return (
    <div className="border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition-colors">
      <button
        onClick={onBoothToggle}
        disabled={saving}
        className="flex items-start gap-3 w-full text-left group"
      >
        {checklist.booth_ordered ? (
          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 group-hover:scale-110 transition-transform" />
        ) : (
          <Circle className="w-6 h-6 text-stone-400 flex-shrink-0 group-hover:text-stone-600 transition-colors" />
        )}
        <div className="flex-1">
          <p className={`font-semibold ${checklist.booth_ordered ? 'text-stone-900' : 'text-stone-700'}`}>
            Booth Space Ordered
          </p>
          <p className="text-sm text-stone-500 mt-1">Reserve exhibition space at the venue</p>
        </div>
      </button>

      <div className="mt-3 ml-9 space-y-2">
        <textarea
          value={boothNotes}
          onChange={(e) => setBoothNotes(e.target.value)}
          onBlur={onNotesBlur}
          placeholder="Add notes (booth number, size, location, etc.)"
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm resize-none"
          rows={2}
        />
        
        <BoothMapUpload
          boothMapUrl={checklist.booth_map_url}
          uploadingMap={uploadingMap}
          boothMapInputRef={boothMapInputRef}
          onMapUpload={onMapUpload}
          onDeleteMap={onDeleteMap}
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

