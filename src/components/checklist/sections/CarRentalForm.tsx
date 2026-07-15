/**
 * CarRentalForm — the rental field grid shared by the booking-board edit
 * rows and the Add Rental flow, plus the Add Rental card itself. Pure
 * presentation: CarRentalsSection owns state, saving, and API calls.
 */

import React from 'react';
import { Receipt, Users, User as UserIcon, X } from 'lucide-react';
import { CarRentalData } from '../TradeShowChecklist';
import { User } from '../../../App';
import { FieldLabel } from '../ChecklistPrimitives';

type RentalFieldChange = <K extends keyof CarRentalData>(
  field: K,
  value: CarRentalData[K]
) => void;

interface CarRentalFieldsProps {
  data: CarRentalData;
  participants: User[];
  /** Unique radio group name, e.g. `rentalType-12` or `newRentalType`. */
  radioName: string;
  onChange: RentalFieldChange;
}

export const CarRentalFields: React.FC<CarRentalFieldsProps> = ({
  data,
  participants,
  radioName,
  onChange,
}) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {/* Rental type */}
    <div className="md:col-span-2">
      <FieldLabel>Rental Type</FieldLabel>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 lg:min-h-0">
          <input
            type="radio"
            name={radioName}
            value="group"
            checked={data.rental_type === 'group'}
            onChange={() => {
              onChange('rental_type', 'group');
              onChange('assigned_to_id', null);
              onChange('assigned_to_name', null);
            }}
            className="text-brand-600 focus:ring-brand-500"
          />
          <Users aria-hidden="true" className="w-4 h-4 text-stone-500" />
          <span className="text-sm text-stone-700">Group Rental (Shared)</span>
        </label>
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 lg:min-h-0">
          <input
            type="radio"
            name={radioName}
            value="individual"
            checked={data.rental_type === 'individual'}
            onChange={() => onChange('rental_type', 'individual')}
            className="text-brand-600 focus:ring-brand-500"
          />
          <UserIcon aria-hidden="true" className="w-4 h-4 text-stone-500" />
          <span className="text-sm text-stone-700">Individual Rental</span>
        </label>
      </div>
    </div>

    {/* Assigned participant (individual rentals only) */}
    {data.rental_type === 'individual' && (
      <div className="md:col-span-2">
        <FieldLabel>Assigned to Participant</FieldLabel>
        <select
          value={data.assigned_to_id || ''}
          onChange={(e) => {
            const participantId = e.target.value;
            const participant = participants.find(p => p.id === participantId);
            onChange('assigned_to_id', participantId || null);
            onChange('assigned_to_name', participant?.name || null);
          }}
          className="input-field"
        >
          <option value="">Select participant...</option>
          {participants.map(participant => (
            <option key={participant.id} value={participant.id}>
              {participant.name}
            </option>
          ))}
        </select>
      </div>
    )}

    <div>
      <FieldLabel>Provider</FieldLabel>
      <input
        type="text"
        value={data.provider || ''}
        onChange={(e) => onChange('provider', e.target.value)}
        placeholder="e.g., Enterprise, Hertz"
        className="input-field"
      />
    </div>

    <div>
      <FieldLabel>Confirmation Number</FieldLabel>
      <input
        type="text"
        value={data.confirmation_number || ''}
        onChange={(e) => onChange('confirmation_number', e.target.value)}
        placeholder="Reservation number"
        className="input-field"
      />
    </div>

    <div>
      <FieldLabel>Pickup Date</FieldLabel>
      <input
        type="date"
        value={data.pickup_date || ''}
        onChange={(e) => onChange('pickup_date', e.target.value)}
        className="input-field"
      />
    </div>

    <div>
      <FieldLabel>Return Date</FieldLabel>
      <input
        type="date"
        value={data.return_date || ''}
        onChange={(e) => onChange('return_date', e.target.value)}
        min={data.pickup_date || ''}
        className="input-field"
      />
    </div>

    <div className="md:col-span-2">
      <FieldLabel>Notes</FieldLabel>
      <textarea
        value={data.notes || ''}
        onChange={(e) => onChange('notes', e.target.value)}
        placeholder="Vehicle type, pickup/return locations, insurance, etc."
        className="input-field resize-none"
        rows={2}
      />
    </div>
  </div>
);

interface CarRentalAddFormProps {
  data: CarRentalData;
  participants: User[];
  receipt: File | null;
  onReceiptChange: (file: File | null) => void;
  saving: boolean;
  onChange: RentalFieldChange;
  onSubmit: () => void;
  onCancel: () => void;
}

export const CarRentalAddForm: React.FC<CarRentalAddFormProps> = ({
  data,
  participants,
  receipt,
  onReceiptChange,
  saving,
  onChange,
  onSubmit,
  onCancel,
}) => (
  <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3 sm:p-4">
    <p className="micro-label mb-3">New car rental</p>

    <CarRentalFields
      data={data}
      participants={participants}
      radioName="newRentalType"
      onChange={onChange}
    />

    {/* Optional receipt */}
    <div className="mt-3">
      <FieldLabel>Receipt (Optional)</FieldLabel>
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1 cursor-pointer">
          <span className="flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-dashed border-stone-300 bg-white px-3 py-2 transition-colors hover:border-brand-400 hover:bg-brand-50 lg:min-h-0">
            <Receipt aria-hidden="true" className="w-4 h-4 shrink-0 text-brand-600" />
            <span className="truncate text-sm text-stone-700">
              {receipt ? receipt.name : 'Upload receipt (optional)'}
            </span>
          </span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onReceiptChange(file);
            }}
            className="hidden"
          />
        </label>
        {receipt && (
          <button
            type="button"
            onClick={() => onReceiptChange(null)}
            title="Remove receipt"
            className="tap-target rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-stone-500">Upload the rental receipt now to save time</p>
    </div>

    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={onSubmit}
        disabled={saving}
        className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-0"
      >
        {saving ? 'Saving...' : 'Add'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="inline-flex min-h-[44px] items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50 lg:min-h-0"
      >
        Cancel
      </button>
    </div>
  </div>
);
