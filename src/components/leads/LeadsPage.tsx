/**
 * Leads - badge scanning and the captured lead list for one show.
 *
 * The company selector is required before scanning and is never silently
 * defaulted: it decides which Zoho CRM receives every lead in the session,
 * and a wrong default is discovered only after the show.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScanLine, Download } from 'lucide-react';
import { User } from '../../App';
import { api } from '../../utils/api';
import { badgeApi, BadgeScanRecord } from '../../utils/badgeApi';
import { usePicklists } from '../../contexts/PicklistContext';
import { BadgeScanner, ScannedBadge } from './BadgeScanner';
import { ScanReviewSheet } from './ScanReviewSheet';
import { LeadDetailModal } from './LeadDetailModal';
import { LeadList } from './LeadList';
import { useBadgeScans } from './hooks/useBadgeScans';
import { generateUUID } from '../../utils/uuid';
import { SelectMenu, SelectMenuOption } from '../common/SelectMenu';
import {
  LeadEvent, LEAD_ENTRY_GRACE_DAYS, isOpenForLeads, leadEventPhase, leadEventStatus,
  leadEventSummary, sortLeadEvents,
} from './leadEvents';

const LAST_COMPANY_KEY = 'argo.leads.lastCompany';

export const LeadsPage: React.FC<{ user: User }> = (/* user: reserved for a future lead-detail/edit view */) => {
  const { companies } = usePicklists();
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [entity, setEntity] = useState('');
  const [scanning, setScanning] = useState(false);
  const [pendingBadge, setPendingBadge] = useState<ScannedBadge | null>(null);
  const [selected, setSelected] = useState<BadgeScanRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const { scans, error, reload, saveScan } = useBadgeScans(eventId || null, entity || null);

  useEffect(() => {
    void api.getEvents().then((list: LeadEvent[]) => {
      const loaded = list ?? [];
      setEvents(loaded);
      // One show open for leads is the common case on the floor: pick it, so
      // the rep's first tap is the company. The company is still never defaulted.
      const open = loaded.filter((ev) => isOpenForLeads(leadEventPhase(ev)));
      if (open.length === 1) setEventId((current) => current || open[0].id);
    });
  }, []);

  // Only shows that can still take leads are offered by default. The rest stay
  // reachable behind "Show all events", because this page is also where an old
  // show's leads are viewed and exported.
  const sortedEvents = useMemo(() => sortLeadEvents(events), [events]);
  const hiddenCount = sortedEvents.filter((ev) => !isOpenForLeads(leadEventPhase(ev))).length;
  const eventOptions: SelectMenuOption[] = sortedEvents
    .filter((ev) => showAllEvents || ev.id === eventId || isOpenForLeads(leadEventPhase(ev)))
    .map((ev) => {
      const phase = leadEventPhase(ev);
      return {
        value: ev.id,
        label: ev.name,
        description: leadEventSummary(ev) || undefined,
        tag: leadEventStatus(ev) || undefined,
        tagEmphasis: phase === 'live',
      };
    });
  const selectedEvent = events.find((ev) => ev.id === eventId);
  const eventClosed = selectedEvent ? leadEventPhase(selectedEvent) === 'closed' : false;

  // Pre-select the last company used, but only as a highlight in the dropdown
  // the rep still has to confirm - never as an applied default.
  const lastUsed = useMemo(() => {
    try { return localStorage.getItem(`${LAST_COMPANY_KEY}.${eventId}`) ?? ''; } catch { return ''; }
  }, [eventId]);

  const selectedCompany = companies.find((c) => c.name === entity);
  const canScan = Boolean(eventId && entity) && !eventClosed;

  // The export route is authenticated, so the download must carry the token;
  // a plain link navigation 401s. See badgeApi.downloadExport.
  const handleExport = async () => {
    if (!eventId) return;
    setExporting(true);
    setExportError('');
    try {
      await badgeApi.downloadExport(eventId, 'xlsx');
    } catch (err) {
      console.error('[LeadsPage] Export failed:', err);
      setExportError('Export failed - please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async (contact: Record<string, string>, notes: string, andScanNext: boolean) => {
    if (!pendingBadge) return;
    await saveScan({
      rawPayload: pendingBadge.rawPayload,
      parserVersion: pendingBadge.parsed.parserVersion,
      parseConfidence: pendingBadge.parsed.confidence,
      barcodeFormat: pendingBadge.format,
      fields: pendingBadge.parsed.tokens,
      contact,
      notes,
      scannedAt: new Date().toISOString(),
    });
    try { localStorage.setItem(`${LAST_COMPANY_KEY}.${eventId}`, entity); } catch { /* private mode */ }
    setPendingBadge(null);
    setScanning(andScanNext);
    if (!andScanNext) void reload();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-stone-900">Leads</h1>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="text-sm">
          <span id="leads-event-label" className="mb-1 block text-stone-600">Event</span>
          <SelectMenu
            id="leads-event"
            labelledBy="leads-event-label"
            value={eventId}
            onChange={setEventId}
            options={eventOptions}
            placeholder="Select an event"
            emptyMessage="No shows are open for leads right now."
          />
          {hiddenCount > 0 && (
            <button
              type="button"
              aria-pressed={showAllEvents}
              onClick={() => setShowAllEvents((all) => !all)}
              className="mt-1 min-h-[44px] cursor-pointer text-sm text-brand-700 underline-offset-2 hover:underline sm:min-h-0"
            >
              {showAllEvents ? 'Show open events only' : `Show all events (${hiddenCount} more)`}
            </button>
          )}
        </div>

        <div className="text-sm">
          <span id="leads-company-label" className="mb-1 block text-stone-600">Company you are representing</span>
          <SelectMenu
            id="leads-company"
            labelledBy="leads-company-label"
            value={entity}
            onChange={setEntity}
            options={companies.map((c) => ({
              value: c.name,
              label: c.name,
              tag: c.name === lastUsed ? 'Last used' : undefined,
            }))}
            placeholder="Select a company"
          />
        </div>
      </div>

      {eventClosed && (
        <p className="mt-2 rounded-lg bg-stone-100 p-3 text-sm text-stone-700" role="status">
          {selectedEvent?.name} is closed for new leads: it ended more than {LEAD_ENTRY_GRACE_DAYS} days
          ago. Its leads can still be viewed, edited and exported.
        </p>
      )}

      {selectedCompany && !selectedCompany.zohoEnabled && (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Leads for {selectedCompany.name} are captured and exportable, but will not sync to
          Zoho CRM - no CRM is configured for this company.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setScanning(true)}
          disabled={!canScan}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          <ScanLine className="h-5 w-5" />
          Scan badge
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={!eventId || exporting}
          className="flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-3 disabled:opacity-40"
        >
          <Download className="h-5 w-5" />
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-amber-800">{error}</p>}
      {exportError && <p className="mt-3 text-sm text-red-700">{exportError}</p>}

      <div className="mt-4">
        <LeadList scans={scans} onSelect={setSelected} />
      </div>

      {scanning && (
        <BadgeScanner
          entity={entity}
          onCaptured={(badge) => { setScanning(false); setPendingBadge(badge); }}
          onManualEntry={() => {
            setScanning(false);
            // Ruling 1: a constant sentinel (e.g. literal 'MANUAL_ENTRY') would
            // collide in the backend's (event_id, entity, payload_hash) dedupe
            // key across every manually-entered lead for this event+company,
            // silently overwriting all but the last one. Each manual entry
            // must get its own unique payload.
            setPendingBadge({
              rawPayload: `MANUAL_ENTRY:${generateUUID()}`,
              format: 'Manual',
              parsed: { fields: {}, tokens: [], confidence: 0, parserVersion: 'manual' },
            });
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {pendingBadge && (
        <ScanReviewSheet
          entity={entity}
          badge={pendingBadge}
          duplicateOf={
            pendingBadge
              ? scans.find((s) => s.raw_payload === pendingBadge.rawPayload) ?? null
              : null
          }
          onSave={handleSave}
          onCancel={() => setPendingBadge(null)}
        />
      )}

      {selected && (
        <LeadDetailModal
          scan={selected}
          onSave={async (id, patch) => {
            await badgeApi.updateScan(id, patch as any);
            setSelected(null);
            void reload();
          }}
          onRetry={async (id) => {
            await badgeApi.retryPush(id);
            setSelected(null);
            void reload();
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};
