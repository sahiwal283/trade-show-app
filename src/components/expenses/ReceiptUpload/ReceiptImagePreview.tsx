/**
 * ReceiptImagePreview Component
 * 
 * Image preview with processing overlay.
 */

import React from 'react';

interface ReceiptImagePreviewProps {
  uploadedImage: string;
  processing: boolean;
  onImageClick: () => void;
}

export const ReceiptImagePreview: React.FC<ReceiptImagePreviewProps> = ({
  uploadedImage,
  processing,
  onImageClick
}) => {
  return (
    <div className="flex justify-center">
      <div className="relative max-w-md">
        <div 
          onClick={() => !processing && onImageClick()}
          className="cursor-pointer group relative"
        >
          <img
            src={uploadedImage}
            alt="Uploaded receipt"
            className="w-full h-auto rounded-lg ring-1 ring-stone-200 shadow-elevation-2 transition-shadow duration-200 group-hover:shadow-elevation-3"
          />
          {!processing && (
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-lg transition-all flex items-center justify-center">
              <div className="bg-white bg-opacity-90 px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-sm font-medium text-stone-900">Click to view full size</p>
              </div>
            </div>
          )}
        </div>
        {processing && (
          <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="font-medium text-stone-900">Processing receipt...</p>
              <p className="text-sm text-stone-500">Extracting expense data with OCR</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

