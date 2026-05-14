import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
}

function fileUrl(filePath: string): string {
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export type InlineKeyboard = InlineKeyboardButton[][];

export const telegramClient = {
  isConfigured(): boolean {
    return Boolean(TELEGRAM_BOT_TOKEN);
  },

  async sendMessage(
    chatId: number,
    text: string,
    options: { replyMarkup?: { inline_keyboard: InlineKeyboard }; parseMode?: 'Markdown' | 'HTML' } = {}
  ): Promise<{ message_id: number } | null> {
    if (!TELEGRAM_BOT_TOKEN) return null;
    try {
      const body: any = { chat_id: chatId, text };
      if (options.parseMode) body.parse_mode = options.parseMode;
      if (options.replyMarkup) body.reply_markup = options.replyMarkup;
      const { data } = await axios.post(apiUrl('sendMessage'), body, { timeout: 10000 });
      return { message_id: data?.result?.message_id };
    } catch (error: any) {
      console.error('[TelegramClient] sendMessage failed:', error?.response?.data || error.message);
      return null;
    }
  },

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: { replyMarkup?: { inline_keyboard: InlineKeyboard }; parseMode?: 'Markdown' | 'HTML' } = {}
  ): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
      const body: any = { chat_id: chatId, message_id: messageId, text };
      if (options.parseMode) body.parse_mode = options.parseMode;
      if (options.replyMarkup) body.reply_markup = options.replyMarkup;
      await axios.post(apiUrl('editMessageText'), body, { timeout: 10000 });
    } catch (error: any) {
      console.error('[TelegramClient] editMessageText failed:', error?.response?.data || error.message);
    }
  },

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
      await axios.post(
        apiUrl('answerCallbackQuery'),
        { callback_query_id: callbackQueryId, text },
        { timeout: 5000 }
      );
    } catch (error: any) {
      console.error('[TelegramClient] answerCallbackQuery failed:', error?.response?.data || error.message);
    }
  },

  async sendChatAction(chatId: number, action: 'typing' | 'upload_photo'): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
      await axios.post(apiUrl('sendChatAction'), { chat_id: chatId, action }, { timeout: 5000 });
    } catch {
      // Non-fatal.
    }
  },

  async getFile(fileId: string): Promise<{ file_path: string; file_size?: number } | null> {
    if (!TELEGRAM_BOT_TOKEN) return null;
    try {
      const { data } = await axios.get(apiUrl('getFile'), {
        params: { file_id: fileId },
        timeout: 10000,
      });
      return data?.result || null;
    } catch (error: any) {
      console.error('[TelegramClient] getFile failed:', error?.response?.data || error.message);
      return null;
    }
  },

  async downloadFile(filePath: string, destDir: string, destFilename: string): Promise<string> {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const ext = path.extname(filePath) || '.jpg';
    const finalName = destFilename.endsWith(ext) ? destFilename : `${destFilename}${ext}`;
    const localPath = path.join(destDir, finalName);
    const response = await axios.get(fileUrl(filePath), {
      responseType: 'stream',
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    await pipeline(response.data, fs.createWriteStream(localPath));
    return localPath;
  },
};
