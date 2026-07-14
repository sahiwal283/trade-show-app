import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { User, TradeShow } from '../../App';
import { api } from '../../utils/api';
import { parseLocalDate } from '../../utils/dateUtils';
import { useEventData, useEventForm, useChecklistSummary, ChecklistSummary as ChecklistSummaryType } from './EventSetup/hooks';
import { EventFilters } from './EventSetup/EventFilters';
import { EventFormModal } from './EventSetup/EventFormModal';
import { EventList } from './EventSetup/EventList';
import { EventDetailsModal } from './EventSetup/EventDetailsModal';

interface EventSetupProps {
  user: User;
}

export const EventSetup: React.FC<EventSetupProps> = ({ user }) => {
  // Custom hooks for data fetching and form management
  const { events, allUsers, loading, loadError, reload } = useEventData();
  const {
    formData,
    setFormData,
    editingEvent,
    selectedUserId,
    setSelectedUserId,
    newParticipantName,
    setNewParticipantName,
    newParticipantEmail,
    setNewParticipantEmail,
    handleSubmit: submitForm,
    handleEdit,
    resetForm,
    addParticipant: addParticipantHook,
    addCustomParticipant,
    removeParticipant
  } = useEventForm();

  // UI state (keep these in component)
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'past'>('active');
  const [filterMode, setFilterMode] = useState<'all' | 'my'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<TradeShow | null>(null);
  
  // Use checklist hook
  const { checklistData, loadingChecklist, loadChecklistSummary } = useChecklistSummary();

  // Load checklist when viewing event details (refresh when modal opens)
  useEffect(() => {
    if (viewingEvent) {
      console.log('[EventSetup] Loading checklist for event:', viewingEvent.id);
      const participantCount = viewingEvent.participants?.length || 0;
      loadChecklistSummary(viewingEvent.id, participantCount);
    } else {
      // Clear checklist data when modal closes
      console.log('[EventSetup] Clearing checklist data (modal closed)');
    }
  }, [viewingEvent?.id, loadChecklistSummary]); // loadChecklistSummary is now stable via useCallback


  // Wrapper functions to handle hook integration
  const handleSubmit = async (e: React.FormEvent) => {
    if (isSaving) return; // Prevent duplicate submissions
    
    setIsSaving(true);
    try {
      await submitForm(e, user.id, async () => {
        await reload(); // Reload data after successful submission
        setShowForm(false);
      });
    } catch (error) {
      console.error('[EventSetup] Error saving event:', error);
      alert('Failed to save event. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (api.USE_SERVER) {
      await api.deleteEvent(eventId);
      await reload(); // Reload data after deletion
    }
  };

  const handleEditClick = (event: TradeShow) => {
    handleEdit(event);
    setShowForm(true);
  };

  const addParticipant = () => {
    addParticipantHook(allUsers);
  };

  // Filter events based on end date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter events based on user role and permissions
  const filteredEvents = events.filter(event => {
    // Admin & Developer can see all events for transparency, with filter option
    if (user.role === 'admin' || user.role === 'developer') {
      if (filterMode === 'all') {
        return true; // Show all events
      }
      // Show only events they're assigned to
      return event.participants.some(p => p.id === user.id);
    }
    // Coordinator can see all events (no filter needed, they manage everything)
    if (user.role === 'coordinator') {
      return true;
    }
    // Accountant can see all events for transparency, but can filter to "My Events"
    if (user.role === 'accountant') {
      if (filterMode === 'all') {
        return true; // Show all events
      }
      // Show only events they're assigned to
      return event.participants.some(p => p.id === user.id);
    }
    // Other users can only see events they're assigned to as participants
    return event.participants.some(p => p.id === user.id);
  });

  console.log('[EventSetup] Total events:', events.length);
  console.log('[EventSetup] After role filter:', filteredEvents.length);
  console.log('[EventSetup] Today:', today.toISOString());

  const activeEvents = filteredEvents.filter(event => {
    try {
      const endDate = parseLocalDate(event.endDate);
      console.log(`[EventSetup] Event "${event.name}": endDate=${event.endDate}, parsed=${endDate.toISOString()}, isActive=${endDate >= today}`);
      return endDate >= today;
    } catch (error) {
      console.error(`[EventSetup] Error parsing date for event "${event.name}":`, error);
      return false;
    }
  });

  const pastEvents = filteredEvents.filter(event => {
    try {
      const endDate = parseLocalDate(event.endDate);
      return endDate < today;
    } catch (error) {
      console.error(`[EventSetup] Error parsing date for event "${event.name}":`, error);
      return false;
    }
  });

  console.log('[EventSetup] Active events:', activeEvents.length);
  console.log('[EventSetup] Past events:', pastEvents.length);

  const displayedEvents = viewMode === 'active' ? activeEvents : pastEvents;

  // Only admins, developers, and coordinators can create/edit events
  const canManageEvents = user.role === 'admin' || user.role === 'developer' || user.role === 'coordinator';

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-lg border-l-4 border-red-400 bg-red-50 px-4 py-3 text-red-800 ring-1 ring-inset ring-red-200/70">
          <p className="font-semibold">Error Loading Events</p>
          <p className="text-sm mt-1">{loadError}</p>
          <p className="text-xs mt-2 text-red-600">Check browser console (F12) for more details</p>
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight text-gray-900">
            {user.role === 'coordinator' ? 'Event Management' : 'Events'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {user.role === 'coordinator'
              ? 'Create and manage trade show events' 
              : user.role === 'admin' || user.role === 'developer'
                ? 'View all events and participants, manage settings'
                : user.role === 'accountant'
                  ? 'View all events and participants for transparency'
                  : 'View events you are assigned to'}
          </p>
        </div>
        {canManageEvents && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary min-h-[44px] px-4 sm:px-5 md:px-6"
          >
            <Plus className="w-4 h-4" />
            <span>Create Event</span>
          </button>
        )}
      </div>

      <EventFilters
        user={user}
        viewMode={viewMode}
        setViewMode={setViewMode}
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        activeEventsCount={activeEvents.length}
        pastEventsCount={pastEvents.length}
      />

      <EventFormModal
        user={user}
        allUsers={allUsers}
        showForm={showForm}
        isSaving={isSaving}
        formData={formData}
        setFormData={setFormData}
        editingEvent={editingEvent}
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
        newParticipantName={newParticipantName}
        setNewParticipantName={setNewParticipantName}
        newParticipantEmail={newParticipantEmail}
        setNewParticipantEmail={setNewParticipantEmail}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmit}
        onAddParticipant={addParticipant}
        onAddCustomParticipant={addCustomParticipant}
        onRemoveParticipant={removeParticipant}
        onResetForm={resetForm}
      />

      {/* Events List */}
      <EventList
        events={displayedEvents}
        user={user}
        canManageEvents={canManageEvents}
        onViewDetails={setViewingEvent}
        onEdit={handleEditClick}
        onDelete={handleDelete}
      />

      {/* Event Details Modal */}
      {viewingEvent && (
        <EventDetailsModal
          event={viewingEvent}
          user={user}
          checklistData={checklistData}
          loadingChecklist={loadingChecklist}
          onClose={() => setViewingEvent(null)}
        />
      )}
    </div>
  );
};
