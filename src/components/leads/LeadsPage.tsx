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
import { LeadList } from './LeadList';
import { useBadgeScans } from './hooks/useBadgeScans';
import { generateUUID } from '../../utils/uuid';

const LAST_COMPANY_KEY = 'argo.leads.lastCompany';

export const LeadsPage: React.FC<{ user: User }> = (/* user: reserved for a future lead-detail/edit view */) => {
  const { companies } = usePicklists();
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [eventId, setEventId] = useState('');
  const [entity, setEntity] = useState('');
  const [scanning, setScanning] = useState(false);
  const [pendingBadge, setPendingBadge] = useState<ScannedBadge | null>(null);
  // Tracks the selected lead for a future detail/edit view (not in scope for
  // this task); required now so LeadList's onSelect contract has a consumer.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selected, setSelected] = useState<BadgeScanRecord | null>(null);

  const { scans, error, reload, saveScan } = useBadgeScans(eventId || null, entity || null);

  useEffect(() => {
    void api.getEvents().then((list: any[]) => setEvents(list ?? []));
  }, []);

  // Pre-select the last company used, but only as a highlight in the dropdown
  // the rep still has to confirm - never as an applied default.
  const lastUsed = useMemo(() => {
    try { return localStorage.getItem(`${LAST_COMPANY_KEY}.${eventId}`) ?? ''; } catch { return ''; }
  }, [eventId]);

  const selectedCompany = companies.find((c) => c.name === entity);
  const canScan = Boolean(eventId && entity);

  const handleSave = async (contact: Record<string, string>, notes: string, andScanNext: boolean) => {
    if (!pendingBadge) return;
    await saveScan({
      rawPayload: pendingBadge.rawPayload,
      parserVersion: pendingBadge.parsed.parserVersion,
      parseConfidence: pendingBadge.parsed.confidence,
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
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">Event</span>
          <select
            aria-label="Event"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          >
            <option value="">Select an event</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-stone-600">Company you are representing</span>
          <select
            aria-label="Company"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
          >
            <option value="">Select a company</option>
            {companies.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}{c.name === lastUsed ? ' (last used)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

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
        <a
          href={eventId ? badgeApi.exportUrl(eventId, 'xlsx') : undefined}
          aria-disabled={!eventId}
          className="flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-3"
        >
          <Download className="h-5 w-5" />
          Export
        </a>
      </div>

      {error && <p className="mt-3 text-sm text-amber-800">{error}</p>}

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
          duplicateOf={null}
          onSave={handleSave}
          onCancel={() => setPendingBadge(null)}
        />
      )}
    </div>
  );
};
