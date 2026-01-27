import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
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

interface ReceiptUploadProps {
  onReceiptProcessed: (data: ReceiptData, file: File) => void;
  onCancel: () => void;
  user: User;
  events: TradeShow[];
  isSaving?: boolean;
}

export const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, onCancel, user, events, isSaving = false }) => {
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
  
  // Use OCR hook
  const {
    processing,
    ocrResults,
    setOcrResults,
    ocrFailed,
    setOcrFailed,
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

  const handleFiles = (files: FileList) => {
    const file = files[0];
    // Accept images (including HEIC from iPhone), PDFs
    const isImage = file && file.type.startsWith('image/');
    const isPDF = file && file.type === 'application/pdf';
    
    // Validate file size (10MB max)
    if (file && file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }
    
    if (file && (isImage || isPDF)) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
        processReceiptHook(file, cardOptions);
      };
      reader.readAsDataURL(file);
    }
  };

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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 md:p-6 lg:p-8">
        <ReceiptUploadHeader onCancel={onCancel} />

        {!uploadedImage ? (
          <ReceiptUploadDropzone
            dragActive={dragActive}
            fileInputRef={fileInputRef}
            onDrag={handleDrag}
            onDrop={handleDrop}
            onFilesSelected={handleFiles}
          />
        ) : (
          <div className="space-y-8">
            <ReceiptImagePreview
              uploadedImage={uploadedImage}
              processing={processing}
              onImageClick={() => setShowFullImage(true)}
            />

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
                fieldWarnings={fieldWarnings}
                getFieldWarnings={getFieldWarnings}
              />
            )}

            {ocrFailed && !processing && !ocrResults && (
              <OcrFailedState
                selectedFile={selectedFile}
                onRetry={handleRetryOcr}
                onManualEntry={(defaultData) => {
                  setOcrResults(defaultData);
                  setOcrFailed(false);
                }}
              />
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <button
                onClick={handleReset}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Upload Different Receipt
              </button>
              
              {ocrResults && (
                <button
                  onClick={handleConfirm}
                  disabled={isSaving}
                  className={`${
                    isSaving 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600'
                  } text-white px-8 py-3 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2`}
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
