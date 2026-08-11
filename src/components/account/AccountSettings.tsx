import React, { useCallback, useEffect, useState } from 'react';
import { User } from '../../App';
import packageJson from '../../../package.json';
import {
  isPushSupported,
  getSubscriptionState,
  fetchPushConfig,
  enablePush,
  disablePush,
  sendTestPushNotification,
  PushSubscriptionState,
} from '../../utils/pushNotifications';

const APP_VERSION = packageJson.version;

interface AccountSettingsProps {
  user: User;
  /** True when rendered inside the Settings page, which brings its own masthead */
  embedded?: boolean;
}

export const AccountSettings: React.FC<AccountSettingsProps> = ({ user, embedded = false }) => {

  const pushSupported = isPushSupported();
  const [pushState, setPushState] = useState<PushSubscriptionState>(pushSupported ? 'unsubscribed' : 'unsupported');
  const [pushServerEnabled, setPushServerEnabled] = useState<boolean | null>(null);
  const [pushLoading, setPushLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window.matchMedia === 'function'
    && window.matchMedia('(display-mode: standalone)').matches;

  const loadPushStatus = useCallback(async () => {
    setPushLoading(true);
    try {
      const state = await getSubscriptionState();
      setPushState(state);
      if (state !== 'unsupported') {
        const config = await fetchPushConfig();
        setPushServerEnabled(config.enabled);
      }
    } catch (e) {
      console.error('[AccountSettings] Failed to load push status:', e);
    } finally {
      setPushLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPushStatus();
  }, [loadPushStatus]);

  const handleTogglePush = async () => {
    setPushBusy(true);
    setPushError(null);
    setPushSuccess(null);
    try {
      if (pushState === 'subscribed') {
        await disablePush();
        setPushSuccess('Push notifications disabled on this device.');
      } else {
        await enablePush();
        setPushSuccess('Push notifications enabled on this device.');
      }
    } catch (e) {
      console.error('[AccountSettings] Failed to update push settings:', e);
      setPushError(e instanceof Error ? e.message : 'Failed to update push notification settings.');
    } finally {
      await loadPushStatus();
      setPushBusy(false);
    }
  };

  const handleSendTestPush = async () => {
    setPushTesting(true);
    setPushError(null);
    setPushSuccess(null);
    try {
      await sendTestPushNotification();
      setPushSuccess('Test notification sent. It should arrive on this device shortly.');
    } catch (e) {
      console.error('[AccountSettings] Failed to send test notification:', e);
      setPushError('Failed to send test notification.');
    } finally {
      setPushTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Masthead — suppressed when embedded in the Settings page, which has its own */}
      {!embedded && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Manage</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-stone-900">Account</h1>
          <p className="text-stone-600 mt-1">Your profile, notifications, and connected apps.</p>
        </div>
      )}

      {/* Profile */}
      <section className="card overflow-hidden">
        <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
          <h2 className="card-title">Profile</h2>
          <p className="mt-0.5 text-sm text-stone-500">How you appear across the app.</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-accent-500 font-display text-base font-semibold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-stone-900">{user.name}</p>
            <p className="truncate text-sm text-stone-500">@{user.username}</p>
          </div>
          <span className="chip shrink-0 bg-stone-50 px-2.5 py-1 text-xs capitalize text-stone-600 ring-stone-200">
            {user.role}
          </span>
        </div>
      </section>

      {/* Notifications */}
      <section className="card overflow-hidden">
        <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
          <h2 className="card-title">Notifications</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Get a push notification on this device when a flight, hotel, or car rental is booked for you.
          </p>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {pushError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pushError}
            </div>
          )}

          {pushSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {pushSuccess}
            </div>
          )}

          {pushLoading ? (
            <div className="text-sm text-stone-500">Loading notification status...</div>
          ) : !pushSupported ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {isIos && !isStandalone
                ? 'Push notifications on iPhone and iPad only work once the app is installed. In Safari, tap Share and choose "Add to Home Screen", then open the app from your home screen and enable notifications here.'
                : 'Push notifications are not supported in this browser.'}
            </div>
          ) : pushServerEnabled === false ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Notifications aren't available yet — your administrator needs to finish server setup.
            </div>
          ) : pushState === 'denied' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Notifications are blocked for this site. Allow notifications in your browser settings, then try again.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-stone-700">Push notifications</p>
                  <p className="text-xs text-stone-500">
                    {pushState === 'subscribed' ? 'Enabled on this device' : 'Disabled on this device'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pushState === 'subscribed'}
                  aria-label="Toggle push notifications"
                  onClick={handleTogglePush}
                  disabled={pushBusy}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                    pushState === 'subscribed' ? 'bg-brand-600' : 'bg-stone-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      pushState === 'subscribed' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {pushState === 'subscribed' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSendTestPush}
                    disabled={pushTesting}
                    className="btn-secondary"
                  >
                    {pushTesting ? 'Sending...' : 'Send test'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Version / meta */}
      <p className="pb-2 text-center text-[11px] font-medium tracking-wide text-stone-400">
        Version {APP_VERSION}
      </p>
    </div>
  );
};
