import React, { useState, useRef } from 'react';
import { Upload, X, FileImage, Scan, Receipt, DollarSign } from 'lucide-react';
import { api } from '../../utils/api';
import { User, TradeShow } from '../../App';
import { AppError } from '../../types/types';
import { isAcceptableReceiptFile } from '../../utils/fileValidation';
import { getZohoExpenseDescriptionValidationMessage } from '../../utils/zohoExpenseDescription';

interface ChecklistReceiptUploadProps {
  user: User;
  event: TradeShow;
  section: 'booth' | 'electricity' | 'flight' | 'hotel' | 'car_rental' | 'booth_shipping';
  attendeeName?: string; // For flights and hotels
  onClose: () => void;
  onExpenseCreated: () => void;
}

const SECTION_CATEGORIES = {
  booth: 'Booth / Marketing / Tools',
  electricity: 'Booth / Marketing / Tools',
  flight: 'Travel - Flight',
  hotel: 'Accommodation - Hotel',
  car_rental: 'Rental - Car / U-haul',
  booth_shipping: 'Shipping Charges'
};

export const ChecklistReceiptUpload: React.FC<ChecklistReceiptUploadProps> = ({
  user,
  event,
  section,
  attendeeName,
  onClose,
  onExpenseCreated
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [_ocrData, setOcrData] = useState<any>(null); // Reserved for future use (e.g., OCR correction tracking)
  const [cardOptions, setCardOptions] = useState<Array<{name: string; lastFour: string; entity?: string | null}>>([]);
  const [formData, setFormData] = useState({
    merchant: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: attendeeName 
      ? `${attendeeName} - ${section}` 
      : section === 'electricity' 
        ? 'Electricity' 
        : section === 'booth' 
          ? 'Booth' 
          : section === 'booth_shipping'
            ? 'Booth Shipping'
            : section.replace(/_/g, ' '),
    cardUsed: '',
    zohoEntity: '',
    receiptUrl: '' // Store receipt URL from OCR
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load card options
  React.useEffect(() => {
    (async () => {
      if (api.USE_SERVER) {
        try {
          const settings = await api.getSettings() as { cardOptions?: Array<{name: string; lastFour: string; entity?: string | null}> };
          setCardOptions(settings.cardOptions || []);
        } catch (error) {
          console.error('[ChecklistReceiptUpload] Failed to load card options:', error);
          setCardOptions([]);
        }
      }
    })();
  }, []);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setProcessing(true);

    try {
      // Process with OCR - backend expects 'receipt' as field name
      const ocrFormData = new FormData();
      ocrFormData.append('receipt', file);

      const ocrResponse = await api.processReceiptWithOCR(ocrFormData);
      console.log('[ChecklistReceiptUpload] OCR response:', ocrResponse);

      setOcrData(ocrResponse);
      
      // Pre-fill form with OCR data - response structure is result.fields
      const fields = ocrResponse.fields || {};
      const ocrCardLastFour = fields.cardLastFour?.value;
      const matchedCard = ocrCardLastFour 
        ? cardOptions.find(card => card.lastFour === ocrCardLastFour)
        : null;

      setFormData(prev => ({
        ...prev,
        merchant: fields.merchant?.value || prev.merchant,
        amount: fields.amount?.value?.toString() || prev.amount,
        date: fields.date?.value || prev.date,
        cardUsed: matchedCard ? `${matchedCard.name} (...${matchedCard.lastFour})` : prev.cardUsed,
        zohoEntity: matchedCard?.entity || prev.zohoEntity,
        receiptUrl: ocrResponse.receiptUrl || prev.receiptUrl // Store receipt URL from OCR
      }));
    } catch (error) {
      console.error('[ChecklistReceiptUpload] OCR failed:', error);
      alert('OCR processing failed. You can still enter expense details manually.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !formData.merchant || !formData.amount) {
      alert('Please provide at least merchant and amount');
      return;
    }

    setProcessing(true);

    try {
      const zohoErr = getZohoExpenseDescriptionValidationMessage({
        description: formData.description,
        userName: user.name,
        eventName: event.name,
        eventStartDate: event.startDate,
        eventEndDate: event.endDate,
        reimbursementRequired: false,
      });
      if (zohoErr) {
        alert(zohoErr);
        return;
      }

      // Create expense with receipt URL (no file re-upload needed)
      // The receipt was already uploaded during OCR processing
      const expensePayload: {
        event_id: string;
        category: string;
        merchant: string;
        amount: number;
        date: string;
        description: string;
        card_used: string;
        reimbursement_required: boolean;
        zoho_entity?: string;
        receipt_url?: string;
      } = {
        event_id: event.id,
        category: SECTION_CATEGORIES[section],
        merchant: formData.merchant,
        amount: parseFloat(formData.amount),
        date: formData.date,
        description: formData.description,
        card_used: formData.cardUsed,
        reimbursement_required: false,
        zoho_entity: formData.zohoEntity || undefined
      };

      // Add receipt URL if we got it from OCR (no re-upload needed!)
      if (formData.receiptUrl) {
        expensePayload.receipt_url = formData.receiptUrl;
      }

      console.log('[ChecklistReceiptUpload] Creating expense with receipt URL:', expensePayload);

      // Create expense WITHOUT file (receipt URL is already provided)
      await api.createExpense(expensePayload);

      console.log('[ChecklistReceiptUpload] Expense created successfully with receipt');
      
      // Show success notification
      alert('✅ Receipt saved successfully!');
      
      onExpenseCreated();
      onClose();
    } catch (error) {
      const appError = error as AppError & { response?: { data?: { error?: string } } };
      console.error('[ChecklistReceiptUpload] Error creating expense:', appError);
      const errorMessage = appError.response?.data?.error || appError.message || 'Failed to create expense. Please try again.';
      
      // Show error notification
      alert(`❌ Failed to save receipt:\n${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Receipt className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Upload Receipt</h3>
              <p className="text-sm text-gray-500">
                {section.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - {event.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* File Upload */}
          {!selectedFile ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-2">Drop receipt here or click to upload (images or PDF, max 10MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif,application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!isAcceptableReceiptFile(file)) {
                    alert('Please upload an image (JPG, PNG, HEIC, WebP) or PDF file.');
                    return;
                  }
                  if (file.size > 10 * 1024 * 1024) {
                    alert('File size must be less than 10MB');
                    return;
                  }
                  handleFileSelect(file);
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Choose File
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Preview */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <FileImage className="w-5 h-5 text-blue-600" />
                <span className="text-sm text-gray-700 flex-1">{selectedFile.name}</span>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setOcrData(null);
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {processing && (
                <div className="flex items-center gap-2 text-blue-600">
                  <Scan className="w-5 h-5 animate-pulse" />
                  <span className="text-sm">Processing receipt with OCR...</span>
                </div>
              )}

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Merchant *
                  </label>
                  <input
                    type="text"
                    value={formData.merchant}
                    onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Expo Services, Airline, Hotel Name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount *
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Card Used
                  </label>
                  <select
                    value={formData.cardUsed}
                    onChange={(e) => {
                      const cardValue = e.target.value;
                      const selectedCardOption = cardOptions.find(card => `${card.name} (...${card.lastFour})` === cardValue);
                      setFormData({ 
                        ...formData, 
                        cardUsed: cardValue,
                        zohoEntity: selectedCardOption?.entity || ''
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select card...</option>
                    {cardOptions.map((card, idx) => (
                      <option key={idx} value={`${card.name} (...${card.lastFour})`}>
                        {card.name} (...{card.lastFour})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={2}
                    placeholder={`Expense for ${section.replace(/_/g, ' ')}`}
                  />
                </div>
              </div>

              {/* Auto-categorized Notice */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900">
                  <strong>Category:</strong> {SECTION_CATEGORIES[section]}
                  <br />
                  <span className="text-xs text-blue-700">Auto-assigned based on checklist section</span>
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={processing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={processing || !formData.merchant || !formData.amount}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Creating...' : 'Create Expense'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

