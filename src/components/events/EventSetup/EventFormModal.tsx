/**
 * EventFormModal Component
 * 
 * Modal form for creating and editing events.
 */

import React from 'react';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { User, TradeShow } from '../../../App';

interface EventFormData {
  name: string;
  venue: string;
  city: string;
  state: string;
  startDate: string;
  endDate: string;
  showStartDate: string;
  showEndDate: string;
  travelStartDate: string;
  travelEndDate: string;
  budget: string;
  participants: User[];
}

interface EventFormModalProps {
  user: User;
  allUsers: User[];
  showForm: boolean;
  isSaving: boolean;
  formData: EventFormData;
  setFormData: React.Dispatch<React.SetStateAction<EventFormData>>;
  editingEvent: TradeShow | null;
  selectedUserId: string;
  setSelectedUserId: React.Dispatch<React.SetStateAction<string>>;
  newParticipantName: string;
  setNewParticipantName: React.Dispatch<React.SetStateAction<string>>;
  newParticipantEmail: string;
  setNewParticipantEmail: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onAddParticipant: () => void;
  onAddCustomParticipant: () => void;
  onRemoveParticipant: (id: string) => void;
  onResetForm: () => void;
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  user,
  allUsers,
  showForm,
  isSaving,
  formData,
  setFormData,
  editingEvent,
  selectedUserId,
  setSelectedUserId,
  newParticipantName,
  setNewParticipantName,
  newParticipantEmail,
  setNewParticipantEmail,
  onClose,
  onSubmit,
  onAddParticipant,
  onAddCustomParticipant,
  onRemoveParticipant,
  onResetForm
}) => {

  if (!showForm) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="modal-sheet-h w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-t-xl rounded-b-none bg-white p-4 shadow-elevation-3 sm:rounded-xl md:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-8">
          <div>
            <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              {editingEvent ? 'Edit Event' : 'Create New Event'}
            </h2>
            <p className="mt-0.5 text-sm text-stone-500">Set up your trade show details and invite participants</p>
          </div>
          <button
            onClick={() => {
              onClose();
              onResetForm();
            }}
            className="btn-ghost tap-target p-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={onSubmit} className="space-y-8">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 lg:gap-6">
            <div>
              <label className="field-label">
                Event Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field px-4 py-3"
                placeholder="e.g., CES 2025"
              />
            </div>
            
            <div>
              <label className="field-label">
                Venue *
              </label>
              <input
                type="text"
                required
                value={formData.venue}
                onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                className="input-field px-4 py-3"
                placeholder="e.g., Las Vegas Convention Center"
              />
            </div>
            
            <div>
              <label className="field-label">
                City *
              </label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="input-field px-4 py-3"
                placeholder="e.g., Las Vegas"
              />
            </div>
            
            <div>
              <label className="field-label">
                State *
              </label>
              <input
                type="text"
                required
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="input-field px-4 py-3"
                placeholder="e.g., Nevada"
              />
            </div>
            
            {/* Show Dates */}
            <div className="md:col-span-2">
              <h3 className="mb-3 flex items-center border-t border-stone-100 pt-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                <span className="chip-dot mr-2 bg-brand-500"></span>
                Show Dates
              </h3>
            </div>
            
            <div>
              <label className="field-label">
                Show Start Date *
              </label>
              <input
                type="date"
                required
                value={formData.showStartDate}
                onChange={(e) => setFormData({ ...formData, showStartDate: e.target.value, startDate: e.target.value })}
                className="input-field px-4 py-3"
              />
            </div>
            
            <div>
              <label className="field-label">
                Show End Date *
              </label>
              <input
                type="date"
                required
                value={formData.showEndDate}
                min={formData.showStartDate}
                onChange={(e) => setFormData({ ...formData, showEndDate: e.target.value, endDate: e.target.value })}
                className="input-field px-4 py-3"
              />
              {formData.showStartDate && formData.showEndDate && formData.showEndDate < formData.showStartDate && (
                <p className="mt-1 text-sm text-red-600">Show end date cannot be before show start date</p>
              )}
            </div>

            {/* Travel Dates */}
            <div className="md:col-span-2">
              <h3 className="mb-3 mt-2 flex items-center border-t border-stone-100 pt-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                <span className="chip-dot mr-2 bg-accent-500"></span>
                Travel Dates
              </h3>
            </div>
            
            <div>
              <label className="field-label">
                Travel Start Date *
              </label>
              <input
                type="date"
                required
                value={formData.travelStartDate}
                onChange={(e) => setFormData({ ...formData, travelStartDate: e.target.value })}
                className="input-field px-4 py-3"
              />
            </div>
            
            <div>
              <label className="field-label">
                Travel End Date *
              </label>
              <input
                type="date"
                required
                value={formData.travelEndDate}
                min={formData.travelStartDate}
                onChange={(e) => setFormData({ ...formData, travelEndDate: e.target.value })}
                className="input-field px-4 py-3"
              />
              {formData.travelStartDate && formData.travelEndDate && formData.travelEndDate < formData.travelStartDate && (
                <p className="mt-1 text-sm text-red-600">Travel end date cannot be before travel start date</p>
              )}
            </div>
          </div>
          
          {/* Budget field - Admin, Developer and Accountant only */}
          {(user.role === 'admin' || user.role === 'developer' || user.role === 'accountant') && (
            <div>
              <label className="field-label">
                Budget (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                className="input-field px-4 py-3"
                placeholder="Enter budget amount"
              />
            </div>
          )}
          
          {/* Participants Section */}
          <div className="space-y-4">
            <h3 className="border-t border-stone-100 pt-6 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Participants</h3>
            
            <div className="space-y-4">
              <div>
                <label className="field-label">
                  Select from existing users
                </label>
                <div className="flex gap-3">
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="input-field flex-1 px-4 py-3"
                  >
                    <option value="">Select a user...</option>
                    {allUsers
                      .filter(u => !formData.participants.find(p => p.id === u.id))
                      .map(user => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={onAddParticipant}
                    disabled={!selectedUserId}
                    className="btn-primary min-h-[44px] px-4 sm:px-5 md:px-6"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-stone-500">Or add new participant</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newParticipantName}
                  onChange={(e) => setNewParticipantName(e.target.value)}
                  className="input-field px-4 py-3"
                  placeholder="Full name"
                />
                <input
                  type="email"
                  value={newParticipantEmail}
                  onChange={(e) => setNewParticipantEmail(e.target.value)}
                  className="input-field px-4 py-3"
                  placeholder="Email address"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onAddCustomParticipant}
                  disabled={!newParticipantName || !newParticipantEmail}
                  className="btn-secondary min-h-[44px] px-4 sm:px-5 md:px-6"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add New</span>
                </button>
              </div>
            </div>

            {(formData.participants?.length || 0) > 0 && (
              <div className="rounded-lg bg-stone-50/80 p-4 ring-1 ring-inset ring-stone-200/70">
                <div className="space-y-2">
                  {formData.participants.map((participant) => (
                    <div key={participant.id} className="flex flex-col items-start justify-between gap-3 rounded-lg bg-white p-3 shadow-elevation-1 ring-1 ring-stone-200/70 sm:flex-row sm:items-center sm:gap-0">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                          <span className="text-white text-sm font-medium">
                            {participant.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-stone-900">{participant.name}</p>
                          <p className="text-sm text-stone-500">{participant.email}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveParticipant(participant.id)}
                        className="tap-target rounded-lg p-2 text-stone-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Sticky on phones/tablets so Save stays reachable while the long form scrolls; lg: restores the original static bar */}
          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-stone-200 bg-white/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur md:-mx-6 md:px-6 lg:static lg:z-auto lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-6 lg:pb-0 lg:backdrop-blur-none">
            <button
              type="button"
              onClick={() => {
                onClose();
                onResetForm();
              }}
              className="btn-secondary min-h-[44px] flex-1 px-4 sm:flex-initial sm:px-5 md:px-6"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary flex-1 px-8 py-3 sm:flex-initial"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingEvent ? 'Update Event' : 'Create Event'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

