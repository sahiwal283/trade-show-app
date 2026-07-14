/**
 * EventDetailsModal Component
 * 
 * Modal displaying detailed event information including checklist.
 */

import React, { useState } from 'react';
import { X, MapPin, Calendar, DollarSign, Map, Loader2, AlertCircle } from 'lucide-react';
import { TradeShow, User } from '../../../App';
import { formatLocalDate } from '../../../utils/dateUtils';
import { ChecklistSummary } from './ChecklistSummary';
import { ChecklistSummary as ChecklistSummaryType } from './hooks';
import { BoothMapViewer } from '../../common/BoothMapViewer';

interface EventDetailsModalProps {
  event: TradeShow;
  user: User;
  checklistData: ChecklistSummaryType | null;
  loadingChecklist: boolean;
  onClose: () => void;
}

// Booth Map Image Component with error handling
const BoothMapImage: React.FC<{ boothMapUrl: string; onViewFullSize: () => void }> = ({ boothMapUrl, onViewFullSize }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  // Defensive check: ensure boothMapUrl is a string
  if (!boothMapUrl || typeof boothMapUrl !== 'string') {
    return (
      <div className="w-full h-48 bg-gray-50 rounded border border-gray-200 flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-xs text-gray-500 text-center">Invalid booth map URL</p>
      </div>
    );
  }
  
  // Construct image URL - ensure boothMapUrl starts with / if it doesn't already
  const normalizedUrl = boothMapUrl.startsWith('/') ? boothMapUrl : `/${boothMapUrl}`;
  // Use same pattern as appConstants.ts - Vite handles this at build time
  // @ts-ignore - Vite provides this at build time
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
  const imageUrl = `${apiBaseUrl}${normalizedUrl}`;
  
  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };
  
  const handleImageError = () => {
    console.error('[EventDetailsModal] Failed to load booth map image:', imageUrl);
    setImageError(true);
    setImageLoading(false);
  };
  
  if (imageError) {
    return (
      <div className="w-full h-48 bg-gray-50 rounded border border-gray-200 flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-xs text-gray-500 text-center">Failed to load booth map image</p>
      </div>
    );
  }
  
  return (
    <>
      {imageLoading && (
        <div className="w-full h-48 bg-gray-50 rounded border border-gray-200 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}
      <img
        src={imageUrl}
        alt="Booth Floor Plan"
        className={`w-full h-48 object-contain bg-gray-50 rounded border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity ${imageLoading ? 'hidden' : ''}`}
        onClick={onViewFullSize}
        onLoad={handleImageLoad}
        onError={handleImageError}
        title="Click to view full size"
      />
      {!imageLoading && !imageError && (
        <p className="text-xs text-gray-500 mt-1 text-center">Click image to view full size</p>
      )}
    </>
  );
};

export const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
  event,
  user,
  checklistData,
  loadingChecklist,
  onClose
}) => {
  const [showBoothMapViewer, setShowBoothMapViewer] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="modal-sheet-h w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-xl rounded-b-none bg-white shadow-elevation-3 sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 px-4 py-3 text-white sm:px-6 sm:py-4">
          <h2 className="min-w-0 truncate font-display text-xl sm:text-2xl font-bold tracking-tight">{event.name}</h2>
          <button
            onClick={onClose}
            className="tap-target shrink-0 rounded-lg p-2 transition-colors duration-150 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 sm:p-6 sm:space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6">
          {/* Location */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Location</h3>
            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-900 font-medium">{event.venue}</p>
                <p className="text-gray-600">{event.city}, {event.state}</p>
              </div>
            </div>
          </div>

          {/* Show Dates */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <span className="chip-dot bg-brand-500"></span>
              Show Dates
            </h3>
            <div className="rounded-lg bg-brand-50 p-4 ring-1 ring-inset ring-brand-200/70">
              <div className="flex items-center gap-2 text-brand-900">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">
                  {formatLocalDate(event.showStartDate || event.startDate)} - {formatLocalDate(event.showEndDate || event.endDate)}
                </span>
              </div>
              <p className="mt-1 text-sm text-brand-700">Actual event/trade show dates</p>
            </div>
          </div>

          {/* Travel Dates */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <span className="chip-dot bg-accent-500"></span>
              Travel Dates
            </h3>
            <div className="rounded-lg bg-accent-50 p-4 ring-1 ring-inset ring-accent-200/70">
              <div className="flex items-center gap-2 text-accent-900">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">
                  {formatLocalDate(event.travelStartDate || event.startDate)} - {formatLocalDate(event.travelEndDate || event.endDate)}
                </span>
              </div>
              <p className="mt-1 text-sm text-accent-700">When team members travel for the event</p>
            </div>
          </div>

          {/* Budget */}
          {event.budget && (user.role === 'admin' || user.role === 'developer' || user.role === 'accountant') && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Budget</h3>
              <div className="flex items-center gap-2 text-accent-600">
                <DollarSign className="w-5 h-5" />
                <span className="font-display text-2xl font-bold tracking-tight tabular-nums">${event.budget.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Participants */}
          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Participants ({event.participants?.length || 0})
            </h3>
            {event.participants && event.participants.length > 0 ? (
              <div className="space-y-2">
                {event.participants.map((participant) => (
                  <div key={participant.id} className="flex items-center gap-3 rounded-lg bg-gray-50/80 p-3 ring-1 ring-inset ring-gray-200/70">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                      <span className="text-white font-medium">
                        {participant.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{participant.name}</p>
                      <p className="text-sm text-gray-500 truncate">{participant.email}</p>
                    </div>
                    <span className="chip flex-shrink-0 bg-gray-50 px-2.5 py-1 text-xs capitalize text-gray-600 ring-gray-200">
                      {participant.role}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">No participants assigned yet</p>
            )}
          </div>

          {/* Booth Floor Plan */}
          {!loadingChecklist && checklistData?.booth_map_url && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <span className="chip-dot bg-purple-500"></span>
                Booth Floor Plan
              </h3>
              <div className="rounded-lg bg-purple-50 p-4 ring-1 ring-inset ring-purple-200/70">
                <div className="flex items-center gap-2 mb-3">
                  <Map className="w-5 h-5 text-purple-600" />
                  <span className="font-medium text-purple-900">Booth Layout</span>
                </div>
                <BoothMapImage 
                  boothMapUrl={checklistData.booth_map_url} 
                  onViewFullSize={() => setShowBoothMapViewer(true)}
                />
              </div>
            </div>
          )}

          {/* Checklist Summary */}
          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Event Checklist
            </h3>
            <ChecklistSummary
              user={user}
              checklistData={checklistData}
              loadingChecklist={loadingChecklist}
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end rounded-b-xl border-t border-gray-200 bg-gray-50/95 px-6 py-4 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="btn-secondary px-6 py-2.5"
          >
            Close
          </button>
        </div>
      </div>

      {/* Booth Map Viewer Modal */}
      {checklistData?.booth_map_url && (
        <BoothMapViewer
          boothMapUrl={checklistData.booth_map_url}
          isOpen={showBoothMapViewer}
          onClose={() => setShowBoothMapViewer(false)}
        />
      )}
    </div>
  );
};

