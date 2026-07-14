/**
 * FullImageModal Component
 * 
 * Modal for viewing full-size receipt image.
 */

import React from 'react';
import { X } from 'lucide-react';

interface FullImageModalProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

export const FullImageModal: React.FC<FullImageModalProps> = ({
  imageUrl,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="tap-target absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 bg-white rounded-full hover:bg-stone-100 transition-colors z-10"
        title="Close"
      >
        <X className="w-6 h-6 text-stone-900" />
      </button>
      <div className="max-w-5xl max-h-[90vh] overflow-auto">
        <img
          src={imageUrl}
          alt="Receipt full size"
          className="w-auto h-auto max-w-full max-h-[90vh] rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
};

