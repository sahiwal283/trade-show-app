import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CheckCircle, PenLine } from 'lucide-react';
import { api } from '../../utils/api';
import { ReceiptData } from '../../types/types';
import { TradeShow, User } from '../../App';
import { filterActiveEvents, filterEventsByParticipation } from '../../utils/eventUtils';
import {
  ReceiptUploadHeader,
  ReceiptUploadDropzone,
  ReceiptImagePreview,
  OcrResultsForm,
  OcrFailedState,
  FullImageModal,
} from './ReceiptUpload/index';
import { useReceiptOcr } from './ReceiptUpload/hooks/useReceiptOcr';
import { isAcceptableReceiptFile, isPdfFile, PDF_PLACEHOLDER_IMAGE } from '../../utils/fileValidation';
import {
  buildZohoExpenseDescription,
  getZohoExpenseDescriptionValidationMessage,
  ZOHO_EXPENSE_DESCRIPTION_MAX_LENGTH,
} from '../../utils/zohoExpenseDescription';
import { getTodayLocalDateString } from '../../utils/dateUtils';

interface ReceiptUploadProps {
  onReceiptProcessed: (data: ReceiptData, file: File) => void;
  onCancel: () => void;
  user: User;
  events: TradeShow[];
  isSaving?: boolean;
  /** Photo already captured (bottom-nav camera) — processed on mount */
  initialFile?: File | null;
}

export const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, onCancel, user, events, isSaving = false, initialFile = null }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showFullImage, setShowFullImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Additional fields for complete expense submission
  const [selectedEvent, setSelectedEvent] = useState('');
  const [selectedCard, setSelectedCard] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [description, setDescription] = useState('');
  const [cardOptions, setCardOptions] = useState<Array<{name: string; lastFour: string; entity?: string | null}>>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  // Filter events
  const activeEvents = filterActiveEvents(events);
  const userEvents = filterEventsByParticipation(activeEvents, user);

  const selectedEventRecord = useMemo(
    () => events.find((e) => e.id === selectedEvent),
    [events, selectedEvent]
  );

  const receiptZohoDescriptionError = useMemo(() => {
    return getZohoExpenseDescriptionValidationMessage({
      description,
      userName: user.name,
      eventName: selectedEventRecord?.name,
      eventStartDate: selectedEventRecord?.startDate,
      eventEndDate: selectedEventRecord?.endDate,
      reimbursementRequired: false,
    });
  }, [description, user.name, selectedEventRecord]);

  const receiptZohoComposedLength = useMemo(
    () =>
      buildZohoExpenseDescription({
        description,
        userName: user.name,
        eventName: selectedEventRecord?.name,
        eventStartDate: selectedEventRecord?.startDate,
        eventEndDate: selectedEventRecord?.endDate,
        reimbursementRequired: false,
      }).length,
    [description, user.name, selectedEventRecord]
  );

  // Use OCR hook
  const {
    processing,
    ocrResults,
    setOcrResults,
    ocrFailed,
    setOcrFailed,
    ocrErrorMessage,
    fieldWarnings,
    processReceipt: processReceiptHook,
    getFieldWarnings
  } = useReceiptOcr();
  
  // Load card options and categories
  useEffect(() => {
    (async () => {
      const defaultCategories = [
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
      ];
      
      if (api.USE_SERVER) {
        try {
          const settings = await api.getSettings();
          setCardOptions(settings.cardOptions || []);
          // Handle both old format (string[]) and new format (CategoryOption[])
          const cats = settings.categoryOptions || defaultCategories;
          const categoryNames = cats.map((cat: any) => typeof cat === 'string' ? cat : cat.name);
          setCategories(categoryNames);
          console.log('[ReceiptUpload] Loaded categories:', categoryNames.length);
        } catch (error) {
          console.error('[ReceiptUpload] Failed to load settings:', error);
          setCardOptions([]);
          setCategories(defaultCategories);
        }
      } else {
        const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
        setCardOptions(settings.cardOptions || []);
        // Handle both old format (string[]) and new format (CategoryOption[])
        const cats = settings.categoryOptions || defaultCategories;
        setCategories(cats.map((cat: any) => typeof cat === 'string' ? cat : cat.name));
      }
    })();
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleSingleFile = (file: File) => {
    if (!isAcceptableReceiptFile(file)) {
      alert('Please upload an image (JPG, PNG, HEIC, WebP) or PDF file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }
    setSelectedFile(file);
    if (isPdfFile(file)) {
      setUploadedImage(PDF_PLACEHOLDER_IMAGE);
      processReceiptHook(file, cardOptions);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
        processReceiptHook(file, cardOptions);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFiles = (files: FileList) => {
    const file = files[0];
    if (!file) return;
    handleSingleFile(file);
  };

  // A photo handed over from the bottom-nav camera skips the idle upload
  // state entirely — OCR starts the moment this screen appears.
  useEffect(() => {
    if (initialFile) handleSingleFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hand-off
  }, []);

  // Auto-match card when OCR results are available
  useEffect(() => {
    if (ocrResults?.ocrV2Data?.inference?.cardLastFour?.value && cardOptions.length > 0) {
      const lastFour = ocrResults.ocrV2Data.inference.cardLastFour.value;
      const matchingCard = cardOptions.find(card => card.lastFour === lastFour);
      if (matchingCard && !selectedCard) {
        setSelectedCard(`${matchingCard.name} (...${matchingCard.lastFour})`);
        setSelectedEntity(matchingCard.entity || '');
      }
    }
  }, [ocrResults, cardOptions, selectedCard]);

  const handleConfirm = () => {
    // Validate required fields
    if (!selectedEvent) {
      alert('Please select an event for this expense.');
      return;
    }
    if (receiptZohoDescriptionError) {
      alert(receiptZohoDescriptionError);
      return;
    }
    
    if (ocrResults) {
      // Include additional fields in the data
      const completeData = {
        ...ocrResults,
        tradeShowId: selectedEvent,
        cardUsed: selectedCard,
        zohoEntity: selectedEntity || undefined,  // Auto-populated from card selection
        description: description,
      };
      onReceiptProcessed(completeData as ReceiptData, selectedFile!);
    }
  };

  const handleReset = () => {
    setUploadedImage(null);
    setSelectedFile(null);
    setOcrResults(null);
    setOcrFailed(false);
    setSelectedEvent('');
    setSelectedCard('');
    setSelectedEntity('');
    setDescription('');
  };

  const handleRetryOcr = () => {
    setOcrFailed(false);
    if (selectedFile) {
      processReceiptHook(selectedFile, cardOptions);
    }
  };

  // Keep the OCR outcome in view on phones: the tall preview used to push
  // the spinner/results/failure banner below the fold, so the screen looked
  // frozen after picking a photo.
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (processing || ocrResults || ocrFailed) {
      statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [processing, !!ocrResults, ocrFailed]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card p-4 sm:p-5 md:p-6 lg:p-8">
        <ReceiptUploadHeader onCancel={onCancel} />

        {!uploadedImage && !ocrResults ? (
          <div className="space-y-4">
            <ReceiptUploadDropzone
              dragActive={dragActive}
              fileInputRef={fileInputRef}
              onDrag={handleDrag}
              onDrop={handleDrop}
              onFilesSelected={handleFiles}
            />
            {/* No receipt in hand (tips, mileage, lost receipt) — a proper
                button, not a buried text link, so phones can't miss it */}
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-stone-200" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                or
              </span>
              <span className="h-px flex-1 bg-stone-200" />
            </div>
            <button
              type="button"
              onClick={() =>
                setOcrResults({
                  merchant: '',
                  total: undefined,
                  date: getTodayLocalDateString(),
                  category: 'Other',
                  confidence: 0,
                  ocrText: '',
                })
              }
              className="btn-secondary w-full py-3 text-brand-700 border-brand-200 hover:border-brand-300 hover:bg-brand-50"
            >
              <PenLine className="h-4 w-4" />
              Enter expense manually — no receipt needed
            </button>
          </div>
        ) : (
          <div ref={statusRef} className="scroll-mt-4 space-y-8">
            {uploadedImage && (
              <ReceiptImagePreview
                uploadedImage={uploadedImage}
                processing={processing}
                onImageClick={() => setShowFullImage(true)}
              />
            )}

            {ocrResults && !processing && (
              <OcrResultsForm
                ocrResults={ocrResults}
                setOcrResults={setOcrResults}
                selectedEvent={selectedEvent}
                setSelectedEvent={setSelectedEvent}
                selectedCard={selectedCard}
                setSelectedCard={setSelectedCard}
                selectedEntity={selectedEntity}
                setSelectedEntity={setSelectedEntity}
                description={description}
                setDescription={setDescription}
                cardOptions={cardOptions}
                categories={categories}
                userEvents={userEvents}
                allEvents={events}
                fieldWarnings={fieldWarnings}
                getFieldWarnings={getFieldWarnings}
                user={user}
                onEventCreated={(newEvent) => {
                  // Add the new event to the local list so it appears in the dropdown
                  events.push(newEvent);
                }}
              />
            )}

            {ocrFailed && !processing && !ocrResults && (
              <OcrFailedState
                selectedFile={selectedFile}
                errorMessage={ocrErrorMessage}
                onRetry={handleRetryOcr}
                onManualEntry={(defaultData) => {
                  setOcrResults(defaultData);
                  setOcrFailed(false);
                }}
              />
            )}

            {/* Action Buttons — sticky on phones/tablets so Create Expense stays reachable; lg: restores the original static bar */}
            <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-stone-200 bg-white/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:static lg:z-auto lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-6 lg:pb-0 lg:backdrop-blur-none">
              {ocrResults && selectedEvent && (
                <p className="text-xs text-stone-500 text-right">
                  Zoho Books combined description: {receiptZohoComposedLength}/{ZOHO_EXPENSE_DESCRIPTION_MAX_LENGTH} characters
                </p>
              )}
              {receiptZohoDescriptionError && (
                <p className="text-sm text-red-700 text-right">{receiptZohoDescriptionError}</p>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={handleReset}
                className="btn-secondary w-full px-6 py-3 sm:w-auto"
              >
                Upload Different Receipt
              </button>

              {ocrResults && (
                <button
                  onClick={handleConfirm}
                  disabled={isSaving || !!receiptZohoDescriptionError}
                  className="btn-primary w-full px-8 py-3 sm:w-auto"
                >
                  {isSaving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span>Create Expense</span>
                    </>
                  )}
                </button>
              )}
              </div>
            </div>
          </div>
        )}
      </div>

      <FullImageModal
        imageUrl={uploadedImage || ''}
        isOpen={showFullImage}
        onClose={() => setShowFullImage(false)}
      />
    </div>
  );
};
