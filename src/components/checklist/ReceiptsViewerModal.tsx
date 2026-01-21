/**
 * ReceiptsViewerModal Component
 * 
 * Modal for viewing multiple receipts in a gallery/carousel format with full expense details.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar, DollarSign, FileText, Receipt, CreditCard, MapPin, Building2, CheckCircle, User } from 'lucide-react';
import { Expense } from '../../App';
import { formatLocalDate } from '../../utils/dateUtils';
import { getStatusColor, getReimbursementStatusColor, formatReimbursementStatus } from '../../constants/appConstants';

interface ReceiptsViewerModalProps {
  receipts: Expense[];
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiptsViewerModal: React.FC<ReceiptsViewerModalProps> = ({
  receipts,
  isOpen,
  onClose
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  // Use ref to store latest receipts length to avoid closure issues
  const receiptsLengthRef = useRef(receipts.length);

  // Navigation handlers (using useCallback to avoid stale closures)
  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? receipts.length - 1 : prev - 1));
  }, [receipts.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === receipts.length - 1 ? 0 : prev + 1));
  }, [receipts.length]);

  // Update ref when receipts length changes
  useEffect(() => {
    receiptsLengthRef.current = receipts.length;
  }, [receipts.length]);

  // Reset to first receipt when modal opens or receipts change
  useEffect(() => {
    if (isOpen && receipts.length > 0) {
      setCurrentIndex(0);
    }
  }, [isOpen, receipts.length]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        // Use functional form of setState with ref to avoid closure issues
        setCurrentIndex((prev) => {
          const receiptsLength = receiptsLengthRef.current;
          return receiptsLength > 0 ? (prev === 0 ? receiptsLength - 1 : prev - 1) : 0;
        });
      } else if (e.key === 'ArrowRight') {
        // Use functional form of setState with ref to avoid closure issues
        setCurrentIndex((prev) => {
          const receiptsLength = receiptsLengthRef.current;
          return receiptsLength > 0 ? (prev === receiptsLength - 1 ? 0 : prev + 1) : 0;
        });
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]); // No need to depend on receipts.length since we use ref

  if (!isOpen || receipts.length === 0) return null;

  // Safety check: ensure currentIndex is within bounds
  const safeIndex = Math.max(0, Math.min(currentIndex, receipts.length - 1));
  const currentReceipt = receipts[safeIndex];
  // @ts-ignore - Vite provides this at build time
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
  const imageUrl = currentReceipt.receiptUrl 
    ? `${apiBaseUrl}${currentReceipt.receiptUrl.startsWith('/') ? '' : '/'}${currentReceipt.receiptUrl}`
    : '';

  const handleThumbnailClick = (index: number) => {
    setCurrentIndex(index);
  };

  // Detail item component for expense fields
  const DetailItem: React.FC<{ icon: React.ReactNode; label: string; value: string | number; bgColor: string; iconColor: string }> = ({ icon, label, value, bgColor, iconColor }) => (
    <div className="flex items-start space-x-3">
      <div className={`w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
        <div className={iconColor}>{icon}</div>
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="font-semibold text-gray-900 text-lg">
          {value}
        </p>
      </div>
    </div>
  );

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="fixed top-4 right-4 p-2 bg-white rounded-full hover:bg-gray-100 transition-colors z-10"
        title="Close (Esc)"
      >
        <X className="w-6 h-6 text-gray-900" />
      </button>

      {/* Main Content */}
      <div 
        className="max-w-7xl w-full my-8 bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Expense Details</h2>
            <div className="text-white text-sm font-medium">
              Receipt {currentIndex + 1} of {receipts.length}
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="p-6 space-y-6 max-h-[calc(90vh-120px)] overflow-y-auto">
          {/* Expense Details Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Expense Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailItem
                icon={<Calendar className="w-5 h-5" />}
                label="Date"
                value={formatLocalDate(currentReceipt.date)}
                bgColor="bg-blue-100"
                iconColor="text-blue-600"
              />
              <DetailItem
                icon={<DollarSign className="w-5 h-5" />}
                label="Amount"
                value={`$${currentReceipt.amount.toFixed(2)}`}
                bgColor="bg-emerald-100"
                iconColor="text-emerald-600"
              />
              <DetailItem
                icon={<FileText className="w-5 h-5" />}
                label="Category"
                value={currentReceipt.category}
                bgColor="bg-purple-100"
                iconColor="text-purple-600"
              />
              <DetailItem
                icon={<Receipt className="w-5 h-5" />}
                label="Merchant"
                value={currentReceipt.merchant}
                bgColor="bg-orange-100"
                iconColor="text-orange-600"
              />
              <DetailItem
                icon={<CreditCard className="w-5 h-5" />}
                label="Card Used"
                value={currentReceipt.cardUsed || 'N/A'}
                bgColor="bg-indigo-100"
                iconColor="text-indigo-600"
              />
              {currentReceipt.location && (
                <DetailItem
                  icon={<MapPin className="w-5 h-5" />}
                  label="Location"
                  value={currentReceipt.location}
                  bgColor="bg-red-100"
                  iconColor="text-red-600"
                />
              )}
              {currentReceipt.user_name && (
                <DetailItem
                  icon={<User className="w-5 h-5" />}
                  label="Submitted By"
                  value={currentReceipt.user_name}
                  bgColor="bg-teal-100"
                  iconColor="text-teal-600"
                />
              )}
            </div>

            {/* Description */}
            {currentReceipt.description && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-2">Description</p>
                <p className="text-gray-900">{currentReceipt.description}</p>
              </div>
            )}

            {/* Status and Additional Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Status */}
              <div>
                <p className="text-sm text-gray-500 mb-2">Status</p>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(currentReceipt.status)}`}>
                  {currentReceipt.status === 'needs further review'
                    ? 'Needs Further Review'
                    : currentReceipt.status.charAt(0).toUpperCase() + currentReceipt.status.slice(1)}
                </span>
              </div>

              {/* Reimbursement Status */}
              {currentReceipt.reimbursementRequired && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Reimbursement</p>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${getReimbursementStatusColor(currentReceipt.reimbursementStatus || 'pending review')}`}>
                    {formatReimbursementStatus(currentReceipt.reimbursementStatus || 'pending review')}
                  </span>
                </div>
              )}

              {/* Entity */}
              {currentReceipt.zohoEntity && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Entity</p>
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-gray-600" />
                    <span className="text-gray-900 font-medium">{currentReceipt.zohoEntity}</span>
                  </div>
                </div>
              )}

              {/* Zoho Status */}
              {currentReceipt.zohoExpenseId && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Zoho Status</p>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-gray-900 font-medium">Synced to Zoho</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Receipt Image Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Receipt Image</h3>
            
            <div className="relative bg-gray-900 rounded-lg overflow-hidden min-h-[400px] flex items-center justify-center">
              {/* Previous Button */}
              {receipts.length > 1 && (
                <button
                  onClick={handlePrevious}
                  className="absolute left-4 p-3 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full transition-all z-10"
                  title="Previous (←)"
                >
                  <ChevronLeft className="w-8 h-8 text-white" />
                </button>
              )}

              {/* Current Image */}
              <div className="flex-1 flex items-center justify-center p-4">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`Receipt ${currentIndex + 1}`}
                    className="max-w-full max-h-[600px] w-auto h-auto rounded-lg shadow-2xl object-contain"
                  />
                ) : (
                  <div className="text-white text-center">
                    <p className="text-lg">No receipt image available</p>
                  </div>
                )}
              </div>

              {/* Next Button */}
              {receipts.length > 1 && (
                <button
                  onClick={handleNext}
                  className="absolute right-4 p-3 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full transition-all z-10"
                  title="Next (→)"
                >
                  <ChevronRight className="w-8 h-8 text-white" />
                </button>
              )}
            </div>

            {/* Thumbnail Navigation */}
            {receipts.length > 1 && (
              <div className="flex justify-center gap-2 overflow-x-auto pb-2">
                {receipts.map((receipt, index) => {
                  // @ts-ignore - Vite provides this at build time
                  const thumbApiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
                  const thumbUrl = receipt.receiptUrl 
                    ? `${thumbApiBaseUrl}${receipt.receiptUrl.startsWith('/') ? '' : '/'}${receipt.receiptUrl}`
                    : '';
                  
                  return (
                    <button
                      key={receipt.id}
                      onClick={() => handleThumbnailClick(index)}
                      className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        index === currentIndex
                          ? 'border-purple-600 scale-110'
                          : 'border-gray-300 opacity-60 hover:opacity-100'
                      }`}
                      title={`View receipt ${index + 1}`}
                    >
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-600 text-xs">{index + 1}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

