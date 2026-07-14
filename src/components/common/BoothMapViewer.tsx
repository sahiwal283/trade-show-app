/**
 * BoothMapViewer Component
 * 
 * Modal/lightbox for viewing booth map images in full size.
 */

import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Maximize2 } from 'lucide-react';

interface BoothMapViewerProps {
  boothMapUrl: string;
  isOpen: boolean;
  onClose: () => void;
}

export const BoothMapViewer: React.FC<BoothMapViewerProps> = ({
  boothMapUrl,
  isOpen,
  onClose
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Reset states when modal opens or URL changes
  useEffect(() => {
    if (isOpen && boothMapUrl) {
      setImageError(false);
      setImageLoading(true);
    }
  }, [isOpen, boothMapUrl]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Defensive check: ensure boothMapUrl is a string
  if (!boothMapUrl || typeof boothMapUrl !== 'string') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-stone-900">Booth Floor Plan</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-stone-500" />
            </button>
          </div>
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-stone-400 mb-4" />
            <p className="text-stone-500">Invalid booth map URL</p>
          </div>
        </div>
      </div>
    );
  }

  // Construct image URL - ensure boothMapUrl starts with / if it doesn't already
  const normalizedUrl = boothMapUrl.startsWith('/') ? boothMapUrl : `/${boothMapUrl}`;
  // @ts-ignore - Vite provides this at build time
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
  const imageUrl = `${apiBaseUrl}${normalizedUrl}`;

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    console.error('[BoothMapViewer] Failed to load booth map image:', imageUrl);
    setImageError(true);
    setImageLoading(false);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking the backdrop, not the content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <Maximize2 className="w-5 h-5 text-stone-600" />
            <h2 className="text-xl font-bold text-stone-900">Booth Floor Plan</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        {/* Image Container */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-stone-50">
          {imageLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-stone-400 mb-4" />
              <p className="text-sm text-stone-500">Loading image...</p>
            </div>
          )}

          {imageError && (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-stone-400 mb-4" />
              <p className="text-stone-500 mb-2">Failed to load booth map image</p>
              <p className="text-xs text-stone-400 text-center max-w-md">
                The image could not be loaded. Please check the URL or try again later.
              </p>
            </div>
          )}

          {!imageError && (
            <img
              src={imageUrl}
              alt="Booth Floor Plan"
              className={`max-w-full max-h-[calc(90vh-120px)] object-contain rounded-lg shadow-lg ${imageLoading ? 'hidden' : ''}`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 rounded-b-xl">
          <p className="text-xs text-stone-500 text-center">
            Click outside the image or press Escape to close
          </p>
        </div>
      </div>
    </div>
  );
};

