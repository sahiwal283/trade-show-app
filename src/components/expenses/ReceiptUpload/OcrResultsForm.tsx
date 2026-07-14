/**
 * OcrResultsForm Component
 * 
 * Form displaying OCR results and allowing user edits.
 */

import React, { useState, useMemo } from 'react';
import { CheckCircle, AlertCircle, CreditCard, Plus, Loader2, Clock } from 'lucide-react';
import { ReceiptData } from '../../../types/types';
import { TradeShow, User } from '../../../App';
import { api } from '../../../utils/api';
import { getTodayLocalDateString } from '../../../utils/dateUtils';
import { filterEventsByParticipation } from '../../../utils/eventUtils';

// Confidence tint used beside field labels: accent = trustworthy,
// amber = double-check, orange = likely wrong.
const confidenceTextClass = (confidence: number): string =>
  confidence >= 0.7 ? 'text-accent-600' : confidence >= 0.5 ? 'text-amber-600' : 'text-orange-600';

interface CardOption {
  name: string;
  lastFour: string;
  entity?: string | null;
}

interface FieldWarning {
  field: string;
  reason: string;
  severity: string;
  suggestedAction?: string;
}

interface OcrResultsFormProps {
  ocrResults: ReceiptData;
  setOcrResults: React.Dispatch<React.SetStateAction<ReceiptData | null>>;
  selectedEvent: string;
  setSelectedEvent: (value: string) => void;
  selectedCard: string;
  setSelectedCard: (value: string) => void;
  selectedEntity: string;
  setSelectedEntity: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  cardOptions: CardOption[];
  categories: string[];
  userEvents: TradeShow[];
  allEvents?: TradeShow[];
  fieldWarnings: FieldWarning[];
  getFieldWarnings: (fieldName: string) => FieldWarning[];
  user?: User;
  onEventCreated?: (event: TradeShow) => void;
}

export const OcrResultsForm: React.FC<OcrResultsFormProps> = ({
  ocrResults,
  setOcrResults,
  selectedEvent,
  setSelectedEvent,
  selectedCard,
  setSelectedCard,
  selectedEntity,
  setSelectedEntity,
  description,
  setDescription,
  cardOptions,
  categories,
  userEvents,
  allEvents,
  fieldWarnings,
  getFieldWarnings,
  user,
  onEventCreated
}) => {
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickEventName, setQuickEventName] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [createError, setCreateError] = useState('');
  const [showPastEvents, setShowPastEvents] = useState(false);

  // Past events = all events that aren't in the active list
  const pastEvents = useMemo(() => {
    if (!allEvents || !user) return [];
    const activeIds = new Set(userEvents.map(e => e.id));
    const allUserEvents = filterEventsByParticipation(allEvents, user);
    return allUserEvents.filter(e => !activeIds.has(e.id));
  }, [allEvents, userEvents, user]);

  const canCreateEvents = user && ['admin', 'coordinator', 'developer'].includes(user.role);

  const handleQuickCreateEvent = async () => {
    if (!quickEventName.trim()) return;
    
    setCreatingEvent(true);
    setCreateError('');
    
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
      
      // Auto-select the new event
      setSelectedEvent(newEvent.id);
      setQuickEventName('');
      setShowQuickCreate(false);
      
      // Notify parent to refresh events list
      if (onEventCreated) {
        onEventCreated(newEvent);
      }
    } catch (error: any) {
      console.error('[QuickCreate] Failed to create event:', error);
      setCreateError(error?.message || 'Failed to create event');
    } finally {
      setCreatingEvent(false);
    }
  };

  return (
    <div className="rounded-card bg-gray-50/80 p-4 ring-1 ring-inset ring-gray-200/70 sm:p-5 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle className="w-6 h-6 text-accent-600" />
          <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900">Extracted Data</h3>
          <span className={`chip px-2 py-1 text-xs ${
            ocrResults.confidence >= 0.7 ? 'bg-accent-50 text-accent-800 ring-accent-200/70' :
            ocrResults.confidence >= 0.5 ? 'bg-amber-50 text-amber-800 ring-amber-200/70' :
            'bg-orange-50 text-orange-700 ring-orange-200/70'
          }`}>
            <span className={`chip-dot ${
              ocrResults.confidence >= 0.7 ? 'bg-accent-500' :
              ocrResults.confidence >= 0.5 ? 'bg-amber-500' :
              'bg-orange-500'
            }`} />
            {Math.round(ocrResults.confidence * 100)}% confidence
          </span>
          {ocrResults.ocrV2Data?.ocrProvider && (
            <span className="chip bg-brand-50 px-2 py-1 text-xs text-brand-700 ring-brand-200/70">
              {ocrResults.ocrV2Data.ocrProvider}
            </span>
          )}
        </div>
        <div className={`flex items-center text-sm ${
          ocrResults.ocrV2Data?.needsReview ? 'text-orange-600 font-medium' : 'text-brand-600'
        }`}>
          <AlertCircle className="w-4 h-4 mr-1" />
          <span>
            {ocrResults.ocrV2Data?.needsReview 
              ? `⚠️ Review: ${ocrResults.ocrV2Data.reviewReasons?.join(', ') || 'Low confidence fields'}`
              : '✓ Please verify all fields before submitting'
            }
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="field-label">
              Merchant
              {ocrResults.ocrV2Data?.inference?.merchant && (
                <span className={`ml-2 text-xs font-medium tabular-nums ${confidenceTextClass(ocrResults.ocrV2Data.inference.merchant.confidence)}`}>
                  ({Math.round(ocrResults.ocrV2Data.inference.merchant.confidence * 100)}%)
                </span>
              )}
              {getFieldWarnings('merchant').length > 0 && (
                <span className="ml-2 text-orange-600">
                  ⚠️
                </span>
              )}
            </label>
            <input
              type="text"
              value={ocrResults.merchant}
              onChange={(e) => setOcrResults({ ...ocrResults, merchant: e.target.value })}
              className={`input-field ${
                getFieldWarnings('merchant').some(w => w.severity === 'high')
                  ? 'border-orange-400 focus:border-orange-500 focus:ring-orange-500/15'
                  : ''
              }`}
              placeholder="Merchant name"
            />
            {getFieldWarnings('merchant').map((warning, idx) => (
              <div key={idx} className={`mt-1 text-xs ${
                warning.severity === 'high' ? 'text-orange-600' :
                warning.severity === 'medium' ? 'text-amber-600' :
                'text-brand-600'
              }`}>
                <span className="font-medium">⚠️ {warning.reason}</span>
                {warning.suggestedAction && (
                  <div className="ml-4 mt-0.5 text-gray-600 italic">
                    → {warning.suggestedAction}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div>
            <label className="field-label">
              Total Amount
              {ocrResults.ocrV2Data?.inference?.amount && (
                <span className={`ml-2 text-xs font-medium tabular-nums ${confidenceTextClass(ocrResults.ocrV2Data.inference.amount.confidence)}`}>
                  ({Math.round(ocrResults.ocrV2Data.inference.amount.confidence * 100)}%)
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              value={ocrResults.total || ''}
              onChange={(e) => {
                const value = e.target.value;
                const cleaned = value.replace(/^0+(?=\d)/, '');
                setOcrResults({ ...ocrResults, total: parseFloat(cleaned) || 0 });
              }}
              className="input-field font-semibold text-accent-700 tabular-nums"
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="field-label">
              Date
              {ocrResults.ocrV2Data?.inference?.date && (
                <span className={`ml-2 text-xs font-medium tabular-nums ${confidenceTextClass(ocrResults.ocrV2Data.inference.date.confidence)}`}>
                  ({Math.round(ocrResults.ocrV2Data.inference.date.confidence * 100)}%)
                </span>
              )}
            </label>
            <input
              type="date"
              value={ocrResults.date}
              onChange={(e) => setOcrResults({ ...ocrResults, date: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="field-label">
              Category
              {ocrResults.ocrV2Data?.inference?.category && (
                <span className={`ml-2 text-xs font-medium tabular-nums ${confidenceTextClass(ocrResults.ocrV2Data.inference.category.confidence)}`}>
                  ({Math.round(ocrResults.ocrV2Data.inference.category.confidence * 100)}% confidence)
                </span>
              )}
            </label>
            <select
              value={ocrResults.category || ''}
              onChange={(e) => {
                console.log('[ReceiptUpload] Category changed to:', e.target.value);
                setOcrResults({ ...ocrResults, category: e.target.value });
              }}
              className="input-field"
            >
              <option value="">Select category...</option>
              {categories.length > 0 ? (
                categories.map((cat, idx) => (
                  <option key={idx} value={cat}>
                    {cat}
                  </option>
                ))
              ) : (
                <option disabled>Loading categories...</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Review Reasons */}
      {ocrResults.ocrV2Data?.reviewReasons && ocrResults.ocrV2Data.reviewReasons.length > 0 && (
        <div className="mt-4 rounded-lg bg-orange-50 p-3 ring-1 ring-inset ring-orange-200/70">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-900">Please Review:</p>
              <ul className="text-sm text-orange-700 mt-1 space-y-1">
                {ocrResults.ocrV2Data.reviewReasons.map((reason: string, idx: number) => (
                  <li key={idx}>• {reason}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Event and Card Selection */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="field-label">
            Trade Show Event *
          </label>
          <div className="flex items-center gap-2">
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="input-field flex-1 max-w-sm py-2.5 sm:py-1.5"
              required
            >
              <option value="">Select an event</option>
              {userEvents.map(event => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
              {showPastEvents && pastEvents.length > 0 && (
                <optgroup label="── Past Events ──">
                  {pastEvents.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {canCreateEvents && (
              <button
                type="button"
                onClick={() => setShowQuickCreate(!showQuickCreate)}
                className="inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-200/70 transition-colors duration-150 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 lg:min-h-0"
                title="Quick create a new event"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New</span>
              </button>
            )}
          </div>
          {showQuickCreate && (
            <div className="mt-2 max-w-sm rounded-lg border border-brand-200/70 bg-brand-50/60 p-3">
              <label className="block text-xs font-semibold text-brand-800 mb-1">
                Event Name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickEventName}
                  onChange={(e) => setQuickEventName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickCreateEvent()}
                  className="input-field flex-1 py-2.5 sm:py-1.5"
                  placeholder="e.g., CES 2026"
                  autoFocus
                  disabled={creatingEvent}
                />
                <button
                  type="button"
                  onClick={handleQuickCreateEvent}
                  disabled={!quickEventName.trim() || creatingEvent}
                  className="btn-primary shrink-0 px-3 py-1.5 text-xs"
                >
                  {creatingEvent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Create
                </button>
              </div>
              {createError && (
                <p className="mt-1 text-xs text-red-600">{createError}</p>
              )}
              <p className="mt-1 text-xs text-brand-600">You can add venue, dates, and other details later in Events.</p>
            </div>
          )}
          {pastEvents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPastEvents(!showPastEvents)}
              className="mt-1 flex min-h-[44px] items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors lg:min-h-0"
            >
              <Clock className="w-3 h-3" />
              {showPastEvents ? 'Hide past events' : `Show ${pastEvents.length} past event${pastEvents.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>

        <div>
          <label className="field-label">
            <CreditCard className="w-4 h-4 inline mr-1" />
            Card Used
            {ocrResults?.ocrV2Data?.inference?.cardLastFour && (
              <span className={`ml-2 text-xs font-medium tabular-nums ${confidenceTextClass(ocrResults.ocrV2Data.inference.cardLastFour.confidence)}`}>
                ({Math.round(ocrResults.ocrV2Data.inference.cardLastFour.confidence * 100)}% - OCR found ...{ocrResults.ocrV2Data.inference.cardLastFour.value})
              </span>
            )}
          </label>
          <select
            value={selectedCard}
            onChange={(e) => {
              const cardValue = e.target.value;
              const selectedCardOption = cardOptions.find(card => `${card.name} (...${card.lastFour})` === cardValue);
              setSelectedCard(cardValue);
              setSelectedEntity(selectedCardOption?.entity || '');
            }}
            className="input-field max-w-sm py-2.5 sm:py-1.5"
          >
            <option value="">Select card...</option>
            {cardOptions.map((card, idx) => (
              <option key={idx} value={`${card.name} (...${card.lastFour})`}>
                {card.name} (...{card.lastFour})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description / Notes */}
      <div className="mt-4">
        <label className="field-label">
          Description / Notes
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field max-w-2xl"
          rows={3}
          placeholder="Optional: Add any additional notes or details..."
        />
      </div>
    </div>
  );
};

