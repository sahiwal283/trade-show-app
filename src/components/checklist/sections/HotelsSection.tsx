import React, { useState } from 'react';
import { Hotel, CheckCircle2, Circle, Save, Receipt } from 'lucide-react';
import { ChecklistData, HotelData } from '../TradeShowChecklist';
import { TradeShow, User } from '../../../App';
import { api } from '../../../utils/api';
import { ChecklistReceiptUpload } from '../ChecklistReceiptUpload';

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
      const isNewHotel = !existingHotel || !existingHotel.id;
      
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
      <div className="p-4 sm:p-6">
      {participants.length === 0 ? (
        <p className="text-stone-500 text-sm">No participants added to this event yet.</p>
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
                className="border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => hotel?.id && toggleBooked(participant.id)}
                      disabled={!hotel?.id}
                      className="disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {hotel?.booked ? (
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
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-9">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Property Name
                    </label>
                    <input
                      type="text"
                      value={currentData?.property_name || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'property_name', e.target.value)}
                      placeholder="e.g., Marriott Downtown"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
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
                      placeholder="Reservation number"
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Check-In Date
                    </label>
                    <input
                      type="date"
                      value={currentData?.check_in_date || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'check_in_date', e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Check-Out Date
                    </label>
                    <input
                      type="date"
                      value={currentData?.check_out_date || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'check_out_date', e.target.value)}
                      min={currentData?.check_in_date || ''}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={currentData?.notes || ''}
                      onChange={(e) => handleFieldChange(participant.id, 'notes', e.target.value)}
                      placeholder="Room type, special requests, loyalty numbers, etc."
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                      rows={2}
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <button
                      onClick={() => setShowReceiptUpload({ attendeeId: participant.id, attendeeName: participant.name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
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

