/**
 * HotelsSection — one ledger-style row per attendee: name leads, email
 * stays quiet, a booked/pending chip closes the line, and the reservation
 * fields sit underneath. Unbooked rows sort first.
 */

import React, { useState } from 'react';
import { Save, Receipt } from 'lucide-react';
import { ChecklistData, HotelData } from '../TradeShowChecklist';
import { TradeShow, User } from '../../../App';
import { api } from '../../../utils/api';
import { ChecklistReceiptUpload } from '../ChecklistReceiptUpload';
import { CheckToggle, StatusChip, FieldLabel, InlineAction } from '../ChecklistPrimitives';

interface HotelsSectionProps {
  checklist: ChecklistData;
  user: User;
  event: TradeShow;
  onReload: () => void;
}

export const HotelsSection: React.FC<HotelsSectionProps> = ({ checklist, user, event, onReload }) => {
  const [editingHotels, setEditingHotels] = useState<{ [key: string]: HotelData }>({});
  const [saving, setSaving] = useState<{ [key: string]: boolean }>({});
  const [showReceiptUpload, setShowReceiptUpload] = useState<{attendeeId: string; attendeeName: string} | null>(null);

  const participants = event.participants || [];

  const getHotelForAttendee = (attendeeId: string) => {
    return checklist.hotels.find(h => h.attendee_id?.toString() === attendeeId);
  };

  const handleFieldChange = <K extends keyof HotelData>(
    attendeeId: string,
    field: K,
    value: HotelData[K]
  ) => {
    const existing = getHotelForAttendee(attendeeId) || {
      attendee_id: attendeeId,
      attendee_name: participants.find(p => p.id === attendeeId)?.name || '',
      property_name: null,
      confirmation_number: null,
      check_in_date: null,
      check_out_date: null,
      notes: null,
      booked: false
    };

    setEditingHotels({
      ...editingHotels,
      [attendeeId]: {
        ...existing,
        ...editingHotels[attendeeId],
        [field]: value
      }
    });
  };

  const handleSave = async (attendeeId: string) => {
    const hotelData = editingHotels[attendeeId];
    if (!hotelData) return;

    setSaving({ ...saving, [attendeeId]: true });

    try {
      const existingHotel = getHotelForAttendee(attendeeId);

      const payload = {
        attendeeId: hotelData.attendee_id,
        attendeeName: hotelData.attendee_name,
        propertyName: hotelData.property_name,
        confirmationNumber: hotelData.confirmation_number,
        checkInDate: hotelData.check_in_date,
        checkOutDate: hotelData.check_out_date,
        notes: hotelData.notes,
        booked: true  // Always mark as booked when saving hotel info
      };

      if (existingHotel && existingHotel.id) {
        await api.checklist.updateHotel(existingHotel.id, payload);
      } else {
        await api.checklist.createHotel(checklist.id, payload);
      }

      const newEditing = { ...editingHotels };
      delete newEditing[attendeeId];
      setEditingHotels(newEditing);

      onReload();
    } catch (error) {
      console.error('[HotelsSection] Error saving hotel:', error);
      alert('Failed to save hotel information');
    } finally {
      setSaving({ ...saving, [attendeeId]: false });
    }
  };

  const toggleBooked = async (attendeeId: string) => {
    const hotel = getHotelForAttendee(attendeeId);
    if (!hotel || !hotel.id) return;

    try {
      await api.checklist.updateHotel(hotel.id, {
        propertyName: hotel.property_name,
        confirmationNumber: hotel.confirmation_number,
        checkInDate: hotel.check_in_date,
        checkOutDate: hotel.check_out_date,
        notes: hotel.notes,
        booked: !hotel.booked
      });
      onReload();
    } catch (error) {
      console.error('[HotelsSection] Error toggling hotel:', error);
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
              const hotelA = getHotelForAttendee(a.id);
              const hotelB = getHotelForAttendee(b.id);
              // Unbooked hotels first, booked hotels last
              if (hotelA?.booked === hotelB?.booked) return 0;
              return hotelA?.booked ? 1 : -1;
            })
            .map(participant => {
            const hotel = getHotelForAttendee(participant.id);
            const editing = editingHotels[participant.id];
            const currentData = editing || hotel;
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
                      checked={!!hotel?.booked}
                      onToggle={() => hotel?.id && toggleBooked(participant.id)}
                      disabled={!hotel?.id}
                      label={`Mark hotel for ${participant.name} as ${hotel?.booked ? 'not booked' : 'booked'}`}
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
                      <StatusChip done={!!hotel?.booked} />
                    )}
                  </div>
                </div>

                {/* Reservation fields */}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 sm:pl-9">
                  <div>
                    <FieldLabel>Property Name</FieldLabel>
                    <input
                      type="text"
                      value={currentData?.property_name || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'property_name', e.target.value)}
                      placeholder="e.g., Marriott Downtown"
                      className="input-field"
                    />
                  </div>

                  <div>
                    <FieldLabel>Confirmation Number</FieldLabel>
                    <input
                      type="text"
                      value={currentData?.confirmation_number || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'confirmation_number', e.target.value)}
                      placeholder="Reservation number"
                      className="input-field"
                    />
                  </div>

                  <div>
                    <FieldLabel>Check-In Date</FieldLabel>
                    <input
                      type="date"
                      value={currentData?.check_in_date || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'check_in_date', e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <FieldLabel>Check-Out Date</FieldLabel>
                    <input
                      type="date"
                      value={currentData?.check_out_date || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'check_out_date', e.target.value)}
                      min={currentData?.check_in_date || ''}
                      className="input-field"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FieldLabel>Notes</FieldLabel>
                    <textarea
                      value={currentData?.notes || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'notes', e.target.value)}
                      placeholder="Room type, special requests, loyalty numbers, etc."
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
        section="hotel"
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
