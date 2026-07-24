/**
 * ReceiptUploadDropzone Component
 * 
 * Drag-and-drop file upload area.
 */

import React, { useRef } from 'react';
import { Upload, Camera, FileText, Scan } from 'lucide-react';

interface ReceiptUploadDropzoneProps {
  dragActive: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFilesSelected: (files: FileList) => void;
}

export const ReceiptUploadDropzone: React.FC<ReceiptUploadDropzoneProps> = ({
  dragActive,
  fileInputRef,
  onDrag,
  onDrop,
  onFilesSelected
}) => {
  return (
    <div
      className={`relative rounded-card border-2 border-dashed p-6 sm:p-12 text-center transition-colors duration-200 ${
        dragActive
          ? 'border-brand-500 bg-brand-50/70'
          : 'border-stone-300 hover:border-brand-300 hover:bg-brand-50/30 active:bg-brand-50/50'
      }`}
      onDragEnter={onDrag}
      onDragLeave={onDrag}
      onDragOver={onDrag}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,application/pdf,.pdf"
        onChange={(e) => e.target.files && onFilesSelected(e.target.files)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      
      <div className="space-y-4 sm:space-y-6">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 shadow-brand">
            <Camera className="h-10 w-10 text-white sm:hidden" />
            <Upload className="hidden sm:block w-12 h-12 text-white" />
          </div>
        </div>

        <div>
          <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-stone-900 mb-2">
            <span className="sm:hidden">Tap to scan your receipt</span>
            <span className="hidden sm:inline">Drop your receipt here, or click to browse</span>
          </h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            <span className="sm:hidden">Snap a photo with your camera or pick one from your library. </span>
            Supports images (JPG, PNG, HEIC, WebP) and PDF files. Our OCR will automatically extract expense details.
          </p>
        </div>

        <div className="hidden sm:grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-stone-900">EasyOCR Engine</h4>
              <p className="text-xs text-stone-500">High-accuracy AI OCR</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600 ring-1 ring-inset ring-accent-100">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-stone-900">PDF Support</h4>
              <p className="text-xs text-stone-500">Multi-page PDFs supported</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-100">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-stone-900">Smart Fields</h4>
              <p className="text-xs text-stone-500">Amount, date, merchant & more</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

