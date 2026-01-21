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
      className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
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
      
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full flex items-center justify-center">
            <Upload className="w-12 h-12 text-white" />
          </div>
        </div>
        
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Drop your receipt here, or click to browse
          </h3>
          <p className="text-gray-600 max-w-md mx-auto">
            Supports images (JPG, PNG, HEIC, WebP) and PDF files. Our OCR will automatically extract expense details.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
          <div className="flex items-center space-x-3">
            <Camera className="w-8 h-8 text-blue-600" />
            <div>
              <h4 className="font-medium text-gray-900">EasyOCR Engine</h4>
              <p className="text-sm text-gray-600">High-accuracy AI OCR</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <FileText className="w-8 h-8 text-emerald-600" />
            <div>
              <h4 className="font-medium text-gray-900">PDF Support</h4>
              <p className="text-sm text-gray-600">Multi-page PDFs supported</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Scan className="w-8 h-8 text-purple-600" />
            <div>
              <h4 className="font-medium text-gray-900">Smart Fields</h4>
              <p className="text-sm text-gray-600">Amount, date, merchant & more</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

