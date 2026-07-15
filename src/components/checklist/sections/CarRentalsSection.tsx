/**
 * CarRentalsSection — booking-board rows for existing rentals (provider ·
 * conf · dates · assigned-to) with inline expand-to-edit, plus the Add
 * Rental flow. All save/add/delete/toggle handlers and the receipt-to-
 * expense flow are unchanged.
 */

import React, { useState } from 'react';
import { Plus, Trash2, Save, Receipt } from 'lucide-react';
import { ChecklistData, CarRentalData } from '../TradeShowChecklist';
import { User, TradeShow } from '../../../App';
import { api } from '../../../utils/api';
import { getZohoExpenseDescriptionValidationMessage } from '../../../utils/zohoExpenseDescription';
import { ChecklistReceiptUpload } from '../ChecklistReceiptUpload';
import { CheckToggle, StatusChip, InlineAction } from '../ChecklistPrimitives';
import { BookingRow } from '../BookingRow';
import { joinSummary, formatDateRange } from '../bookingText';
import { CarRentalFields, CarRentalAddForm } from './CarRentalForm';

interface CarRentalsSectionProps {
  checklist: ChecklistData;
  user: User;
  event: TradeShow;
  onReload: () => void;
}

const EMPTY_RENTAL: CarRentalData = {
  provider: null,
  confirmation_number: null,
  pickup_date: null,
  return_date: null,
  notes: null,
  booked: false,
  rental_type: 'group',
  assigned_to_id: null,
  assigned_to_name: null,
};

export const CarRentalsSection: React.FC<CarRentalsSectionProps> = ({ checklist, user, event, onReload }) => {
  const [editingRentals, setEditingRentals] = useState<{ [key: number]: CarRentalData }>({});
  const [saving, setSaving] = useState<{ [key: number]: boolean }>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [showReceiptUpload, setShowReceiptUpload] = useState<number | null>(null);
  const [newRental, setNewRental] = useState<CarRentalData>(EMPTY_RENTAL);
  const [newRentalReceipt, setNewRentalReceipt] = useState<File | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

  const handleNewRentalChange = <K extends keyof CarRentalData>(
    field: K,
    value: CarRentalData[K]
  ) => {
    setNewRental(prev => ({ ...prev, [field]: value }));
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
      setNewRental(EMPTY_RENTAL);
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
      <div className="p-4 sm:p-5">
        {/* Section actions */}
        {!showAddForm && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 lg:min-h-0"
            >
              <Plus aria-hidden="true" className="w-4 h-4" />
              Add Rental
            </button>
          </div>
        )}

        {/* Add new rental */}
        {showAddForm && (
          <CarRentalAddForm
            data={newRental}
            participants={event.participants}
            receipt={newRentalReceipt}
            onReceiptChange={setNewRentalReceipt}
            saving={!!saving[-1]}
            onChange={handleNewRentalChange}
            onSubmit={handleAddRental}
            onCancel={() => {
              setShowAddForm(false);
              setNewRentalReceipt(null);
            }}
          />
        )}

        {/* Existing rentals */}
        {checklist.carRentals.length === 0 ? (
          <p className="text-sm text-stone-500">No car rentals added yet.</p>
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
                const expanded = expandedId === rental.id;

                const summary = joinSummary([
                  rental.confirmation_number ? `Conf ${rental.confirmation_number}` : null,
                  formatDateRange(rental.pickup_date, rental.return_date),
                  rental.rental_type === 'individual'
                    ? rental.assigned_to_name || 'Unassigned'
                    : 'Group',
                ]);

                return (
                  <BookingRow
                    key={rental.id}
                    toggle={
                      <CheckToggle
                        checked={!!rental.booked}
                        onToggle={() => toggleBooked(rental.id!)}
                        label={`Mark rental ${rental.provider || ''} as ${rental.booked ? 'not booked' : 'booked'}`}
                      />
                    }
                    title={currentData.provider || 'Unnamed Rental'}
                    summary={summary}
                    status={
                      isModified ? (
                        <button
                          type="button"
                          onClick={() => handleSave(rental.id!)}
                          disabled={saving[rental.id!]}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 lg:min-h-0"
                        >
                          <Save aria-hidden="true" className="w-4 h-4" />
                          Save
                        </button>
                      ) : (
                        <StatusChip done={!!rental.booked} />
                      )
                    }
                    trailing={
                      <button
                        type="button"
                        onClick={() => handleDeleteRental(rental.id!)}
                        aria-label={`Delete rental ${rental.provider || ''}`}
                        className="tap-target rounded-lg p-1.5 text-red-600 transition-colors hover:bg-red-50"
                      >
                        <Trash2 aria-hidden="true" className="w-4 h-4" />
                      </button>
                    }
                    expanded={expanded}
                    onToggleExpand={() => setExpandedId(expanded ? null : rental.id!)}
                    expandLabel={`${expanded ? 'Close' : 'Edit'} rental details for ${rental.provider || 'unnamed rental'}`}
                    contentId={`car-rental-row-${rental.id}`}
                  >
                    <CarRentalFields
                      data={currentData}
                      participants={event.participants}
                      radioName={`rentalType-${rental.id}`}
                      onChange={(field, value) => handleFieldChange(rental.id!, field, value)}
                    />

                    <div className="-ml-2.5 mt-3">
                      <InlineAction
                        icon={Receipt}
                        label="Upload Receipt"
                        onClick={() => setShowReceiptUpload(rental.id!)}
                      />
                    </div>
                  </BookingRow>
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
