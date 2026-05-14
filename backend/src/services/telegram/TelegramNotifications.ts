import { query } from '../../config/database';
import { telegramClient } from './TelegramClient';

interface EventRow {
  id: string;
  name: string;
  venue: string | null;
  city: string | null;
  state: string | null;
  start_date: any;
  end_date: any;
  show_start_date: any | null;
  show_end_date: any | null;
  travel_start_date: any | null;
  travel_end_date: any | null;
  status: string | null;
}

function formatDateOnly(value: any): string {
  if (!value) return '';
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

function buildParticipantAddedMessage(event: EventRow): string {
  const lines: string[] = [];
  lines.push(`You've been added as a participant on a trade show event:`);
  lines.push('');
  lines.push(event.name);
  if (event.venue) lines.push(`Venue: ${event.venue}`);
  const location = [event.city, event.state].filter(Boolean).join(', ');
  if (location) lines.push(`Location: ${location}`);

  const showStart = formatDateOnly(event.show_start_date || event.start_date);
  const showEnd = formatDateOnly(event.show_end_date || event.end_date);
  if (showStart && showEnd) {
    lines.push(`Show dates: ${showStart} → ${showEnd}`);
  }

  const travelStart = formatDateOnly(event.travel_start_date);
  const travelEnd = formatDateOnly(event.travel_end_date);
  if (
    travelStart &&
    travelEnd &&
    (travelStart !== showStart || travelEnd !== showEnd)
  ) {
    lines.push(`Travel: ${travelStart} → ${travelEnd}`);
  }

  lines.push('');
  lines.push(
    'Send a receipt photo in this chat to log an expense for this event.'
  );
  return lines.join('\n');
}

async function loadEvent(eventId: string): Promise<EventRow | null> {
  const result = await query(
    `SELECT id, name, venue, city, state,
            start_date, end_date,
            show_start_date, show_end_date,
            travel_start_date, travel_end_date,
            status
     FROM events WHERE id = $1 LIMIT 1`,
    [eventId]
  );
  return (result.rows[0] as EventRow) || null;
}

async function loadTelegramChatIds(userIds: string[]): Promise<Array<{ userId: string; chatId: number }>> {
  if (userIds.length === 0) return [];
  const result = await query(
    `SELECT user_id, telegram_user_id
     FROM telegram_links
     WHERE user_id = ANY($1::uuid[])`,
    [userIds]
  );
  return (result.rows as Array<{ user_id: string; telegram_user_id: string }>).map((r) => ({
    userId: r.user_id,
    chatId: Number(r.telegram_user_id),
  }));
}

/**
 * Notify one or more users that they've been added to an event.
 * Fire-and-forget; errors are logged but never thrown.
 */
export function notifyParticipantsAdded(eventId: string, userIds: string[]): void {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return;

  void (async () => {
    try {
      const [event, links] = await Promise.all([
        loadEvent(eventId),
        loadTelegramChatIds(unique),
      ]);
      if (!event || links.length === 0) return;
      const text = buildParticipantAddedMessage(event);
      for (const link of links) {
        try {
          await telegramClient.sendMessage(link.chatId, text);
        } catch (error: any) {
          console.warn(
            `[TelegramNotifications] Failed to send "added to event" to user ${link.userId} (chat ${link.chatId}):`,
            error.message
          );
        }
      }
    } catch (error: any) {
      console.error('[TelegramNotifications] notifyParticipantsAdded failed:', error.message);
    }
  })();
}
