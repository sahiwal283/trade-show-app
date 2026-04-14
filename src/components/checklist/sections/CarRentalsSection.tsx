import React, { useState } from 'react';
import { Car, Plus, CheckCircle2, Circle, Trash2, Save, Receipt, Users, User as UserIcon, X } from 'lucide-react';
import { ChecklistData, CarRentalData } from '../TradeShowChecklist';
import { User, TradeShow } from '../../../App';
import { api } from '../../../utils/api';
import { getZohoExpenseDescriptionValidationMessage } from '../../../utils/zohoExpenseDescription';
import { ChecklistReceiptUpload } from '../ChecklistReceiptUpload';

interface CarRentalsSectionProps {
  checklist: ChecklistData;
  user: User;
  event: TradeShow;
  onReload: () => void;
}

export const CarRentalsSection: React.FC<CarRentalsSectionProps> = ({ checklist, user, event, onReload }) => {
  const [editingRentals, setEditingRentals] = useState<{ [key: number]: CarRentalData }>({});
  const [saving, setSaving] = useState<{ [key: number]: boolean }>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [showReceiptUpload, setShowReceiptUpload] = useState<number | null>(null);
  const [newRental, setNewRental] = useState<CarRentalData>({
    provider: null,
    confirmation_number: null,
    pickup_date: null,
    return_date: null,
    notes: null,
    booked: false,
    rental_type: 'group',
    assigned_to_id: null,
    assigned_to_name: null
  });
  const [newRentalReceipt, setNewRentalReceipt] = useState<File | null>(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);

  const handleFieldChange = <K extends keyof CarRentalData>(
    rentalId: number,
    field: K,
    value: CarRentalData[K]
  ) => {
    const existing = checklist.carRentals.find(r => r.id === rentalId);
    if (!existing) return;

    setEditingRentals({
      ...editingRentals,
      [rentalId]: {
        ...existing,
        ...editingRentals[rentalId],
        [field]: value
      }
    });
  };

  const handleSave = async (rentalId: number) => {
    const rentalData = editingRentals[rentalId];
    if (!rentalData) return;

    setSaving({ ...saving, [rentalId]: true });

    try {
      await api.checklist.updateCarRental(rentalId, {
        provider: rentalData.provider,
        confirmationNumber: rentalData.confirmation_number,
        pickupDate: rentalData.pickup_date,
        returnDate: rentalData.return_date,
        notes: rentalData.notes,
        booked: true,  // Always mark as booked when saving car rental info
        rentalType: rentalData.rental_type || 'group',
        assignedToId: rentalData.assigned_to_id || null,
        assignedToName: rentalData.assigned_to_name || null
      });

      const newEditing = { ...editingRentals };
      delete newEditing[rentalId];
      setEditingRentals(newEditing);

      onReload();
    } catch (error) {
      console.error('[CarRentalsSection] Error saving rental:', error);
      alert('Failed to save car rental information');
    } finally {
      setSaving({ ...saving, [rentalId]: false });
    }
  };

  const handleAddRental = async () => {
    setSaving({ ...saving, [-1]: true }); // Use -1 for new rental

    const carDescription = `Car rental - ${newRental.provider || 'Unnamed'}`;
    if (newRentalReceipt) {
      const zohoErr = getZohoExpenseDescriptionValidationMessage({
        description: carDescription,
        userName: user.name,
        eventName: event.name,
        eventStartDate: event.startDate,
        eventEndDate: event.endDate,
        reimbursementRequired: false,
      });
      if (zohoErr) {
        alert(zohoErr);
        setSaving({ ...saving, [-1]: false });
        return;
      }
    }
    
    try {
      // Create the rental first
      await api.checklist.createCarRental(checklist.id, {
        provider: newRental.provider,
        confirmationNumber: newRental.confirmation_number,
        pickupDate: newRental.pickup_date,
        returnDate: newRental.return_date,
        notes: newRental.notes,
        booked: true,  // Always mark as booked when adding car rental info
        rentalType: newRental.rental_type || 'group',
        assignedToId: newRental.assigned_to_id || null,
        assignedToName: newRental.assigned_to_name || null
      });

      // If there's a receipt, create an expense
      if (newRentalReceipt) {
        try {
          const expensePayload = {
            event_id: event.id,
            category: 'Rental - Car / U-haul',
            merchant: newRental.provider || 'Car Rental',
            amount: 0, // Will be updated from receipt
            date: newRental.pickup_date || new Date().toISOString().split('T')[0],
            description: carDescription,
            card_used: '',
            reimbursement_required: false,
          };

          await api.createExpense(expensePayload, newRentalReceipt);
          console.log('[CarRentalsSection] Receipt uploaded and expense created');
        } catch (receiptError) {
          console.error('[CarRentalsSection] Failed to upload receipt:', receiptError);
          alert('Car rental saved, but receipt upload failed. You can upload it later.');
        }
      }

      // Reset form
      setNewRental({
        provider: null,
        confirmation_number: null,
        pickup_date: null,
        return_date: null,
        notes: null,
        booked: false,
        rental_type: 'group',
        assigned_to_id: null,
        assigned_to_name: null
      });
      setNewRentalReceipt(null);
      setShowAddForm(false);
      onReload();
    } catch (error) {
      console.error('[CarRentalsSection] Error adding rental:', error);
      alert('Failed to add car rental');
    } finally {
      setSaving({ ...saving, [-1]: false });
    }
  };

  const handleDeleteRental = async (rentalId: number) => {
    if (!confirm('Delete this car rental?')) return;

    try {
      await api.checklist.deleteCarRental(rentalId);
      onReload();
    } catch (error) {
      console.error('[CarRentalsSection] Error deleting rental:', error);
      alert('Failed to delete car rental');
    }
  };

  const toggleBooked = async (rentalId: number) => {
    const rental = checklist.carRentals.find(r => r.id === rentalId);
    if (!rental) return;

    try {
      await api.checklist.updateCarRental(rentalId, {
        provider: rental.provider,
        confirmationNumber: rental.confirmation_number,
        pickupDate: rental.pickup_date,
        returnDate: rental.return_date,
        notes: rental.notes,
        booked: !rental.booked,
        rentalType: rental.rental_type || 'group',
        assignedToId: rental.assigned_to_id || null,
        assignedToName: rental.assigned_to_name || null
      });
      onReload();
    } catch (error) {
      console.error('[CarRentalsSection] Error toggling rental:', error);
    }
  };

  return (
    <>
      <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Rental
        </button>
      </div>

      {/* Add New Rental Form */}
      {showAddForm && (
        <div className="border border-orange-200 rounded-lg p-4 mb-3 bg-orange-50">
          <h4 className="font-medium text-gray-900 mb-3">New Car Rental</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Rental Type */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Rental Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="newRentalType"
                    value="group"
                    checked={newRental.rental_type === 'group'}
                    onChange={(e) => setNewRental({ ...newRental, rental_type: 'group', assigned_to_id: null, assigned_to_name: null })}
                    className="text-orange-500 focus:ring-orange-500"
                  />
                  <Users className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-gray-700">Group Rental (Shared)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="newRentalType"
                    value="individual"
                    checked={newRental.rental_type === 'individual'}
                    onChange={(e) => setNewRental({ ...newRental, rental_type: 'individual' })}
                    className="text-orange-500 focus:ring-orange-500"
                  />
                  <UserIcon className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-gray-700">Individual Rental</span>
                </label>
              </div>
            </div>

            {/* Assigned Participant (only for individual rentals) */}
            {newRental.rental_type === 'individual' && (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Assign to Participant
                </label>
                <select
                  value={newRental.assigned_to_id || ''}
                  onChange={(e) => {
                    const participantId = e.target.value;
                    const participant = event.participants.find(p => p.id === participantId);
                    setNewRental({
                      ...newRental,
                      assigned_to_id: participantId || null,
                      assigned_to_name: participant?.name || null
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                >
                  <option value="">Select participant...</option>
                  {event.participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Provider
              </label>
              <input
                type="text"
                value={newRental.provider || ''}
                onChange={(e) => setNewRental({ ...newRental, provider: e.target.value })}
                placeholder="e.g., Enterprise, Hertz"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Confirmation Number
              </label>
              <input
                type="text"
                value={newRental.confirmation_number || ''}
                onChange={(e) => setNewRental({ ...newRental, confirmation_number: e.target.value })}
                placeholder="Reservation number"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Pickup Date
              </label>
              <input
                type="date"
                value={newRental.pickup_date || ''}
                onChange={(e) => setNewRental({ ...newRental, pickup_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Return Date
              </label>
              <input
                type="date"
                value={newRental.return_date || ''}
                onChange={(e) => setNewRental({ ...newRental, return_date: e.target.value })}
                min={newRental.pickup_date || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={newRental.notes || ''}
                onChange={(e) => setNewRental({ ...newRental, notes: e.target.value })}
                placeholder="Vehicle type, pickup/return locations, insurance, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm resize-none"
                rows={2}
              />
            </div>

            {/* Receipt Upload */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Receipt (Optional)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors">
                    <Receipt className="w-4 h-4 text-orange-600" />
                    <span className="text-sm text-gray-700">
                      {newRentalReceipt ? newRentalReceipt.name : 'Upload receipt (optional)'}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setNewRentalReceipt(file);
                    }}
                    className="hidden"
                  />
                </label>
                {newRentalReceipt && (
                  <button
                    onClick={() => setNewRentalReceipt(null)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove receipt"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Upload the rental receipt now to save time
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAddRental}
              disabled={saving[-1]}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving[-1] ? 'Saving...' : 'Add'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewRentalReceipt(null);
              }}
              disabled={saving[-1]}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing Rentals */}
      {checklist.carRentals.length === 0 ? (
        <p className="text-gray-500 text-sm">No car rentals added yet.</p>
      ) : (
        <div className="space-y-3">
          {checklist.carRentals
            .sort((a, b) => {
              // Unbooked rentals first, booked rentals last
              if (a.booked === b.booked) return 0;
              return a.booked ? 1 : -1;
            })
            .map(rental => {
            const editing = editingRentals[rental.id!];
            const currentData = editing || rental;
            const isModified = !!editing;

            return (
              <div
                key={rental.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleBooked(rental.id!)}
                      className="disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {rental.booked ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600 hover:scale-110 transition-transform" />
                      ) : (
                        <Circle className="w-6 h-6 text-gray-400 hover:text-gray-600 transition-colors" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{currentData.provider || 'Unnamed Rental'}</p>
                        {currentData.rental_type === 'individual' && currentData.assigned_to_name && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                            <UserIcon className="w-3 h-3" />
                            {currentData.assigned_to_name}
                          </span>
                        )}
                        {currentData.rental_type === 'group' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                            <Users className="w-3 h-3" />
                            Group
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isModified && (
                      <button
                        onClick={() => handleSave(rental.id!)}
                        disabled={saving[rental.id!]}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        Save
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteRental(rental.id!)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-9">
                  {/* Rental Type */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Rental Type
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`rentalType-${rental.id}`}
                          value="group"
                          checked={currentData.rental_type === 'group'}
                          onChange={(e) => {
                            handleFieldChange(rental.id!, 'rental_type', 'group');
                            handleFieldChange(rental.id!, 'assigned_to_id', null);
                            handleFieldChange(rental.id!, 'assigned_to_name', null);
                          }}
                          className="text-orange-500 focus:ring-orange-500"
                        />
                        <Users className="w-4 h-4 text-orange-600" />
                        <span className="text-sm text-gray-700">Group Rental (Shared)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`rentalType-${rental.id}`}
                          value="individual"
                          checked={currentData.rental_type === 'individual'}
                          onChange={(e) => handleFieldChange(rental.id!, 'rental_type', 'individual')}
                          className="text-orange-500 focus:ring-orange-500"
                        />
                        <UserIcon className="w-4 h-4 text-orange-600" />
                        <span className="text-sm text-gray-700">Individual Rental</span>
                      </label>
                    </div>
                  </div>

                  {/* Assigned Participant (only for individual rentals) */}
                  {currentData.rental_type === 'individual' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Assigned to Participant
                      </label>
                      <select
                        value={currentData.assigned_to_id || ''}
                        onChange={(e) => {
                          const participantId = e.target.value;
                          const participant = event.participants.find(p => p.id === participantId);
                          handleFieldChange(rental.id!, 'assigned_to_id', participantId || null);
                          handleFieldChange(rental.id!, 'assigned_to_name', participant?.name || null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                      >
                        <option value="">Select participant...</option>
                        {event.participants.map((participant) => (
                          <option key={participant.id} value={participant.id}>
                            {participant.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Provider
                    </label>
                    <input
                      type="text"
                      value={currentData.provider || ''}
                      onChange={(e) => handleFieldChange(rental.id!, 'provider', e.target.value)}
                      placeholder="e.g., Enterprise, Hertz"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Confirmation Number
                    </label>
                    <input
                      type="text"
                      value={currentData.confirmation_number || ''}
                      onChange={(e) => handleFieldChange(rental.id!, 'confirmation_number', e.target.value)}
                      placeholder="Reservation number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Pickup Date
                    </label>
                    <input
                      type="date"
                      value={currentData.pickup_date || ''}
                      onChange={(e) => handleFieldChange(rental.id!, 'pickup_date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Return Date
                    </label>
                    <input
                      type="date"
                      value={currentData.return_date || ''}
                      onChange={(e) => handleFieldChange(rental.id!, 'return_date', e.target.value)}
                      min={currentData.pickup_date || ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={currentData.notes || ''}
                      onChange={(e) => handleFieldChange(rental.id!, 'notes', e.target.value)}
                      placeholder="Vehicle type, pickup/return locations, insurance, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm resize-none"
                      rows={2}
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <button
                      onClick={() => setShowReceiptUpload(rental.id!)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors"
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
        section="car_rental"
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

