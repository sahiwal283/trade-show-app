/**
 * Deactivated users must not be assignable to new work — but the event update
 * path deletes every participant row and re-inserts it, so the guard has to
 * distinguish a new assignment from a re-insert of existing history.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/database/repositories', () => ({
  userRepository: { findById: vi.fn() },
}));

import { query } from '../../src/config/database';
import { processParticipants } from '../../src/services/EventParticipantService';

/** Route SELECT is_active reads to a per-user table; everything else inserts. */
function stubDb(activeById: Record<string, boolean>) {
  (query as any).mockImplementation((sql: string, params: any[]) => {
    if (sql.includes('SELECT is_active')) {
      const isActive = activeById[params[0]];
      return Promise.resolve({ rows: isActive === undefined ? [] : [{ is_active: isActive }] });
    }
    return Promise.resolve({ rows: [{ event_id: 'e1' }], rowCount: 1 });
  });
}

function insertedUserIds() {
  return (query as any).mock.calls
    .filter(([sql]: [string]) => sql.includes('INSERT INTO event_participants'))
    .map(([, params]: [string, any[]]) => params[1]);
}

describe('processParticipants deactivation guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds an active user', async () => {
    stubDb({ 'active-1': true });

    const added = await processParticipants('e1', undefined, ['active-1']);

    expect(added).toEqual(['active-1']);
    expect(insertedUserIds()).toEqual(['active-1']);
  });

  it('refuses to assign a deactivated user to an event', async () => {
    stubDb({ 'rita-1': false });

    const added = await processParticipants('e1', undefined, ['rita-1']);

    expect(added).toEqual([]);
    expect(insertedUserIds()).toEqual([]);
  });

  it('keeps a deactivated user who was already on the event', async () => {
    stubDb({ 'rita-1': false });

    const added = await processParticipants('e1', undefined, ['rita-1'], undefined, new Set(['rita-1']));

    expect(added).toEqual(['rita-1']);
    expect(insertedUserIds()).toEqual(['rita-1']);
    // Grandfathered ids skip the lookup entirely.
    expect((query as any).mock.calls.some(([sql]: [string]) => sql.includes('SELECT is_active'))).toBe(false);
  });

  it('drops only the deactivated member of a mixed batch', async () => {
    stubDb({ 'active-1': true, 'rita-1': false, 'active-2': true });

    const added = await processParticipants('e1', undefined, ['active-1', 'rita-1', 'active-2']);

    expect(added).toEqual(['active-1', 'active-2']);
  });

  it('treats an unknown user id as not assignable', async () => {
    stubDb({});

    const added = await processParticipants('e1', undefined, ['ghost-1']);

    expect(added).toEqual([]);
  });
});
