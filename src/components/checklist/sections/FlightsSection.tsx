import React, { useState } from 'react';
import { Plane, Plus, CheckCircle2, Circle, Trash2, Save, Receipt } from 'lucide-react';
import { ChecklistData, FlightData } from '../TradeShowChecklist';
import { TradeShow, User } from '../../../App';
import { api } from '../../../utils/api';
import { ChecklistReceiptUpload } from '../ChecklistReceiptUpload';

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
      const isNewFlight = !existingFlight || !existingFlight.id;
      
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
      <div className="p-4 sm:p-6">
      {participants.length === 0 ? (
        <p className="text-stone-500 text-sm">No participants added to this event yet.</p>
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
                className="border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => flight?.id && toggleBooked(participant.id)}
                      disabled={!flight?.id}
                      className="disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {flight?.booked ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600 hover:scale-110 transition-transform" />
                      ) : (
                        <Circle className="w-6 h-6 text-stone-400 hover:text-stone-600 transition-colors" />
                      )}
                    </button>
                    <div>
                      <p className="font-semibold text-stone-900">{participant.name}</p>
                      <p className="text-xs text-stone-500">{participant.email}</p>
                    </div>
                  </div>
                  
                  {isModified && (
                    <button
                      onClick={() => handleSave(participant.id)}
                      disabled={saving[participant.id]}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-9">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Carrier
                    </label>
                    <input
                      type="text"
                      value={currentData?.carrier || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'carrier', e.target.value)}
                      placeholder="e.g., Delta, United"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Confirmation Number
                    </label>
                    <input
                      type="text"
                      value={currentData?.confirmation_number || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'confirmation_number', e.target.value)}
                      placeholder="Booking reference"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={currentData?.notes || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'notes', e.target.value)}
                      placeholder="Flight times, layovers, seat preferences, etc."
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                      rows={2}
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <button
                      onClick={() => setShowReceiptUpload({ attendeeId: participant.id, attendeeName: participant.name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Receipt className="w-4 h-4" />
                      Upload Receipt
                    </button>
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

