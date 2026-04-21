import React, { useCallback, useEffect, useState } from 'react';
import { User } from '../../App';
import { api } from '../../utils/api';

interface AccountSettingsProps {
  user: User;
}

interface TelegramLinkStatusResponse {
  linked: boolean;
  botUsername?: string | null;
  link?: {
    telegramUserId: string;
    telegramUsername?: string | null;
    telegramFirstName?: string | null;
    telegramLastName?: string | null;
    linkedAt: string;
    updatedAt: string;
  };
}

interface StartLinkResponse {
  success: boolean;
  linkCode: string;
  startToken: string;
  expiresAt: string;
  botUsername?: string | null;
  deepLinkUrl?: string | null;
  instructions?: string[];
}

export const AccountSettings: React.FC<AccountSettingsProps> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [status, setStatus] = useState<TelegramLinkStatusResponse>({ linked: false });
  const [startInfo, setStartInfo] = useState<StartLinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!api.USE_SERVER) {
        setStatus({ linked: false });
        return;
      }
      const data = await api.telegram.getLinkStatus() as TelegramLinkStatusResponse;
      setStatus(data);
    } catch (e) {
      console.error('[AccountSettings] Failed to load Telegram status:', e);
      setError('Failed to load Telegram connection status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleStartLink = async () => {
    setStarting(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await api.telegram.startLink() as StartLinkResponse;
      setStartInfo(data);
      setSuccess('Link token generated. Complete linking in Telegram before it expires.');
    } catch (e) {
      console.error('[AccountSettings] Failed to start link:', e);
      setError('Failed to start Telegram linking. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.telegram.disconnect();
      setStartInfo(null);
      setSuccess('Telegram account disconnected.');
      await loadStatus();
    } catch (e) {
      console.error('[AccountSettings] Failed to disconnect Telegram:', e);
      setError('Failed to disconnect Telegram account.');
    } finally {
      setDisconnecting(false);
    }
  };

  const linkedUsername = status.link?.telegramUsername
    ? `@${status.link.telegramUsername}`
    : 'Unavailable';

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-xl font-semibold text-gray-900">Account</h2>
        <p className="text-sm text-gray-600 mt-1">
          Logged in as <span className="font-medium">{user.name}</span> ({user.username})
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Telegram Integration</h3>
          <p className="text-sm text-gray-600 mt-1">
            Connect your Telegram account to submit receipts and run app actions through the bot.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Loading Telegram status...</div>
        ) : status.linked ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-medium text-emerald-700">Connected</p>
              <p className="text-sm text-emerald-700 mt-1">
                Telegram: {linkedUsername}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadStatus}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Refresh status
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 rounded-lg border border-red-300 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Telegram'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Not connected yet. Generate a one-time link code below, then finish linking in Telegram.
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleStartLink}
                disabled={starting}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {starting ? 'Generating...' : 'Connect Telegram'}
              </button>
              <button
                type="button"
                onClick={loadStatus}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Refresh status
              </button>
            </div>

            {startInfo && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Manual command:</span> Send{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded border">/link {startInfo.linkCode}</code>{' '}
                  to the bot.
                </p>
                {startInfo.deepLinkUrl && (
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Deep link:</span>{' '}
                    <a
                      href={startInfo.deepLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 hover:underline break-all"
                    >
                      {startInfo.deepLinkUrl}
                    </a>
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Expires at: {new Date(startInfo.expiresAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
