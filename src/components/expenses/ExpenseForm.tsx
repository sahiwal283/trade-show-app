import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save, X, Building2, Upload, Camera, AlertCircle, Loader2, Plus, Clock } from 'lucide-react';
import { Expense, TradeShow, User } from '../../App';
import { api } from '../../utils/api';
import { formatForDateInput, getTodayLocalDateString } from '../../utils/dateUtils';
import { filterActiveEvents, filterEventsByParticipation } from '../../utils/eventUtils';
import { isAcceptableReceiptFile, PDF_PLACEHOLDER_IMAGE } from '../../utils/fileValidation';
import {
  buildZohoExpenseDescription,
  getZohoExpenseDescriptionValidationMessage,
  ZOHO_EXPENSE_DESCRIPTION_MAX_LENGTH,
} from '../../utils/zohoExpenseDescription';

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

  // Quick create event state
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickEventName, setQuickEventName] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [createEventError, setCreateEventError] = useState('');
  const [localEvents, setLocalEvents] = useState<TradeShow[]>([]);
  const [showPastEvents, setShowPastEvents] = useState(false);

  const canCreateEvents = ['admin', 'coordinator', 'developer'].includes(user.role);

  // Merge filtered events with locally created events
  const allActiveEvents = useMemo(() => {
    const merged = [...activeEvents, ...localEvents];
    // Deduplicate by id
    const seen = new Set<string>();
    return merged.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [activeEvents, localEvents]);

  // Past events = all events user can access minus active ones
  const pastEvents = useMemo(() => {
    const activeIds = new Set(allActiveEvents.map(e => e.id));
    const allUserEvents = filterEventsByParticipation(events, user);
    return allUserEvents.filter(e => !activeIds.has(e.id));
  }, [events, allActiveEvents, user]);

  const selectedEventForZoho = useMemo(() => {
    const id = formData.tradeShowId;
    if (!id) return undefined;
    return [...allActiveEvents, ...pastEvents].find((e) => e.id === id);
  }, [formData.tradeShowId, allActiveEvents, pastEvents]);

  const zohoDescriptionValidationError = useMemo(() => {
    return getZohoExpenseDescriptionValidationMessage({
      description: formData.description,
      userName: user.name,
      eventName: selectedEventForZoho?.name,
      eventStartDate: selectedEventForZoho?.startDate,
      eventEndDate: selectedEventForZoho?.endDate,
      reimbursementRequired: formData.reimbursementRequired,
    });
  }, [
    formData.description,
    formData.reimbursementRequired,
    formData.tradeShowId,
    user.name,
    selectedEventForZoho,
  ]);

  const zohoComposedPreview = useMemo(
    () =>
      buildZohoExpenseDescription({
        description: formData.description,
        userName: user.name,
        eventName: selectedEventForZoho?.name,
        eventStartDate: selectedEventForZoho?.startDate,
        eventEndDate: selectedEventForZoho?.endDate,
        reimbursementRequired: formData.reimbursementRequired,
      }),
    [
      formData.description,
      formData.reimbursementRequired,
      user.name,
      selectedEventForZoho,
    ]
  );

  const handleQuickCreateEvent = async () => {
    if (!quickEventName.trim()) return;
    
    setCreatingEvent(true);
    setCreateEventError('');
    
    try {
      const today = getTodayLocalDateString();
      const newEvent = await api.createEvent({
        name: quickEventName.trim(),
        venue: 'TBD',
        city: 'TBD',
        state: 'TBD',
        start_date: today,
        end_date: today,
        show_start_date: today,
        show_end_date: today,
        travel_start_date: today,
        travel_end_date: today,
      });
      
      setLocalEvents(prev => [...prev, newEvent]);
      setFormData({ ...formData, tradeShowId: newEvent.id });
      setQuickEventName('');
      setShowQuickCreate(false);
    } catch (error: any) {
      console.error('[QuickCreate] Failed to create event:', error);
      setCreateEventError(error?.message || 'Failed to create event');
    } finally {
      setCreatingEvent(false);
    }
  };

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
    if (zohoDescriptionValidationError) {
      return;
    }
    onSave(formData, receiptFile || undefined);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setReceiptFile(file);
    setIsProcessingOCR(true);

    // Create preview URL (use placeholder for PDF since img cannot display application/pdf)
    const previewUrl = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
      ? PDF_PLACEHOLDER_IMAGE
      : URL.createObjectURL(file);
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
      <div className="card p-4 sm:p-5 md:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6 lg:mb-8">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <button
              onClick={onCancel}
              className="btn-ghost tap-target p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                Expenses
              </p>
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-stone-900">
                {expense ? 'Edit Expense' : 'Add New Expense'}
              </h1>
              <p className="mt-0.5 text-sm text-stone-500">Upload receipt for automatic OCR data extraction, or enter manually</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="btn-ghost tap-target p-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Receipt Upload - First Field */}
          <div className="rounded-card border border-brand-200/70 bg-brand-50/50 p-4 sm:p-5 md:p-6">
            <label className="field-label mb-3 text-stone-900">
              Receipt Image {expense ? <span className="text-stone-600">(Optional - Upload to replace)</span> : <span className="text-red-600">* (Upload First - Required)</span>}
            </label>
            <div className="space-y-4">
              <div className="flex items-center justify-center w-full">
                <label className="flex h-40 sm:h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-brand-300/80 bg-white transition-colors duration-150 hover:border-brand-400 hover:bg-brand-50/60 active:bg-brand-50">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Camera className="w-9 h-9 mb-2 text-brand-500 sm:hidden" />
                    <Upload className="hidden sm:block w-8 h-8 mb-2 text-brand-500" />
                    <p className="mb-2 text-sm text-stone-700">
                      <span className="font-semibold text-brand-700 sm:hidden">Tap to snap or upload receipt</span>
                      <span className="hidden sm:inline font-semibold text-brand-700">Click to upload receipt</span>
                    </p>
                    <p className="text-xs text-stone-500 sm:hidden">Opens your camera or photo library</p>
                    <p className="hidden sm:block text-xs text-stone-500">PNG, JPG, PDF up to 10MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif,application/pdf,.pdf"
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
                      className="w-full h-48 object-cover rounded-lg ring-1 ring-stone-200 transition-shadow duration-200 group-hover:shadow-elevation-3"
                    />
                    {!isProcessingOCR && (
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-lg transition-all flex items-center justify-center">
                        <div className="bg-white bg-opacity-90 px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-sm font-medium text-stone-900">Click to view full size</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {isProcessingOCR && (
                    <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center rounded-lg">
                      <div className="text-center">
                        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-sm text-stone-700 font-medium">Processing receipt...</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* OCR Results */}
              {ocrResults && (
                <div className="rounded-lg bg-accent-50 p-4 ring-1 ring-inset ring-accent-200/70">
                  <div className="flex items-center mb-1.5">
                    <AlertCircle className="w-5 h-5 text-accent-600 mr-2" />
                    <h4 className="text-sm font-semibold text-accent-800">Receipt Processed Successfully</h4>
                  </div>
                  <p className="text-sm text-accent-700">
                    Form fields below have been auto-filled with extracted data. Please review and adjust if needed.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-stone-100 pt-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-4">
              Expense Details
            </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div>
              <label className="field-label">
                Trade Show Event *
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={formData.tradeShowId}
                  onChange={(e) => setFormData({ ...formData, tradeShowId: e.target.value })}
                  className="input-field flex-1 min-h-[44px]"
                  required
                >
                  <option value="">Select an event</option>
                  {allActiveEvents.map(event => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                  {showPastEvents && pastEvents.length > 0 && (
                    <optgroup label="── Past Events ──">
                      {pastEvents.map(event => (
                        <option key={event.id} value={event.id}>{event.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {canCreateEvents && (
                  <button
                    type="button"
                    onClick={() => setShowQuickCreate(!showQuickCreate)}
                    className="inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded-lg bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-200/70 transition-colors duration-150 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:py-3"
                    title="Quick create a new event"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">New</span>
                  </button>
                )}
              </div>
              {showQuickCreate && (
                <div className="mt-2 rounded-lg border border-brand-200/70 bg-brand-50/60 p-3">
                  <label className="block text-xs font-semibold text-brand-800 mb-1">
                    Event Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={quickEventName}
                      onChange={(e) => setQuickEventName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleQuickCreateEvent())}
                      className="input-field flex-1 py-2.5 sm:py-2"
                      placeholder="e.g., CES 2026"
                      autoFocus
                      disabled={creatingEvent}
                    />
                    <button
                      type="button"
                      onClick={handleQuickCreateEvent}
                      disabled={!quickEventName.trim() || creatingEvent}
                      className="btn-primary px-3 py-2 text-xs shrink-0"
                    >
                      {creatingEvent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Create
                    </button>
                  </div>
                  {createEventError && (
                    <p className="mt-1 text-xs text-red-600">{createEventError}</p>
                  )}
                  <p className="mt-1 text-xs text-brand-600">You can add venue, dates, and other details later in Events.</p>
                </div>
              )}
              {pastEvents.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPastEvents(!showPastEvents)}
                  className="mt-1 flex min-h-[44px] items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition-colors lg:min-h-0"
                >
                  <Clock className="w-3 h-3" />
                  {showPastEvents ? 'Hide past events' : `Show ${pastEvents.length} past event${pastEvents.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>

            <div>
              <label className="field-label">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="input-field min-h-[44px]"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="field-label">
                Merchant *
              </label>
              <input
                type="text"
                value={formData.merchant}
                onChange={(e) => handleMerchantChange(e.target.value)}
                className="input-field min-h-[44px]"
                placeholder="e.g., Delta Airlines, Marriott Hotel"
                required
              />
            </div>

            <div>
              <label className="field-label">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input-field min-h-[44px]"
                required
              >
                <option value="">Select category</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">
                Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="input-field min-h-[44px]"
                required
              />
            </div>

            <div>
              <label className="field-label">
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
                className="input-field min-h-[44px]"
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
              <p className="text-xs text-stone-500 mt-2 italic">
                Note: Last 4 digits may differ when using Apple Pay.
              </p>
            </div>
          </div>
          </div>

          <div className="border-t border-stone-100 pt-6">
            <label className="field-label">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className={`input-field min-h-[44px] ${
                zohoDescriptionValidationError
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
                  : ''
              }`}
              placeholder="Additional details about this expense..."
            />
            <p className="text-xs text-stone-500 mt-1">
              Zoho Books combined text: {zohoComposedPreview.length}/{ZOHO_EXPENSE_DESCRIPTION_MAX_LENGTH} characters
              (includes your name, event, dates, and reimbursement flag).
            </p>
            {zohoDescriptionValidationError && (
              <p className="text-sm text-red-700 mt-2">{zohoDescriptionValidationError}</p>
            )}
          </div>

          {/* OCR Text Display */}
          {formData.ocrText && (
            <div>
              <label className="field-label">
                OCR Extracted Text
              </label>
              <textarea
                value={formData.ocrText}
                readOnly
                rows={4}
                className="input-field min-h-[44px] bg-stone-50 text-stone-600"
                placeholder="OCR text will appear here after receipt processing..."
              />
            </div>
          )}

          {/* Sticky on phones/tablets so Save stays reachable while the form scrolls; lg: restores the original static bar */}
          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-stone-200 bg-white/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:static lg:z-auto lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-6 lg:pb-0 lg:backdrop-blur-none">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary flex-1 px-6 py-3 sm:flex-initial"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !!zohoDescriptionValidationError}
              className="btn-primary flex-1 px-8 py-3 sm:flex-initial"
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
            className="tap-target absolute top-[max(1rem,env(safe-area-inset-top))] right-4 p-2 bg-white rounded-full hover:bg-stone-100 transition-colors z-10"
            title="Close"
          >
            <X className="w-6 h-6 text-stone-900" />
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