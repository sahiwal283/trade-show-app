/**
 * FlightsSection — one ledger-style row per attendee: name leads, email
 * stays quiet, a booked/pending chip closes the line, and the booking
 * fields sit underneath. Unbooked rows sort first.
 */

import React, { useState } from 'react';
import { Save, Receipt } from 'lucide-react';
import { ChecklistData, FlightData } from '../TradeShowChecklist';
import { TradeShow, User } from '../../../App';
import { api } from '../../../utils/api';
import { ChecklistReceiptUpload } from '../ChecklistReceiptUpload';
import { CheckToggle, StatusChip, FieldLabel, InlineAction } from '../ChecklistPrimitives';

interface FlightsSectionProps {
  checklist: ChecklistData;
  user: User;
  event: TradeShow;
  onReload: () => void;
}

export const FlightsSection: React.FC<FlightsSectionProps> = ({ checklist, user, event, onReload }) => {
  const [editingFlights, setEditingFlights] = useState<{ [key: string]: FlightData }>({});
  const [saving, setSaving] = useState<{ [key: string]: boolean }>({});
  const [showReceiptUpload, setShowReceiptUpload] = useState<{attendeeId: string; attendeeName: string} | null>(null);

  const participants = event.participants || [];

  const getFlightForAttendee = (attendeeId: string) => {
    return checklist.flights.find(f => f.attendee_id?.toString() === attendeeId);
  };

  const handleFieldChange = <K extends keyof FlightData>(
    attendeeId: string,
    field: K,
    value: FlightData[K]
  ) => {
    const existing = getFlightForAttendee(attendeeId) || {
      attendee_id: attendeeId,
      attendee_name: participants.find(p => p.id === attendeeId)?.name || '',
      carrier: null,
      confirmation_number: null,
      notes: null,
      booked: false
    };

    setEditingFlights({
      ...editingFlights,
      [attendeeId]: {
        ...existing,
        ...editingFlights[attendeeId],
        [field]: value
      }
    });
  };

  const handleSave = async (attendeeId: string) => {
    const flightData = editingFlights[attendeeId];
    if (!flightData) return;

    setSaving({ ...saving, [attendeeId]: true });

    try {
      const existingFlight = getFlightForAttendee(attendeeId);

      const payload = {
        attendeeId: flightData.attendee_id,
        attendeeName: flightData.attendee_name,
        carrier: flightData.carrier,
        confirmationNumber: flightData.confirmation_number,
        notes: flightData.notes,
        booked: true  // Always mark as booked when saving flight info
      };

      if (existingFlight && existingFlight.id) {
        await api.checklist.updateFlight(existingFlight.id, payload);
      } else {
        await api.checklist.createFlight(checklist.id, payload);
      }

      // Clear editing state
      const newEditing = { ...editingFlights };
      delete newEditing[attendeeId];
      setEditingFlights(newEditing);

      onReload();
    } catch (error) {
      console.error('[FlightsSection] Error saving flight:', error);
      alert('Failed to save flight information');
    } finally {
      setSaving({ ...saving, [attendeeId]: false });
    }
  };

  const toggleBooked = async (attendeeId: string) => {
    const flight = getFlightForAttendee(attendeeId);
    if (!flight || !flight.id) return;

    try {
      await api.checklist.updateFlight(flight.id, {
        carrier: flight.carrier,
        confirmationNumber: flight.confirmation_number,
        notes: flight.notes,
        booked: !flight.booked
      });
      onReload();
    } catch (error) {
      console.error('[FlightsSection] Error toggling flight:', error);
    }
  };

  return (
    <>
      <div className="p-4 sm:p-5">
      {participants.length === 0 ? (
        <p className="text-sm text-stone-500">No participants added to this event yet.</p>
      ) : (
        <div className="space-y-3">
          {participants
            .sort((a, b) => {
              const flightA = getFlightForAttendee(a.id);
              const flightB = getFlightForAttendee(b.id);
              // Unbooked flights first, booked flights last
              if (flightA?.booked === flightB?.booked) return 0;
              return flightA?.booked ? 1 : -1;
            })
            .map(participant => {
            const flight = getFlightForAttendee(participant.id);
            const editing = editingFlights[participant.id];
            const currentData = editing || flight;
            const isModified = !!editing;

            return (
              <div
                key={participant.id}
                className="rounded-xl border border-stone-200 p-3 transition-colors hover:border-stone-300 sm:p-4"
              >
                {/* Ledger line: toggle · name (lead) · email (quiet) · status */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <CheckToggle
                      checked={!!flight?.booked}
                      onToggle={() => flight?.id && toggleBooked(participant.id)}
                      disabled={!flight?.id}
                      label={`Mark flight for ${participant.name} as ${flight?.booked ? 'not booked' : 'booked'}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-900">{participant.name}</p>
                      <p className="truncate text-xs text-stone-400">{participant.email}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isModified ? (
                      <button
                        type="button"
                        onClick={() => handleSave(participant.id)}
                        disabled={saving[participant.id]}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 lg:min-h-0"
                      >
                        <Save aria-hidden="true" className="w-4 h-4" />
                        Save
                      </button>
                    ) : (
                      <StatusChip done={!!flight?.booked} />
                    )}
                  </div>
                </div>

                {/* Booking fields */}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 sm:pl-9">
                  <div>
                    <FieldLabel>Carrier</FieldLabel>
                    <input
                      type="text"
                      value={currentData?.carrier || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'carrier', e.target.value)}
                      placeholder="e.g., Delta, United"
                      className="input-field"
                    />
                  </div>

                  <div>
                    <FieldLabel>Confirmation Number</FieldLabel>
                    <input
                      type="text"
                      value={currentData?.confirmation_number || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'confirmation_number', e.target.value)}
                      placeholder="Booking reference"
                      className="input-field"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel>Notes</FieldLabel>
                    <textarea
                      value={currentData?.notes || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'notes', e.target.value)}
                      placeholder="Flight times, layovers, seat preferences, etc."
                      className="input-field resize-none"
                      rows={2}
                    />
                  </div>

                  <div className="md:col-span-2 -ml-2.5">
                    <InlineAction
                      icon={Receipt}
                      label="Upload Receipt"
                      onClick={() => setShowReceiptUpload({ attendeeId: participant.id, attendeeName: participant.name })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

    {/* Receipt Upload Modal */}
    {showReceiptUpload && (
      <ChecklistReceiptUpload
        user={user}
        event={event}
        section="flight"
        attendeeName={showReceiptUpload.attendeeName}
        onClose={() => setShowReceiptUpload(null)}
        onExpenseCreated={() => {
          setShowReceiptUpload(null);
          onReload();
        }}
      />
    )}
    </>
  );
};
