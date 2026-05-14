import { pool, query } from '../../config/database';
import { eventRepository } from '../../database/repositories';
import { telegramClient, InlineKeyboard } from './TelegramClient';
import { notifyParticipantsAdded } from './TelegramNotifications';

const ALLOWED_ROLES = new Set(['admin', 'coordinator', 'developer']);
const PARTICIPANT_PAGE_SIZE = 20;
const PARTICIPANT_MAX_USERS = 200;

interface TelegramFrom {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: TelegramFrom;
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramFrom;
  data?: string;
  message?: TelegramMessage;
}

interface DraftRow {
  id: string;
  user_id: string;
  telegram_user_id: string;
  chat_id: string;
  prompt_message_id: string | null;
  event_id: string | null;
  name: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: string | null;
  participant_user_ids: any;
  search_query: string | null;
  status: string;
}

interface LinkedUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

function formatDateOnly(value: any): string {
  if (!value) return '—';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const yy = m[1];
    const mm = m[2].padStart(2, '0');
    const dd = m[3].padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    const mm = m2[1].padStart(2, '0');
    const dd = m2[2].padStart(2, '0');
    const yy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}

function parseCityState(raw: string): { city: string; state: string } | null {
  const s = raw.trim();
  if (!s) return null;
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[0];
    const state = parts[1].toUpperCase().slice(0, 8);
    if (city.length > 0 && state.length >= 2) return { city, state };
  }
  const m = s.match(/^(.+)\s+([A-Za-z]{2,4})$/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  return null;
}

function normalizeParticipantIds(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string');
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getLinkedUser(telegramUserId: number): Promise<LinkedUser | null> {
  const result = await query(
    `SELECT u.id, u.name, u.email, u.role
     FROM telegram_links tl
     JOIN users u ON u.id = tl.user_id
     WHERE tl.telegram_user_id = $1
     LIMIT 1`,
    [telegramUserId]
  );
  return (result.rows[0] as LinkedUser) || null;
}

async function loadDraft(draftId: string): Promise<DraftRow | null> {
  const result = await query(
    `SELECT * FROM telegram_event_drafts WHERE id = $1 LIMIT 1`,
    [draftId]
  );
  return (result.rows[0] as DraftRow) || null;
}

async function findLatestActiveDraft(telegramUserId: number): Promise<DraftRow | null> {
  const result = await query(
    `SELECT * FROM telegram_event_drafts
     WHERE telegram_user_id = $1
       AND status NOT IN ('created', 'cancelled', 'failed')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [telegramUserId]
  );
  return (result.rows[0] as DraftRow) || null;
}

async function updateDraft(draftId: string, patch: Record<string, any>): Promise<void> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`);
  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  await query(
    `UPDATE telegram_event_drafts SET ${setClauses.join(', ')} WHERE id = $1`,
    [draftId, ...keys.map((k) => patch[k])]
  );
}

function draftSummary(draft: DraftRow, participantNames: string[]): string {
  const lines: string[] = ['New trade show event', ''];
  lines.push(`Name: ${draft.name || '—'}`);
  lines.push(`Venue: ${draft.venue || '—'}`);
  lines.push(
    `Location: ${draft.city && draft.state ? `${draft.city}, ${draft.state}` : '—'}`
  );
  lines.push(`Start date: ${formatDateOnly(draft.start_date)}`);
  lines.push(`End date: ${formatDateOnly(draft.end_date)}`);
  lines.push(`Budget: ${draft.budget ? `$${parseFloat(draft.budget).toFixed(2)}` : '—'}`);
  lines.push(
    `Participants: ${participantNames.length > 0 ? participantNames.join(', ') : 'none yet'}`
  );
  return lines.join('\n');
}

function confirmationKeyboard(draftId: string, created: boolean): InlineKeyboard {
  const rows: InlineKeyboard = [];
  if (!created) {
    rows.push([{ text: 'Confirm & create event', callback_data: `evt:${draftId}:confirm` }]);
  }
  rows.push([
    { text: created ? 'Add more participants' : 'Add participants', callback_data: `evt:${draftId}:addppl` },
  ]);
  if (!created) {
    rows.push([
      { text: 'Edit name', callback_data: `evt:${draftId}:edit:name` },
      { text: 'Edit venue', callback_data: `evt:${draftId}:edit:venue` },
    ]);
    rows.push([
      { text: 'Edit city/state', callback_data: `evt:${draftId}:edit:city_state` },
      { text: 'Edit budget', callback_data: `evt:${draftId}:edit:budget` },
    ]);
    rows.push([
      { text: 'Edit start date', callback_data: `evt:${draftId}:edit:start_date` },
      { text: 'Edit end date', callback_data: `evt:${draftId}:edit:end_date` },
    ]);
  }
  rows.push([
    { text: created ? 'Done' : 'Cancel', callback_data: `evt:${draftId}:${created ? 'done' : 'cancel'}` },
  ]);
  return rows;
}

async function loadParticipantNames(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const result = await query(
    `SELECT id, name FROM users WHERE id = ANY($1::uuid[]) ORDER BY name ASC`,
    [ids]
  );
  return (result.rows as Array<{ id: string; name: string }>).map((r) => r.name);
}

async function listSelectableUsers(): Promise<LinkedUser[]> {
  const result = await query(
    `SELECT id, name, email, role
     FROM users
     WHERE role <> 'pending'
     ORDER BY LOWER(name) ASC
     LIMIT ${PARTICIPANT_MAX_USERS}`
  );
  return result.rows as LinkedUser[];
}

async function renderDraftPrompt(draft: DraftRow): Promise<void> {
  const chatId = Number(draft.chat_id);
  const participantIds = normalizeParticipantIds(draft.participant_user_ids);
  const participantNames = await loadParticipantNames(participantIds);
  const text = draftSummary(draft, participantNames);
  const created = Boolean(draft.event_id);
  const keyboard = confirmationKeyboard(draft.id, created);
  await sendOrEditPrompt(draft, text, keyboard);
}

async function sendOrEditPrompt(
  draft: DraftRow,
  text: string,
  keyboard: InlineKeyboard
): Promise<void> {
  const chatId = Number(draft.chat_id);
  if (draft.prompt_message_id) {
    try {
      await telegramClient.editMessageText(
        chatId,
        Number(draft.prompt_message_id),
        text,
        { replyMarkup: { inline_keyboard: keyboard } }
      );
      return;
    } catch (error: any) {
      console.warn('[TelegramEvent] editMessageText failed, sending new message:', error.message);
    }
  }
  const sent = await telegramClient.sendMessage(chatId, text, {
    replyMarkup: { inline_keyboard: keyboard },
  });
  if (sent?.message_id) {
    await updateDraft(draft.id, { prompt_message_id: sent.message_id });
  }
}

function stepPrompt(status: string): string | null {
  switch (status) {
    case 'awaiting_name':
      return 'Enter the event name (e.g., "Champs Las Vegas 2026"). Send /cancel to abort.';
    case 'awaiting_venue':
      return 'Enter the venue (e.g., "Las Vegas Convention Center").';
    case 'awaiting_city_state':
      return 'Enter city and state (e.g., "Las Vegas, NV").';
    case 'awaiting_start_date':
      return 'Enter the start date (YYYY-MM-DD or MM/DD/YYYY).';
    case 'awaiting_end_date':
      return 'Enter the end date (YYYY-MM-DD or MM/DD/YYYY).';
    case 'awaiting_budget':
      return 'Enter the budget in USD (just the number, e.g., 5000). Send 0 for no budget.';
    case 'awaiting_participant_search':
      return 'Tap a user to add/remove them. Tap Done when finished.';
    default:
      return null;
  }
}

async function renderParticipantPicker(draft: DraftRow, page: number = 0): Promise<void> {
  const participantIds = normalizeParticipantIds(draft.participant_user_ids);
  const participantNames = await loadParticipantNames(participantIds);
  const selectedSet = new Set(participantIds);

  const users = await listSelectableUsers();
  const totalPages = Math.max(1, Math.ceil(users.length / PARTICIPANT_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * PARTICIPANT_PAGE_SIZE;
  const slice = users.slice(start, start + PARTICIPANT_PAGE_SIZE);

  const header: string[] = [];
  header.push(
    `Event: ${draft.name || '(unnamed)'}${draft.city ? ` — ${draft.city}${draft.state ? `, ${draft.state}` : ''}` : ''}`
  );
  header.push(
    `Participants (${participantNames.length}): ${participantNames.length ? participantNames.join(', ') : 'none yet'}`
  );
  header.push('');
  header.push('Tap to add/remove. Tap Done when finished.');
  if (totalPages > 1) {
    header.push(`Page ${safePage + 1}/${totalPages}`);
  }

  const rows: InlineKeyboard = [];
  for (const u of slice) {
    const isOn = selectedSet.has(u.id);
    const shortId = u.id.slice(0, 8);
    rows.push([
      {
        text: `${isOn ? '✓ ' : ''}${u.name} — ${u.role}`,
        callback_data: `evt:${draft.id}:ppl:${shortId}`,
      },
    ]);
  }

  if (totalPages > 1) {
    const nav: InlineKeyboard[number] = [];
    if (safePage > 0) {
      nav.push({ text: '‹ Prev', callback_data: `evt:${draft.id}:ppg:${safePage - 1}` });
    }
    if (safePage < totalPages - 1) {
      nav.push({ text: 'Next ›', callback_data: `evt:${draft.id}:ppg:${safePage + 1}` });
    }
    if (nav.length > 0) rows.push(nav);
  }

  rows.push([
    { text: 'Done', callback_data: `evt:${draft.id}:pdone` },
    { text: 'Back', callback_data: `evt:${draft.id}:back` },
  ]);

  await sendOrEditPrompt(draft, header.join('\n'), rows);
}

async function resolveParticipantFromShortId(shortId: string): Promise<string | null> {
  const users = await listSelectableUsers();
  const match = users.find((u) => u.id.startsWith(shortId));
  return match ? match.id : null;
}

async function createEventFromDraft(draft: DraftRow): Promise<{ eventId: string; newlyAddedIds: string[] }> {
  if (!draft.name || !draft.venue || !draft.city || !draft.state || !draft.start_date || !draft.end_date) {
    throw new Error('Draft is incomplete.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await eventRepository.create({
      name: draft.name,
      venue: draft.venue,
      city: draft.city,
      state: draft.state,
      start_date: draft.start_date,
      end_date: draft.end_date,
      show_start_date: draft.start_date,
      show_end_date: draft.end_date,
      travel_start_date: draft.start_date,
      travel_end_date: draft.end_date,
      budget: draft.budget ? parseFloat(draft.budget) : 0,
      coordinator_id: draft.user_id,
    });
    const ids = normalizeParticipantIds(draft.participant_user_ids);
    const newlyAddedIds: string[] = [];
    for (const uid of ids) {
      const insertResult = await client.query(
        `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`,
        [event.id, uid]
      );
      if ((insertResult as any).rowCount > 0) newlyAddedIds.push(uid);
    }
    await client.query('COMMIT');
    return { eventId: event.id, newlyAddedIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const telegramEventService = {
  async startNewEvent(message: TelegramMessage): Promise<void> {
    const from = message.from;
    if (!from) return;
    const chatId = message.chat.id;
    const user = await getLinkedUser(from.id);
    if (!user) {
      await telegramClient.sendMessage(
        chatId,
        'Link your account first: open the app → Account → Connect Telegram.'
      );
      return;
    }
    if (!ALLOWED_ROLES.has(user.role)) {
      await telegramClient.sendMessage(
        chatId,
        `Only admin, coordinator, or developer roles can create events. Your role is "${user.role}".`
      );
      return;
    }

    await query(
      `UPDATE telegram_event_drafts
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE telegram_user_id = $1
         AND status NOT IN ('created', 'cancelled', 'failed')`,
      [from.id]
    );

    const insertResult = await query(
      `INSERT INTO telegram_event_drafts (user_id, telegram_user_id, chat_id, status)
       VALUES ($1, $2, $3, 'awaiting_name')
       RETURNING id`,
      [user.id, from.id, chatId]
    );
    const draftId = (insertResult.rows[0] as { id: string }).id;

    const sent = await telegramClient.sendMessage(
      chatId,
      'Creating a new trade show event.\n\n' + (stepPrompt('awaiting_name') || '')
    );
    if (sent?.message_id) {
      await updateDraft(draftId, { prompt_message_id: sent.message_id });
    }
  },

  async handleText(message: TelegramMessage): Promise<boolean> {
    const from = message.from;
    const text = (message.text || '').trim();
    if (!from || !text) return false;

    const draft = await findLatestActiveDraft(from.id);
    if (!draft) return false;

    const chatId = message.chat.id;

    if (/^\/cancel\b/i.test(text)) {
      await updateDraft(draft.id, { status: 'cancelled' });
      await telegramClient.sendMessage(chatId, 'Event creation cancelled.');
      return true;
    }

    switch (draft.status) {
      case 'awaiting_name': {
        if (text.length < 2 || text.length > 200) {
          await telegramClient.sendMessage(chatId, 'Name must be 2-200 characters.');
          return true;
        }
        await updateDraft(draft.id, { name: text, status: 'awaiting_venue' });
        await telegramClient.sendMessage(chatId, stepPrompt('awaiting_venue') || '');
        return true;
      }
      case 'awaiting_venue': {
        if (text.length < 2 || text.length > 200) {
          await telegramClient.sendMessage(chatId, 'Venue must be 2-200 characters.');
          return true;
        }
        await updateDraft(draft.id, { venue: text, status: 'awaiting_city_state' });
        await telegramClient.sendMessage(chatId, stepPrompt('awaiting_city_state') || '');
        return true;
      }
      case 'awaiting_city_state': {
        const parsed = parseCityState(text);
        if (!parsed) {
          await telegramClient.sendMessage(chatId, 'Please use the format "City, ST" (e.g., "Las Vegas, NV").');
          return true;
        }
        await updateDraft(draft.id, {
          city: parsed.city,
          state: parsed.state,
          status: 'awaiting_start_date',
        });
        await telegramClient.sendMessage(chatId, stepPrompt('awaiting_start_date') || '');
        return true;
      }
      case 'awaiting_start_date': {
        const d = parseDate(text);
        if (!d) {
          await telegramClient.sendMessage(chatId, 'Invalid date. Use YYYY-MM-DD or MM/DD/YYYY.');
          return true;
        }
        await updateDraft(draft.id, { start_date: d, status: 'awaiting_end_date' });
        await telegramClient.sendMessage(chatId, stepPrompt('awaiting_end_date') || '');
        return true;
      }
      case 'awaiting_end_date': {
        const d = parseDate(text);
        if (!d) {
          await telegramClient.sendMessage(chatId, 'Invalid date. Use YYYY-MM-DD or MM/DD/YYYY.');
          return true;
        }
        if (draft.start_date && d < draft.start_date) {
          await telegramClient.sendMessage(chatId, 'End date must be on or after the start date.');
          return true;
        }
        await updateDraft(draft.id, { end_date: d, status: 'awaiting_budget' });
        await telegramClient.sendMessage(chatId, stepPrompt('awaiting_budget') || '');
        return true;
      }
      case 'awaiting_budget': {
        const n = parseFloat(text.replace(/[^\d.-]/g, ''));
        if (!isFinite(n) || n < 0) {
          await telegramClient.sendMessage(chatId, 'Budget must be a non-negative number.');
          return true;
        }
        await updateDraft(draft.id, {
          budget: Math.round(n * 100) / 100,
          status: 'awaiting_confirmation',
        });
        const fresh = await loadDraft(draft.id);
        if (fresh) {
          fresh.prompt_message_id = null;
          await renderDraftPrompt(fresh);
        }
        return true;
      }
      case 'awaiting_participant_search': {
        await telegramClient.sendMessage(
          chatId,
          'Use the buttons to toggle participants, then tap Done.'
        );
        return true;
      }
    }
    return false;
  },

  async handleCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
    const data = cb.data || '';
    const parts = data.split(':');
    if (parts[0] !== 'evt' || parts.length < 3) {
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }
    const draftId = parts[1];
    const action = parts[2];
    const param = parts[3];

    const draft = await loadDraft(draftId);
    if (!draft) {
      await telegramClient.answerCallbackQuery(cb.id, 'Session expired.');
      return;
    }

    const user = await getLinkedUser(cb.from.id);
    if (!user || user.id !== draft.user_id) {
      await telegramClient.answerCallbackQuery(cb.id, 'Not your draft.');
      return;
    }

    if (action === 'cancel') {
      await updateDraft(draftId, { status: 'cancelled' });
      if (draft.prompt_message_id) {
        await telegramClient.editMessageText(
          Number(draft.chat_id),
          Number(draft.prompt_message_id),
          'Cancelled. No event was created.'
        );
      }
      await telegramClient.answerCallbackQuery(cb.id, 'Cancelled');
      return;
    }

    if (action === 'done') {
      if (draft.prompt_message_id) {
        const ids = normalizeParticipantIds(draft.participant_user_ids);
        const names = await loadParticipantNames(ids);
        await telegramClient.editMessageText(
          Number(draft.chat_id),
          Number(draft.prompt_message_id),
          [
            `Event "${draft.name}" is ready.`,
            `Location: ${draft.city}, ${draft.state}`,
            `Dates: ${formatDateOnly(draft.start_date)} → ${formatDateOnly(draft.end_date)}`,
            `Participants (${names.length}): ${names.length ? names.join(', ') : 'none'}`,
          ].join('\n')
        );
      }
      await telegramClient.answerCallbackQuery(cb.id, 'Done');
      return;
    }

    if (action === 'edit' && param) {
      const map: Record<string, string> = {
        name: 'awaiting_name',
        venue: 'awaiting_venue',
        city_state: 'awaiting_city_state',
        start_date: 'awaiting_start_date',
        end_date: 'awaiting_end_date',
        budget: 'awaiting_budget',
      };
      const newStatus = map[param];
      if (!newStatus) {
        await telegramClient.answerCallbackQuery(cb.id);
        return;
      }
      await updateDraft(draftId, { status: newStatus });
      await telegramClient.sendMessage(
        Number(draft.chat_id),
        stepPrompt(newStatus) || 'Send the new value.'
      );
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    if (action === 'confirm') {
      if (draft.event_id) {
        await telegramClient.answerCallbackQuery(cb.id, 'Already created.');
        return;
      }
      try {
        const { eventId, newlyAddedIds } = await createEventFromDraft(draft);
        await updateDraft(draftId, {
          event_id: eventId,
          status: 'awaiting_participant_search',
          search_query: null,
        });
        if (newlyAddedIds.length > 0) {
          notifyParticipantsAdded(eventId, newlyAddedIds);
        }
        const fresh = await loadDraft(draftId);
        if (fresh) {
          fresh.prompt_message_id = null;
          await telegramClient.sendMessage(
            Number(draft.chat_id),
            `Event "${draft.name}" created. You can now add more participants, or tap Done.`
          );
          await renderParticipantPicker(fresh, 0);
        }
        await telegramClient.answerCallbackQuery(cb.id, 'Created');
      } catch (error: any) {
        console.error('[TelegramEvent] createEvent failed:', error);
        await updateDraft(draftId, { last_error: error.message });
        await telegramClient.answerCallbackQuery(cb.id, 'Failed to create');
        await telegramClient.sendMessage(
          Number(draft.chat_id),
          `Could not create event: ${error.message || 'unknown error'}`
        );
      }
      return;
    }

    if (action === 'addppl') {
      await updateDraft(draftId, {
        status: 'awaiting_participant_search',
        search_query: null,
      });
      const fresh = await loadDraft(draftId);
      if (fresh) {
        fresh.prompt_message_id = null;
        await renderParticipantPicker(fresh, 0);
      }
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    if (action === 'ppg' && param !== undefined) {
      const page = parseInt(param, 10);
      const fresh = await loadDraft(draftId);
      if (fresh) await renderParticipantPicker(fresh, isFinite(page) ? page : 0);
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    if (action === 'ppl' && param) {
      const fullId = await resolveParticipantFromShortId(param);
      if (!fullId) {
        await telegramClient.answerCallbackQuery(cb.id, 'User not found');
        return;
      }
      const current = normalizeParticipantIds(draft.participant_user_ids);
      const idx = current.indexOf(fullId);
      const next = [...current];
      let message = '';
      if (idx >= 0) {
        next.splice(idx, 1);
        message = 'Removed';
      } else {
        next.push(fullId);
        message = 'Added';
      }
      await updateDraft(draftId, {
        participant_user_ids: JSON.stringify(next),
      });

      if (draft.event_id) {
        if (idx >= 0) {
          await query(
            `DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2`,
            [draft.event_id, fullId]
          );
        } else {
          const insertResult = await query(
            `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`,
            [draft.event_id, fullId]
          );
          if ((insertResult as any).rowCount > 0) {
            notifyParticipantsAdded(draft.event_id, [fullId]);
          }
        }
      }

      const fresh = await loadDraft(draftId);
      if (fresh) await renderParticipantPicker(fresh, 0);
      await telegramClient.answerCallbackQuery(cb.id, message);
      return;
    }

    if (action === 'pdone') {
      if (draft.event_id) {
        const ids = normalizeParticipantIds(draft.participant_user_ids);
        const names = await loadParticipantNames(ids);
        if (draft.prompt_message_id) {
          await telegramClient.editMessageText(
            Number(draft.chat_id),
            Number(draft.prompt_message_id),
            [
              `Event "${draft.name}" saved.`,
              `Location: ${draft.city}, ${draft.state}`,
              `Dates: ${formatDateOnly(draft.start_date)} → ${formatDateOnly(draft.end_date)}`,
              `Participants (${names.length}): ${names.length ? names.join(', ') : 'none'}`,
            ].join('\n')
          );
        }
        await updateDraft(draftId, { status: 'created' });
      } else {
        await updateDraft(draftId, { status: 'awaiting_confirmation' });
        const fresh = await loadDraft(draftId);
        if (fresh) {
          fresh.prompt_message_id = null;
          await renderDraftPrompt(fresh);
        }
      }
      await telegramClient.answerCallbackQuery(cb.id, 'Done');
      return;
    }

    if (action === 'back') {
      if (draft.event_id) {
        await updateDraft(draftId, { status: 'created' });
        if (draft.prompt_message_id) {
          await telegramClient.editMessageText(
            Number(draft.chat_id),
            Number(draft.prompt_message_id),
            `Event "${draft.name}" saved.`
          );
        }
      } else {
        await updateDraft(draftId, { status: 'awaiting_confirmation' });
        const fresh = await loadDraft(draftId);
        if (fresh) {
          fresh.prompt_message_id = null;
          await renderDraftPrompt(fresh);
        }
      }
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    await telegramClient.answerCallbackQuery(cb.id);
  },

  hasActiveDraftAwaitingText: async (telegramUserId: number): Promise<boolean> => {
    const draft = await findLatestActiveDraft(telegramUserId);
    if (!draft) return false;
    return [
      'awaiting_name',
      'awaiting_venue',
      'awaiting_city_state',
      'awaiting_start_date',
      'awaiting_end_date',
      'awaiting_budget',
      'awaiting_participant_search',
    ].includes(draft.status);
  },
};
