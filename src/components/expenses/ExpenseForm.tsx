import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, X, Building2, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { Expense, TradeShow, User } from '../../App';
import { api } from '../../utils/api';
import { formatForDateInput, getTodayLocalDateString } from '../../utils/dateUtils';
import { filterActiveEvents, filterEventsByParticipation } from '../../utils/eventUtils';

interface ExpenseFormProps {
  expense?: Expense | null;
  events: TradeShow[];
  user: User;
  onSave: (expense: Omit<Expense, 'id'>, file?: File) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

interface CardOption {
  name: string;
  lastFour: string;
  entity?: string | null;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ expense, events, user, onSave, onCancel, isSaving = false }) => {
  // Filter events to only show those within 1 month + 1 day of their end date
  // AND where the user is a participant (or admin/accountant/developer)
  const activeEvents = useMemo(() => {
    const timeFiltered = filterActiveEvents(events);
    return filterEventsByParticipation(timeFiltered, user);
  }, [events, user]);
  
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
  const [entityOptions, setEntityOptions] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([
    'Booth / Marketing / Tools',
    'Travel - Flight',
    'Accommodation - Hotel',
    'Transportation - Uber / Lyft / Others',
    'Parking Fees',
    'Rental - Car / U-haul',
    'Meal and Entertainment',
    'Gas / Fuel',
    'Show Allowances - Per Diem',
    'Model',
    'Shipping Charges',
    'Other'
  ]);

  const [formData, setFormData] = useState({
    tradeShowId: expense?.tradeShowId || '',
    amount: expense?.amount || 0,
    category: expense?.category || '',
    merchant: expense?.merchant || '',
    date: expense?.date ? formatForDateInput(expense.date) : getTodayLocalDateString(),
    description: expense?.description || '',
    cardUsed: expense?.cardUsed || '',
    reimbursementRequired: expense?.reimbursementRequired || false,
    reimbursementStatus: expense?.reimbursementStatus || 'pending review',
    status: expense?.status || 'pending' as const,
    zohoEntity: expense?.zohoEntity || '',
    location: expense?.location || '',
    ocrText: expense?.ocrText || '',
    receiptUrl: expense?.receiptUrl ? expense.receiptUrl.replace(/^\/uploads/, '/api/uploads') : ''
  });

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrResults, setOcrResults] = useState<any>(null);
  const [showFullReceipt, setShowFullReceipt] = useState(false);

  useEffect(() => {
    (async () => {
      if (api.USE_SERVER) {
        try {
          const settings = await api.getSettings();
          // Handle both old string format and new object format for backward compatibility
          const cards = settings.cardOptions || [];
          if (cards.length > 0 && typeof cards[0] === 'string') {
            // Convert old string format to new object format
            setCardOptions(cards.map((card: string) => ({ name: card, lastFour: '0000' })));
          } else {
            setCardOptions(cards);
          }
          setEntityOptions(settings.entityOptions || []);
          // Handle both old format (string[]) and new format (CategoryOption[])
          const cats = settings.categoryOptions || categories;
          setCategories(cats.map((cat: any) => typeof cat === 'string' ? cat : cat.name));
        } catch {
          setCardOptions([]);
          setEntityOptions([]);
        }
      } else {
        const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
        const cards = settings.cardOptions || [
          { name: 'Corporate Amex', lastFour: '0000' },
          { name: 'Corporate Visa', lastFour: '0000' },
          { name: 'Personal Card (Reimbursement)', lastFour: '0000' },
          { name: 'Company Debit', lastFour: '0000' },
          { name: 'Cash', lastFour: '0000' }
        ];
        // Handle backward compatibility
        if (cards.length > 0 && typeof cards[0] === 'string') {
          setCardOptions(cards.map((card: string) => ({ name: card, lastFour: '0000' })));
        } else {
          setCardOptions(cards);
        }
        setEntityOptions(settings.entityOptions || ['Entity A - Main Operations','Entity B - Sales Division','Entity C - Marketing Department','Entity D - International Operations']);
        // Handle both old format (string[]) and new format (CategoryOption[])
        const cats = settings.categoryOptions || categories;
        setCategories(cats.map((cat: any) => typeof cat === 'string' ? cat : cat.name));
      }
    })();
  }, []);
  // Listen for OCR data from receipt upload
  useEffect(() => {
    const handlePopulateForm = (event: CustomEvent) => {
      const ocrData = event.detail;
      setFormData({
        ...formData,
        amount: ocrData.amount || 0,
        category: ocrData.category || '',
        merchant: ocrData.merchant || '',
        date: ocrData.date || getTodayLocalDateString(),
        description: ocrData.description || '',
        cardUsed: ocrData.cardUsed || '',
        reimbursementRequired: ocrData.reimbursementRequired || false,
        location: ocrData.location || ''
      });
    };

    window.addEventListener('populateExpenseForm', handlePopulateForm as EventListener);
    return () => {
      window.removeEventListener('populateExpenseForm', handlePopulateForm as EventListener);
    };
  }, [formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    
    onSave(formData, receiptFile || undefined);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG, etc.)');
      return;
    }

    setReceiptFile(file);
    setIsProcessingOCR(true);

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setFormData({ ...formData, receiptUrl: previewUrl });

    // Simulate OCR processing with improved extraction logic
    try {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing time
      
      // Enhanced OCR simulation based on image filename patterns
      const filename = file.name.toLowerCase();
      let merchant = 'Unknown Merchant';
      let category = 'Other';
      let amount = (Math.random() * 200 + 10).toFixed(2);
      let location = 'Unknown Location';
      
      // Detect merchant from filename or use contextual detection
      if (filename.includes('hertz') || filename.includes('rental') || filename.includes('car')) {
        merchant = 'Hertz Car Rental';
        category = 'Transportation';
        // Typical car rental: $180-280 for 3-4 days
        amount = (Math.random() * 100 + 180).toFixed(2);
        location = 'Indianapolis, IN';
      } else if (filename.includes('flight') || filename.includes('airline') || filename.includes('delta') || filename.includes('united')) {
        merchant = 'Delta Airlines';
        category = 'Flights';
        // Typical domestic flight: $250-500
        amount = (Math.random() * 250 + 250).toFixed(2);
        location = 'Atlanta, GA';
      } else if (filename.includes('hotel') || filename.includes('marriott') || filename.includes('hilton')) {
        merchant = 'Marriott Hotel';
        category = 'Hotels';
        // Typical hotel: $150-300 per night
        amount = (Math.random() * 150 + 150).toFixed(2);
        location = 'Las Vegas, NV';
      } else if (filename.includes('restaurant') || filename.includes('food') || filename.includes('meal')) {
        merchant = 'Restaurant';
        category = 'Meals';
        // Typical meal: $30-80
        amount = (Math.random() * 50 + 30).toFixed(2);
        location = 'New York, NY';
      } else if (filename.includes('uber') || filename.includes('lyft') || filename.includes('taxi')) {
        merchant = 'Uber';
        category = 'Transportation';
        // Typical ride: $15-45
        amount = (Math.random() * 30 + 15).toFixed(2);
        location = 'Chicago, IL';
      } else {
        // Default to contextual business expense
        const merchants = ['Office Supplies Plus', 'Tech Conference', 'Business Center', 'Trade Show Services'];
        merchant = merchants[Math.floor(Math.random() * merchants.length)];
        category = 'Supplies';
        amount = (Math.random() * 100 + 50).toFixed(2);
      }
      
      // Use more accurate date formatting (MM/DD/YYYY)
      const today = new Date();
      const formattedDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
      
      const mockOcrText = `
        RECEIPT
        Merchant: ${merchant}
        Date: ${formattedDate}
        Total Amount: $${amount}
        Location: ${location}
        Thank you for your business!
      `;

      const extractedData = {
        merchant: mockOcrText.match(/Merchant: (.+)/)?.[1] || '',
        amount: parseFloat(mockOcrText.match(/Total Amount: \$(.+)/)?.[1] || amount),
        date: mockOcrText.match(/Date: (.+)/)?.[1] || formattedDate,
        location: mockOcrText.match(/Location: (.+)/)?.[1] || '',
        ocrText: mockOcrText.trim()
      };

      setOcrResults(extractedData);
      
      // Auto-populate form with OCR data, preserving existing values (especially event and card)
      setFormData(prev => ({
        ...prev,
        merchant: prev.merchant || extractedData.merchant,
        amount: prev.amount || extractedData.amount,
        date: prev.date || extractedData.date,
        ocrText: extractedData.ocrText,
        category: prev.category || category,
        // FIXED: Preserve tradeShowId and cardUsed when re-uploading receipt
        tradeShowId: prev.tradeShowId, // Keep existing event selection
        cardUsed: prev.cardUsed // Keep existing card selection
      }));

    } catch (error) {
      console.error('OCR processing failed:', error);
      alert('Failed to process receipt. Please try again.');
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // Auto-flag reimbursement when personal card is selected
  useEffect(() => {
    if (formData.cardUsed && formData.cardUsed.toLowerCase().includes('personal')) {
      setFormData(prev => ({ ...prev, reimbursementRequired: true }));
    }
  }, [formData.cardUsed]);

  const suggestCategory = (merchant: string) => {
    const merchantLower = merchant.toLowerCase();
    if (merchantLower.includes('airline') || merchantLower.includes('airport') || merchantLower.includes('flight')) {
      return 'Flights';
    }
    if (merchantLower.includes('hotel') || merchantLower.includes('inn') || merchantLower.includes('resort')) {
      return 'Hotels';
    }
    if (merchantLower.includes('restaurant') || merchantLower.includes('cafe') || merchantLower.includes('food')) {
      return 'Meals';
    }
    if (merchantLower.includes('uber') || merchantLower.includes('taxi') || merchantLower.includes('transport')) {
      return 'Transportation';
    }
    return 'Other';
  };

  const handleMerchantChange = (merchant: string) => {
    setFormData({
      ...formData,
      merchant,
      category: formData.category || suggestCategory(merchant)
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={onCancel}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {expense ? 'Edit Expense' : 'Add New Expense'}
              </h1>
              <p className="text-gray-600">Upload receipt for automatic OCR data extraction, or enter manually</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Receipt Upload - First Field */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 sm:p-5 md:p-6">
            <label className="block text-sm font-medium text-gray-900 mb-3">
              Receipt Image {expense ? <span className="text-gray-600">(Optional - Upload to replace)</span> : <span className="text-red-600">* (Upload First - Required)</span>}
            </label>
            <div className="space-y-4">
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-gray-50">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-2 text-blue-500" />
                    <p className="mb-2 text-sm text-gray-700">
                      <span className="font-semibold">Click to upload receipt</span>
                    </p>
                    <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptUpload}
                    className="hidden"
                    
                  />
                </label>
              </div>

              {/* Receipt Preview */}
              {formData.receiptUrl && (
                <div className="relative">
                  <div 
                    onClick={() => !isProcessingOCR && setShowFullReceipt(true)}
                    className="cursor-pointer group relative mx-auto max-w-md"
                  >
                    <img
                      src={formData.receiptUrl}
                      alt="Receipt preview"
                      className="w-full h-48 object-cover rounded-lg border group-hover:shadow-xl transition-shadow"
                    />
                    {!isProcessingOCR && (
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-lg transition-all flex items-center justify-center">
                        <div className="bg-white bg-opacity-90 px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-sm font-medium text-gray-900">Click to view full size</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {isProcessingOCR && (
                    <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center rounded-lg">
                      <div className="text-center">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-sm text-gray-700 font-medium">Processing receipt...</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* OCR Results */}
              {ocrResults && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <AlertCircle className="w-5 h-5 text-green-600 mr-2" />
                    <h4 className="text-sm font-semibold text-green-800">Receipt Processed Successfully</h4>
                  </div>
                  <p className="text-sm text-green-700">
                    Form fields below have been auto-filled with extracted data. Please review and adjust if needed.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trade Show Event *
              </label>
              <select
                value={formData.tradeShowId}
                onChange={(e) => setFormData({ ...formData, tradeShowId: e.target.value })}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border min-h-[44px] border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select an event</option>
                {activeEvents.map(event => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border min-h-[44px] border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Merchant *
              </label>
              <input
                type="text"
                value={formData.merchant}
                onChange={(e) => handleMerchantChange(e.target.value)}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border min-h-[44px] border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Delta Airlines, Marriott Hotel"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border min-h-[44px] border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select category</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border min-h-[44px] border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Card Used *
              </label>
              <select
                value={formData.cardUsed}
                onChange={(e) => {
                  const cardValue = e.target.value;
                  // Find the selected card and auto-select its entity
                  const selectedCard = cardOptions.find(card => `${card.name} | ${card.lastFour}` === cardValue);
                  setFormData({ 
                    ...formData, 
                    cardUsed: cardValue,
                    // Auto-select entity if card has one, otherwise clear it (for personal cards)
                    zohoEntity: selectedCard?.entity || ''
                  });
                }}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border min-h-[44px] border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select card used</option>
                {cardOptions.map((card, index) => {
                  const cardValue = `${card.name} | ${card.lastFour}`;
                  return (
                    <option key={index} value={cardValue}>{cardValue}</option>
                  );
                })}
              </select>
              <p className="text-xs text-gray-500 mt-2 italic">
                Note: Last 4 digits may differ when using Apple Pay.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border min-h-[44px] border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Additional details about this expense..."
            />
          </div>

          {/* OCR Text Display */}
          {formData.ocrText && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                OCR Extracted Text
              </label>
              <textarea
                value={formData.ocrText}
                readOnly
                rows={4}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border min-h-[44px] border-gray-300 rounded-lg bg-gray-50 text-sm"
                placeholder="OCR text will appear here after receipt processing..."
              />
            </div>
          )}

          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-gradient-to-r from-blue-500 to-emerald-500 text-white px-8 py-3 rounded-lg font-medium hover:from-blue-600 hover:to-emerald-600 transition-all duration-200 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>{expense ? 'Update Expense' : 'Save Expense'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Full Receipt Modal */}
      {showFullReceipt && formData.receiptUrl && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowFullReceipt(false)}
        >
          <button
            onClick={() => setShowFullReceipt(false)}
            className="absolute top-4 right-4 p-2 bg-white rounded-full hover:bg-gray-100 transition-colors z-10"
            title="Close"
          >
            <X className="w-6 h-6 text-gray-900" />
          </button>
          <div className="max-w-5xl max-h-[90vh] overflow-auto">
            <img
              src={formData.receiptUrl}
              alt="Receipt full size"
              className="w-auto h-auto max-w-full max-h-[90vh] rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};