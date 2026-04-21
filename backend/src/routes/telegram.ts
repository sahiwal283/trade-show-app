import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { pool, query } from '../config/database';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || '';
const TELEGRAM_WEBHOOK_BASE_URL = process.env.TELEGRAM_WEBHOOK_BASE_URL || '';

function isTelegramConfigured(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_WEBHOOK_SECRET);
}

function getTelegramApiUrl(path: string): string {
  return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${path}`;
}

function generateLinkCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateStartToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  await axios.post(getTelegramApiUrl('sendMessage'), {
    chat_id: chatId,
    text,
  }, {
    timeout: 10000,
  });
}

async function consumeLinkToken(
  tokenType: 'code' | 'start',
  tokenValue: string,
  telegramUser: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  }
): Promise<{ linked: boolean; message: string }> {
  const tokenField = tokenType === 'code' ? 'link_code' : 'start_token';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tokenResult = await client.query<{
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM telegram_link_tokens
       WHERE ${tokenField} = $1
       LIMIT 1`,
      [tokenValue]
    );

    if (tokenResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { linked: false, message: 'Invalid link token. Please start linking again from the app.' };
    }

    const token = tokenResult.rows[0];
    if (token.used_at) {
      await client.query('ROLLBACK');
      return { linked: false, message: 'This link token has already been used. Generate a new one in the app.' };
    }

    if (new Date(token.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return { linked: false, message: 'This link token has expired. Generate a new one in the app.' };
    }

    const existingTelegramResult = await client.query<{ user_id: string }>(
      `SELECT user_id
       FROM telegram_links
       WHERE telegram_user_id = $1
       LIMIT 1`,
      [telegramUser.id]
    );

    if (existingTelegramResult.rows.length > 0 && existingTelegramResult.rows[0].user_id !== token.user_id) {
      await client.query('ROLLBACK');
      return {
        linked: false,
        message: 'This Telegram account is already linked to another user. Disconnect it first.',
      };
    }

    await client.query(
      `INSERT INTO telegram_links (
        user_id,
        telegram_user_id,
        telegram_username,
        telegram_first_name,
        telegram_last_name,
        linked_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        telegram_user_id = EXCLUDED.telegram_user_id,
        telegram_username = EXCLUDED.telegram_username,
        telegram_first_name = EXCLUDED.telegram_first_name,
        telegram_last_name = EXCLUDED.telegram_last_name,
        updated_at = CURRENT_TIMESTAMP`,
      [
        token.user_id,
        telegramUser.id,
        telegramUser.username || null,
        telegramUser.first_name || null,
        telegramUser.last_name || null,
      ]
    );

    await client.query(
      `UPDATE telegram_link_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [token.id]
    );

    await client.query('COMMIT');
    return { linked: true, message: 'Telegram linked successfully. You can now send receipts to this bot.' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Telegram] Failed to consume link token:', error);
    return { linked: false, message: 'Failed to link Telegram account. Please try again.' };
  } finally {
    client.release();
  }
}

router.post('/webhook/:secret', async (req, res) => {
  if (!isTelegramConfigured()) {
    return res.status(503).json({ error: 'Telegram integration is not configured' });
  }

  if (req.params.secret !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const message = req.body?.message;
  const from = message?.from;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';

  if (!from || !message?.chat?.id) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id as number;

  try {
    if (text.startsWith('/start')) {
      const payload = text.split(' ')[1];
      if (payload) {
        const result = await consumeLinkToken('start', payload, from);
        await sendTelegramMessage(chatId, result.message);
      } else {
        await sendTelegramMessage(
          chatId,
          'Welcome! Use the Connect Telegram button in the app to link your account.'
        );
      }
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith('/link')) {
      const code = text.split(' ')[1]?.toUpperCase();
      if (!code) {
        await sendTelegramMessage(chatId, 'Usage: /link YOUR_CODE');
      } else {
        const result = await consumeLinkToken('code', code, from);
        await sendTelegramMessage(chatId, result.message);
      }
      return res.status(200).json({ ok: true });
    }

    await sendTelegramMessage(
      chatId,
      'Receipt processing is coming next. For now, link your account with /link CODE or /start payload.'
    );
  } catch (error) {
    console.error('[Telegram] Webhook processing error:', error);
  }

  return res.status(200).json({ ok: true });
});

router.post('/link/start', authenticateToken, async (req: AuthRequest, res) => {
  if (!isTelegramConfigured()) {
    return res.status(503).json({ error: 'Telegram integration is not configured' });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const linkCode = generateLinkCode();
  const startToken = generateStartToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  try {
    await query(
      `DELETE FROM telegram_link_tokens
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );

    await query(
      `INSERT INTO telegram_link_tokens (user_id, link_code, start_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, linkCode, startToken, expiresAt.toISOString()]
    );

    const deepLinkUrl = TELEGRAM_BOT_USERNAME
      ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${startToken}`
      : null;

    res.json({
      success: true,
      linkCode,
      startToken,
      expiresAt: expiresAt.toISOString(),
      botUsername: TELEGRAM_BOT_USERNAME || null,
      deepLinkUrl,
      instructions: [
        'Option 1: Open deep link and press Start.',
        'Option 2: Message the bot with /link <code>.',
      ],
    });
  } catch (error) {
    console.error('[Telegram] Failed to start link:', error);
    res.status(500).json({ error: 'Failed to create Telegram link token' });
  }
});

router.get('/link/status', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await query(
      `SELECT telegram_user_id, telegram_username, telegram_first_name, telegram_last_name, linked_at, updated_at
       FROM telegram_links
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ linked: false, botUsername: TELEGRAM_BOT_USERNAME || null });
    }

    const link = result.rows[0];
    res.json({
      linked: true,
      botUsername: TELEGRAM_BOT_USERNAME || null,
      link: {
        telegramUserId: link.telegram_user_id,
        telegramUsername: link.telegram_username,
        telegramFirstName: link.telegram_first_name,
        telegramLastName: link.telegram_last_name,
        linkedAt: link.linked_at,
        updatedAt: link.updated_at,
      },
    });
  } catch (error) {
    console.error('[Telegram] Failed to fetch link status:', error);
    res.status(500).json({ error: 'Failed to fetch Telegram link status' });
  }
});

router.delete('/link', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await query(
      `DELETE FROM telegram_links
       WHERE user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      disconnected: (result.rowCount || 0) > 0,
    });
  } catch (error) {
    console.error('[Telegram] Failed to disconnect link:', error);
    res.status(500).json({ error: 'Failed to disconnect Telegram account' });
  }
});

router.post('/webhook/register', authenticateToken, authorize('admin', 'developer'), async (req: AuthRequest, res) => {
  if (!isTelegramConfigured()) {
    return res.status(503).json({ error: 'Telegram integration is not configured' });
  }

  const baseUrl = (req.body?.webhookBaseUrl || TELEGRAM_WEBHOOK_BASE_URL || '').trim();
  if (!baseUrl) {
    return res.status(400).json({ error: 'webhookBaseUrl is required when TELEGRAM_WEBHOOK_BASE_URL is not set' });
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const webhookUrl = `${normalizedBaseUrl}/api/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}`;

  try {
    const response = await axios.post(
      getTelegramApiUrl('setWebhook'),
      {
        url: webhookUrl,
        secret_token: TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message'],
      },
      { timeout: 10000 }
    );

    res.json({
      success: true,
      webhookUrl,
      telegramResponse: response.data,
    });
  } catch (error) {
    console.error('[Telegram] Failed to register webhook:', error);
    res.status(500).json({ error: 'Failed to register Telegram webhook' });
  }
});

export default router;
