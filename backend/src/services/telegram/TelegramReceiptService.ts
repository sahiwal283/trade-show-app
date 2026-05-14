import path from 'path';
import { pool, query } from '../../config/database';
import { expenseService } from '../ExpenseService';
import { runExternalReceiptOcrWithCleanup } from '../ocr/receiptExternalOcr';
import { telegramClient, InlineKeyboard } from './TelegramClient';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

const FALLBACK_CATEGORIES = [
  'Flights',
  'Hotels',
  'Meals',
  'Supplies',
  'Transportation',
  'Marketing Materials',
  'Shipping',
  'Other',
];

const FALLBACK_CARDS = [
  { name: 'Personal Card', entity: null as string | null, lastFour: '0000' },
];

interface CardOption {
  name: string;
  entity: string | null;
  lastFour: string;
  zohoPaymentAccountId?: string | null;
}

interface CategoryOption {
  name: string;
}

interface AppOptions {
  cards: CardOption[];
  categories: CategoryOption[];
  defaultCardLabel: string;
  defaultCategoryName: string;
}

function cardLabel(card: CardOption): string {
  const lf = card.lastFour || '0000';
  return `${card.name} | ${lf}`;
}

function cardButtonLabel(card: CardOption): string {
  const lf = card.lastFour && card.lastFour !== '0000' ? ` •${card.lastFour}` : '';
  return `${card.name}${lf}`;
}

let cachedOptions: { value: AppOptions; fetchedAt: number } | null = null;
const OPTIONS_TTL_MS = 60 * 1000;

async function getAppOptions(): Promise<AppOptions> {
  if (cachedOptions && Date.now() - cachedOptions.fetchedAt < OPTIONS_TTL_MS) {
    return cachedOptions.value;
  }
  try {
    const result = await query(
      `SELECT key, value FROM app_settings WHERE key IN ('cardOptions', 'categoryOptions')`
    );
    const byKey: Record<string, any> = {};
    for (const row of result.rows as Array<{ key: string; value: any }>) {
      byKey[row.key] = row.value;
    }
    const rawCards = Array.isArray(byKey.cardOptions) ? byKey.cardOptions : [];
    const rawCats = Array.isArray(byKey.categoryOptions) ? byKey.categoryOptions : [];
    const cards: CardOption[] = rawCards
      .filter((c: any) => c && typeof c.name === 'string')
      .map((c: any) => ({
        name: String(c.name),
        entity: c.entity || null,
        lastFour: typeof c.lastFour === 'string' ? c.lastFour : '0000',
        zohoPaymentAccountId: c.zohoPaymentAccountId || null,
      }));
    const categories: CategoryOption[] = rawCats
      .filter((c: any) => c && typeof c.name === 'string')
      .map((c: any) => ({ name: String(c.name) }));

    const effectiveCards = cards.length > 0 ? cards : FALLBACK_CARDS;
    const effectiveCats =
      categories.length > 0 ? categories : FALLBACK_CATEGORIES.map((n) => ({ name: n }));

    const personalCard = effectiveCards.find((c) => /personal/i.test(c.name));
    const defaultCardLabel = cardLabel(personalCard || effectiveCards[0]);
    const otherCategory = effectiveCats.find((c) => /^other$/i.test(c.name)) || effectiveCats[effectiveCats.length - 1];

    const value: AppOptions = {
      cards: effectiveCards,
      categories: effectiveCats,
      defaultCardLabel,
      defaultCategoryName: otherCategory.name,
    };
    cachedOptions = { value, fetchedAt: Date.now() };
    return value;
  } catch (error) {
    console.warn('[TelegramReceipt] Failed to load app_settings, using fallbacks:', (error as any).message);
    const value: AppOptions = {
      cards: FALLBACK_CARDS,
      categories: FALLBACK_CATEGORIES.map((n) => ({ name: n })),
      defaultCardLabel: cardLabel(FALLBACK_CARDS[0]),
      defaultCategoryName: 'Other',
    };
    return value;
  }
}

function categoryFromSuggestion(raw: any, categories: CategoryOption[], fallback: string): string {
  const s = normalizeString(raw);
  if (!s) return fallback;
  const exact = categories.find((c) => c.name.toLowerCase() === s.toLowerCase());
  if (exact) return exact.name;
  const lower = s.toLowerCase();
  const tryMatch = (needle: RegExp) => categories.find((c) => needle.test(c.name.toLowerCase()))?.name;
  if (/flight|airline|airport|airfare/.test(lower)) {
    const m = tryMatch(/flight|travel/);
    if (m) return m;
  }
  if (/hotel|lodging|inn|motel|marriott|hilton/.test(lower)) {
    const m = tryMatch(/hotel|accommodation/);
    if (m) return m;
  }
  if (/meal|restaurant|food|dining|coffee|cafe|bar|pub/.test(lower)) {
    const m = tryMatch(/meal|entertainment|food/);
    if (m) return m;
  }
  if (/uber|lyft|taxi|cab|transport/.test(lower)) {
    const m = tryMatch(/transportation|uber|lyft/);
    if (m) return m;
  }
  if (/parking/.test(lower)) {
    const m = tryMatch(/parking/);
    if (m) return m;
  }
  if (/rental|u-?haul|enterprise|hertz/.test(lower)) {
    const m = tryMatch(/rental/);
    if (m) return m;
  }
  if (/gas|fuel|shell|chevron|exxon|bp|quiktrip|circle k|7-?eleven/.test(lower)) {
    const m = tryMatch(/gas|fuel/);
    if (m) return m;
  }
  if (/ship|fedex|ups|usps|postage|courier/.test(lower)) {
    const m = tryMatch(/shipping/);
    if (m) return m;
  }
  if (/print|banner|booth|signage|marketing|swag|promo/.test(lower)) {
    const m = tryMatch(/booth|marketing/);
    if (m) return m;
  }
  if (/staples|office|supply|paper|stationery|stationer/.test(lower)) {
    const m = tryMatch(/stationar|office|supply/);
    if (m) return m;
  }
  return fallback;
}

function formatDateOnly(value: any): string {
  if (value === null || value === undefined) return '— not detected —';
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

interface TelegramPhoto {
  file_id: string;
  file_size?: number;
  width?: number;
  height?: number;
}

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
  photo?: TelegramPhoto[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramFrom;
  data?: string;
  message?: TelegramMessage;
}

interface JobRow {
  id: string;
  user_id: string;
  telegram_user_id: string;
  chat_id: string;
  prompt_message_id: string | null;
  receipt_path: string | null;
  receipt_url: string | null;
  ocr_raw: any;
  amount: string | null;
  merchant: string | null;
  expense_date: string | null;
  category: string | null;
  location: string | null;
  card_used: string;
  reimbursement_required: boolean;
  event_id: string | null;
  candidate_event_ids: any;
  status: string;
  expense_id: string | null;
}

interface CandidateEvent {
  id: string;
  name: string;
  venue: string | null;
  city: string | null;
  state: string | null;
  start_date: string;
  end_date: string;
  travel_start_date: string | null;
  travel_end_date: string | null;
  status: string;
}

async function getLinkedUserId(telegramUserId: number): Promise<string | null> {
  const result = await query(
    `SELECT user_id FROM telegram_links WHERE telegram_user_id = $1 LIMIT 1`,
    [telegramUserId]
  );
  return result.rows[0]?.user_id || null;
}

function pickLargestPhoto(photos: TelegramPhoto[]): TelegramPhoto {
  return photos.reduce((largest, p) => {
    const largestPixels = (largest.width || 0) * (largest.height || 0);
    const pPixels = (p.width || 0) * (p.height || 0);
    return pPixels > largestPixels ? p : largest;
  }, photos[0]);
}

function normalizeAmount(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  const value = typeof raw === 'object' && raw !== null ? raw.value : raw;
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function normalizeString(raw: any): string | null {
  if (raw === null || raw === undefined) return null;
  const value = typeof raw === 'object' && raw !== null ? raw.value : raw;
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeDate(raw: any): string | null {
  const s = normalizeString(raw);
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}

function matchCategoryFromText(raw: any, categories: CategoryOption[]): string | null {
  const s = normalizeString(raw);
  if (!s) return null;
  return categoryFromSuggestion(s, categories, '');
}

async function findMatchingEvents(userId: string, receiptDate: string | null): Promise<CandidateEvent[]> {
  const referenceDate = receiptDate || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT e.id, e.name, e.venue, e.city, e.state,
            e.start_date, e.end_date, e.travel_start_date, e.travel_end_date, e.status
     FROM events e
     JOIN event_participants ep ON ep.event_id = e.id
     WHERE ep.user_id = $1
       AND e.status IN ('upcoming', 'active', 'completed')
       AND (
         ($2::date BETWEEN COALESCE(e.travel_start_date, e.start_date)::date - INTERVAL '3 days'
                       AND COALESCE(e.travel_end_date, e.end_date)::date + INTERVAL '3 days')
         OR e.status = 'active'
       )
     ORDER BY (e.status = 'active') DESC,
              ABS(COALESCE(e.travel_start_date, e.start_date)::date - $2::date) ASC
     LIMIT 6`,
    [userId, referenceDate]
  );
  return result.rows as CandidateEvent[];
}

async function findAllParticipantEvents(userId: string, receiptDate: string | null): Promise<CandidateEvent[]> {
  const referenceDate = receiptDate || new Date().toISOString().slice(0, 10);
  const result = await query(
    `SELECT e.id, e.name, e.venue, e.city, e.state,
            e.start_date, e.end_date, e.travel_start_date, e.travel_end_date, e.status
     FROM events e
     JOIN event_participants ep ON ep.event_id = e.id
     WHERE ep.user_id = $1
       AND e.status IN ('upcoming', 'active', 'completed')
     ORDER BY (e.status = 'active') DESC,
              ABS(COALESCE(e.travel_start_date, e.start_date)::date - $2::date) ASC,
              e.start_date DESC
     LIMIT 10`,
    [userId, referenceDate]
  );
  return result.rows as CandidateEvent[];
}

function jobSummary(job: JobRow, eventLabel: string | null): string {
  const lines: string[] = ['Receipt captured. Review and confirm:', ''];
  lines.push(`Merchant: ${job.merchant || '— not detected —'}`);
  lines.push(`Amount: ${job.amount ? `$${parseFloat(job.amount).toFixed(2)}` : '— not detected —'}`);
  lines.push(`Date: ${formatDateOnly(job.expense_date)}`);
  lines.push(`Category: ${job.category || 'Other'}`);
  lines.push(`Event: ${eventLabel || '— not assigned —'}`);
  lines.push(`Card: ${job.card_used}`);
  lines.push(`Reimbursement: ${job.reimbursement_required ? 'Required' : 'Not required'}`);
  return lines.join('\n');
}

function confirmationKeyboard(jobId: string, hasEvent: boolean): InlineKeyboard {
  const rows: InlineKeyboard = [];
  if (hasEvent) {
    rows.push([{ text: 'Confirm & Submit', callback_data: `cb:${jobId}:confirm` }]);
  } else {
    rows.push([{ text: 'Pick event', callback_data: `cb:${jobId}:evmenu` }]);
  }
  rows.push([
    { text: 'Edit amount', callback_data: `cb:${jobId}:edit:amount` },
    { text: 'Edit merchant', callback_data: `cb:${jobId}:edit:merchant` },
  ]);
  rows.push([
    { text: 'Edit date', callback_data: `cb:${jobId}:edit:date` },
    { text: 'Edit category', callback_data: `cb:${jobId}:edit:category` },
  ]);
  rows.push([
    { text: 'Change event', callback_data: `cb:${jobId}:evmenu` },
    { text: 'Change card', callback_data: `cb:${jobId}:cardmenu` },
  ]);
  rows.push([{ text: 'Cancel', callback_data: `cb:${jobId}:cancel` }]);
  return rows;
}

function cardPickKeyboard(jobId: string, cards: CardOption[]): InlineKeyboard {
  const rows: InlineKeyboard = cards.map((c, idx) => [
    { text: cardButtonLabel(c), callback_data: `cb:${jobId}:card:${idx}` },
  ]);
  rows.push([{ text: 'Back', callback_data: `cb:${jobId}:back` }]);
  return rows;
}

function categoryPickKeyboard(jobId: string, categories: CategoryOption[]): InlineKeyboard {
  const rows: InlineKeyboard = categories.map((c, idx) => [
    { text: c.name, callback_data: `cb:${jobId}:cat:${idx}` },
  ]);
  rows.push([{ text: 'Back', callback_data: `cb:${jobId}:back` }]);
  return rows;
}

function eventPickKeyboard(jobId: string, events: CandidateEvent[]): InlineKeyboard {
  const rows: InlineKeyboard = events.map((e, idx) => [
    { text: `${e.name}${e.city ? ` (${e.city})` : ''}`, callback_data: `cb:${jobId}:ev:${idx}` },
  ]);
  rows.push([{ text: 'Back', callback_data: `cb:${jobId}:back` }]);
  return rows;
}

async function loadJob(jobId: string): Promise<JobRow | null> {
  const result = await query(`SELECT * FROM telegram_receipt_jobs WHERE id = $1 LIMIT 1`, [jobId]);
  return (result.rows[0] as JobRow) || null;
}

async function loadEvent(eventId: string): Promise<CandidateEvent | null> {
  const result = await query(
    `SELECT id, name, venue, city, state, start_date, end_date, travel_start_date, travel_end_date, status
     FROM events WHERE id = $1 LIMIT 1`,
    [eventId]
  );
  return (result.rows[0] as CandidateEvent) || null;
}

function eventLabel(event: CandidateEvent | null): string | null {
  if (!event) return null;
  return `${event.name}${event.city ? ` (${event.city})` : ''}`;
}

async function updateJob(jobId: string, patch: Record<string, any>): Promise<void> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`);
  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  await query(
    `UPDATE telegram_receipt_jobs SET ${setClauses.join(', ')} WHERE id = $1`,
    [jobId, ...keys.map((k) => patch[k])]
  );
}

async function renderJobPrompt(job: JobRow): Promise<void> {
  const event = job.event_id ? await loadEvent(job.event_id) : null;
  const text = jobSummary(job, eventLabel(event));
  const keyboard = confirmationKeyboard(job.id, Boolean(job.event_id));
  const chatId = Number(job.chat_id);

  if (job.prompt_message_id) {
    await telegramClient.editMessageText(chatId, Number(job.prompt_message_id), text, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  } else {
    const sent = await telegramClient.sendMessage(chatId, text, {
      replyMarkup: { inline_keyboard: keyboard },
    });
    if (sent?.message_id) {
      await updateJob(job.id, { prompt_message_id: sent.message_id });
    }
  }
}

async function renderEventPicker(job: JobRow, candidates: CandidateEvent[]): Promise<void> {
  const chatId = Number(job.chat_id);
  const header = candidates.length === 0
    ? 'You are not a participant on any event yet. Add yourself in the app, then tap Refresh.'
    : 'Which trade show event is this receipt for?';
  const keyboard = candidates.length === 0
    ? [
        [{ text: 'Refresh', callback_data: `cb:${job.id}:evmenu` }],
        [{ text: 'Back', callback_data: `cb:${job.id}:back` }],
      ]
    : eventPickKeyboard(job.id, candidates);

  if (job.prompt_message_id) {
    await telegramClient.editMessageText(chatId, Number(job.prompt_message_id), header, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  } else {
    const sent = await telegramClient.sendMessage(chatId, header, {
      replyMarkup: { inline_keyboard: keyboard },
    });
    if (sent?.message_id) {
      await updateJob(job.id, { prompt_message_id: sent.message_id });
    }
  }
}

async function renderCardPicker(job: JobRow): Promise<void> {
  const chatId = Number(job.chat_id);
  const { cards } = await getAppOptions();
  const header = cards.length === 0
    ? 'No cards configured. Ask an admin to add cards in Settings.'
    : 'Which card was used?';
  const keyboard = cards.length === 0
    ? [[{ text: 'Back', callback_data: `cb:${job.id}:back` }]]
    : cardPickKeyboard(job.id, cards);

  if (job.prompt_message_id) {
    await telegramClient.editMessageText(chatId, Number(job.prompt_message_id), header, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  } else {
    const sent = await telegramClient.sendMessage(chatId, header, {
      replyMarkup: { inline_keyboard: keyboard },
    });
    if (sent?.message_id) {
      await updateJob(job.id, { prompt_message_id: sent.message_id });
    }
  }
}

async function renderCategoryPicker(job: JobRow): Promise<void> {
  const chatId = Number(job.chat_id);
  const { categories } = await getAppOptions();
  const header = categories.length === 0
    ? 'No categories configured. Ask an admin to add categories in Settings.'
    : 'Pick a category:';
  const keyboard = categories.length === 0
    ? [[{ text: 'Back', callback_data: `cb:${job.id}:back` }]]
    : categoryPickKeyboard(job.id, categories);

  if (job.prompt_message_id) {
    await telegramClient.editMessageText(chatId, Number(job.prompt_message_id), header, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  } else {
    const sent = await telegramClient.sendMessage(chatId, header, {
      replyMarkup: { inline_keyboard: keyboard },
    });
    if (sent?.message_id) {
      await updateJob(job.id, { prompt_message_id: sent.message_id });
    }
  }
}

async function findLatestEditingJob(telegramUserId: number): Promise<JobRow | null> {
  const result = await query(
    `SELECT * FROM telegram_receipt_jobs
     WHERE telegram_user_id = $1
       AND status IN ('awaiting_edit_amount','awaiting_edit_merchant','awaiting_edit_date','awaiting_edit_category')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [telegramUserId]
  );
  return (result.rows[0] as JobRow) || null;
}

async function processTelegramReceiptDownload(
  message: TelegramMessage,
  telegramFileId: string,
  destBasename: string
): Promise<void> {
  const from = message.from;
  if (!from) return;
  const chatId = message.chat.id;

  const userId = await getLinkedUserId(from.id);
  if (!userId) {
    await telegramClient.sendMessage(
      chatId,
      'Link your account first: open the app → Account → Connect Telegram, then send the receipt again.'
    );
    return;
  }

  await telegramClient.sendChatAction(chatId, 'upload_photo');

  const fileInfo = await telegramClient.getFile(telegramFileId);
  if (!fileInfo?.file_path) {
    await telegramClient.sendMessage(chatId, 'Could not retrieve the file from Telegram. Please try again.');
    return;
  }

  const destDir = path.resolve(UPLOAD_DIR);
  let localPath: string;
  try {
    localPath = await telegramClient.downloadFile(fileInfo.file_path, destDir, destBasename);
  } catch (error: any) {
    console.error('[TelegramReceipt] Download failed:', error.message);
    await telegramClient.sendMessage(chatId, 'Could not download the file. Please try again.');
    return;
  }

  const filename = path.basename(localPath);
  const receiptUrl = `/uploads/${filename}`;

  const options = await getAppOptions();
  const defaultReimbursement = /personal/i.test(options.defaultCardLabel);

  const client = await pool.connect();
  let jobId: string;
  try {
    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO telegram_receipt_jobs
           (user_id, telegram_user_id, chat_id, source_message_id, photo_file_id, receipt_path, receipt_url, card_used, reimbursement_required, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ocr_pending')
         RETURNING id`,
      [
        userId,
        from.id,
        chatId,
        message.message_id,
        telegramFileId,
        localPath,
        receiptUrl,
        options.defaultCardLabel,
        defaultReimbursement,
      ]
    );
    jobId = insertResult.rows[0].id;
  } finally {
    client.release();
  }

  const statusMsg = await telegramClient.sendMessage(chatId, 'Processing receipt via OCR. This can take a few minutes...');
  if (statusMsg?.message_id) {
    await updateJob(jobId, { prompt_message_id: statusMsg.message_id });
  }

  let ocrResult: any = null;
  try {
    ocrResult = await runExternalReceiptOcrWithCleanup(localPath);
  } catch (error: any) {
    console.error('[TelegramReceipt] OCR failed:', error.message);
    await updateJob(jobId, { status: 'failed', last_error: error.message });
    if (statusMsg?.message_id) {
      await telegramClient.editMessageText(
        chatId,
        statusMsg.message_id,
        'OCR service is unavailable right now. The photo was saved; use the web app to finalize the expense.'
      );
    }
    return;
  }

  const fields = ocrResult?.fields || {};
  const amount = normalizeAmount(fields.amount);
  const merchant = normalizeString(fields.merchant);
  const expenseDate = normalizeDate(fields.date) || new Date().toISOString().slice(0, 10);
  const category = categoryFromSuggestion(fields.category, options.categories, options.defaultCategoryName);
  const location = normalizeString(fields.location);

  const dateMatches = await findMatchingEvents(userId, expenseDate);
  const autoAssigned = dateMatches.length === 1 ? dateMatches[0].id : null;

  const pickerList = autoAssigned ? dateMatches : await findAllParticipantEvents(userId, expenseDate);
  const candidateIds = pickerList.map((c) => c.id);

  await updateJob(jobId, {
    ocr_raw: ocrResult,
    amount,
    merchant,
    expense_date: expenseDate,
    category,
    location,
    candidate_event_ids: JSON.stringify(candidateIds),
    event_id: autoAssigned,
    status: autoAssigned ? 'awaiting_confirmation' : 'awaiting_event',
  });

  const freshJob = await loadJob(jobId);
  if (!freshJob) return;

  if (autoAssigned) {
    await renderJobPrompt(freshJob);
  } else {
    await renderEventPicker(freshJob, pickerList);
  }
}

export const telegramReceiptService = {
  async handlePhoto(message: TelegramMessage): Promise<void> {
    const photos = message.photo;
    if (!photos || photos.length === 0) return;
    const largest = pickLargestPhoto(photos);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    await processTelegramReceiptDownload(message, largest.file_id, `receipt-tg-${uniqueSuffix}`);
  },

  async handleReceiptDocument(message: TelegramMessage): Promise<void> {
    const doc = message.document;
    if (!doc?.file_id) return;
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const rawName = (doc.file_name || 'receipt').replace(/\.[^/.]+$/, '');
    const safe = rawName.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'receipt';
    await processTelegramReceiptDownload(message, doc.file_id, `receipt-tgdoc-${uniqueSuffix}-${safe}`);
  },

  async handleCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
    const data = cb.data || '';
    const parts = data.split(':');
    if (parts[0] !== 'cb' || parts.length < 3) {
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }
    const jobId = parts[1];
    const action = parts[2];
    const param = parts[3];
    const param2 = parts[4];

    const job = await loadJob(jobId);
    if (!job) {
      await telegramClient.answerCallbackQuery(cb.id, 'Session expired.');
      return;
    }

    const linkedUserId = await getLinkedUserId(cb.from.id);
    if (!linkedUserId || linkedUserId !== job.user_id) {
      await telegramClient.answerCallbackQuery(cb.id, 'Not your receipt.');
      return;
    }

    const chatId = Number(job.chat_id);

    if (action === 'cancel') {
      await updateJob(jobId, { status: 'cancelled' });
      if (job.prompt_message_id) {
        await telegramClient.editMessageText(chatId, Number(job.prompt_message_id), 'Cancelled. No expense was created.');
      }
      await telegramClient.answerCallbackQuery(cb.id, 'Cancelled');
      return;
    }

    if (action === 'evmenu') {
      const candidates = await findAllParticipantEvents(job.user_id, job.expense_date);
      await updateJob(jobId, {
        candidate_event_ids: JSON.stringify(candidates.map((c) => c.id)),
        status: 'awaiting_event',
      });
      const fresh = await loadJob(jobId);
      if (fresh) await renderEventPicker(fresh, candidates);
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    if (action === 'cardmenu') {
      const fresh = await loadJob(jobId);
      if (fresh) await renderCardPicker(fresh);
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    if (action === 'card' && param !== undefined) {
      const idx = parseInt(param, 10);
      const { cards } = await getAppOptions();
      const card = cards[idx];
      if (!card) {
        await telegramClient.answerCallbackQuery(cb.id, 'Invalid card.');
        return;
      }
      const reimbursementRequired = /personal/i.test(card.name);
      await updateJob(jobId, {
        card_used: cardLabel(card),
        reimbursement_required: reimbursementRequired,
      });
      const fresh = await loadJob(jobId);
      if (fresh) await renderJobPrompt(fresh);
      await telegramClient.answerCallbackQuery(cb.id, 'Card updated');
      return;
    }

    if (action === 'catmenu') {
      const fresh = await loadJob(jobId);
      if (fresh) await renderCategoryPicker(fresh);
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    if (action === 'cat' && param !== undefined) {
      const idx = parseInt(param, 10);
      const { categories } = await getAppOptions();
      const cat = categories[idx];
      if (!cat) {
        await telegramClient.answerCallbackQuery(cb.id, 'Invalid category.');
        return;
      }
      await updateJob(jobId, { category: cat.name, status: 'awaiting_confirmation' });
      const fresh = await loadJob(jobId);
      if (fresh) await renderJobPrompt(fresh);
      await telegramClient.answerCallbackQuery(cb.id, 'Category updated');
      return;
    }

    if (action === 'back') {
      await updateJob(jobId, { status: 'awaiting_confirmation' });
      const fresh = await loadJob(jobId);
      if (fresh) await renderJobPrompt(fresh);
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    if (action === 'ev' && param !== undefined) {
      const idx = parseInt(param, 10);
      const candidateIds: string[] = Array.isArray(job.candidate_event_ids)
        ? job.candidate_event_ids
        : (() => {
            try {
              return JSON.parse(job.candidate_event_ids as any) || [];
            } catch {
              return [];
            }
          })();
      const eventId = candidateIds[idx];
      if (!eventId) {
        await telegramClient.answerCallbackQuery(cb.id, 'Invalid event.');
        return;
      }
      await updateJob(jobId, { event_id: eventId, status: 'awaiting_confirmation' });
      const fresh = await loadJob(jobId);
      if (fresh) await renderJobPrompt(fresh);
      await telegramClient.answerCallbackQuery(cb.id, 'Event set');
      return;
    }

    if (action === 'edit' && param) {
      if (param === 'category') {
        const fresh = await loadJob(jobId);
        if (fresh) await renderCategoryPicker(fresh);
        await telegramClient.answerCallbackQuery(cb.id);
        return;
      }
      const editMap: Record<string, string> = {
        amount: 'awaiting_edit_amount',
        merchant: 'awaiting_edit_merchant',
        date: 'awaiting_edit_date',
      };
      const newStatus = editMap[param];
      if (!newStatus) {
        await telegramClient.answerCallbackQuery(cb.id);
        return;
      }
      await updateJob(jobId, { status: newStatus });
      const prompts: Record<string, string> = {
        amount: 'Send the correct amount (e.g., 42.57).',
        merchant: 'Send the correct merchant name.',
        date: 'Send the correct date (YYYY-MM-DD).',
      };
      await telegramClient.sendMessage(chatId, prompts[param]);
      await telegramClient.answerCallbackQuery(cb.id);
      return;
    }

    if (action === 'confirm') {
      if (!job.event_id) {
        await telegramClient.answerCallbackQuery(cb.id, 'Pick an event first.');
        return;
      }
      if (!job.amount || job.amount === null) {
        await telegramClient.answerCallbackQuery(cb.id, 'Amount required. Use Edit amount.');
        return;
      }
      if (!job.merchant) {
        await telegramClient.answerCallbackQuery(cb.id, 'Merchant required. Use Edit merchant.');
        return;
      }
      try {
        const { cards } = await getAppOptions();
        const selectedCard = cards.find((c) => cardLabel(c) === job.card_used);
        const zohoEntity = selectedCard?.entity || undefined;

        const expense = await expenseService.createExpense(job.user_id, {
          eventId: job.event_id,
          date: formatDateOnly(job.expense_date) !== '— not detected —'
            ? formatDateOnly(job.expense_date)
            : new Date().toISOString().slice(0, 10),
          merchant: job.merchant,
          amount: parseFloat(String(job.amount)),
          category: job.category || 'Other',
          description: 'Submitted via Telegram bot',
          location: job.location || undefined,
          cardUsed: job.card_used,
          receiptUrl: job.receipt_url || undefined,
          reimbursementRequired: job.reimbursement_required,
          zohoEntity,
        });
        await updateJob(jobId, { status: 'submitted', expense_id: expense.id });
        if (job.prompt_message_id) {
          await telegramClient.editMessageText(
            chatId,
            Number(job.prompt_message_id),
            `Expense submitted.\nMerchant: ${job.merchant}\nAmount: $${parseFloat(String(job.amount)).toFixed(2)}\nDate: ${formatDateOnly(job.expense_date)}\nCard: ${job.card_used}\nStatus: pending review`
          );
        }
        await telegramClient.answerCallbackQuery(cb.id, 'Submitted');
      } catch (error: any) {
        console.error('[TelegramReceipt] createExpense failed:', error);
        await updateJob(jobId, { last_error: error.message });
        await telegramClient.answerCallbackQuery(cb.id, 'Failed to submit');
        await telegramClient.sendMessage(chatId, `Could not submit expense: ${error.message || 'unknown error'}`);
      }
      return;
    }

    await telegramClient.answerCallbackQuery(cb.id);
  },

  async handleTextDuringEdit(message: TelegramMessage): Promise<boolean> {
    const from = message.from;
    const text = (message.text || '').trim();
    if (!from || !text) return false;
    const job = await findLatestEditingJob(from.id);
    if (!job) return false;

    const chatId = message.chat.id;
    let patch: Record<string, any> = {};
    let error: string | null = null;

    if (job.status === 'awaiting_edit_amount') {
      const n = parseFloat(text.replace(/[^\d.-]/g, ''));
      if (!isFinite(n) || n <= 0) error = 'Amount must be a positive number.';
      else patch.amount = Math.round(n * 100) / 100;
    } else if (job.status === 'awaiting_edit_merchant') {
      if (text.length < 1 || text.length > 255) error = 'Merchant must be 1-255 characters.';
      else patch.merchant = text;
    } else if (job.status === 'awaiting_edit_date') {
      const d = normalizeDate(text);
      if (!d) error = 'Use format YYYY-MM-DD.';
      else patch.expense_date = d;
    } else if (job.status === 'awaiting_edit_category') {
      const { categories } = await getAppOptions();
      const cat = matchCategoryFromText(text, categories);
      if (!cat) error = `Tap "Edit category" to pick from the list.`;
      else patch.category = cat;
    }

    if (error) {
      await telegramClient.sendMessage(chatId, error);
      return true;
    }

    patch.status = 'awaiting_confirmation';
    await updateJob(job.id, patch);
    const fresh = await loadJob(job.id);
    if (fresh) await renderJobPrompt(fresh);
    return true;
  },
};
