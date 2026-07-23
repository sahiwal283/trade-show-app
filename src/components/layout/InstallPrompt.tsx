/**
 * InstallPrompt — a quiet, dismissible banner suggesting Add-to-Home-Screen.
 *
 * Deliberately NOT a modal: the old full-screen interstitial hijacked the
 * first post-login moment. Rules now:
 *   - never on desktop or when already installed (standalone)
 *   - never on the first session (people came to do a task)
 *   - dismissing snoozes it for 30 days
 *   - renders as a slim banner above the bottom nav
 */

import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare, Download } from 'lucide-react';

const DISMISS_KEY = 'installPromptDismissed';
const SESSION_COUNT_KEY = 'appSessionCount';
const SNOOZE_DAYS = 30;
const MIN_SESSIONS = 2;

interface BeforeInstallPromptEvent extends Event {
  preventDefault: () => void;
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Count one session per browser tab lifetime. Returns the running total. */
function bumpSessionCount(): number {
  if (sessionStorage.getItem('sessionCounted')) {
    return parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '1', 10);
  }
  sessionStorage.setItem('sessionCounted', '1');
  const count = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10) + 1;
  localStorage.setItem(SESSION_COUNT_KEY, String(count));
  return count;
}

export const InstallPrompt: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as Window & { MSStream?: unknown }).MSStream;
    const android = /android/i.test(navigator.userAgent);
    setIsIOS(ios);

    const dismissedAt = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    const daysSinceDismissed = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    const sessions = bumpSessionCount();

    const eligible =
      !standalone && (ios || android) && daysSinceDismissed > SNOOZE_DAYS && sessions >= MIN_SESSIONS;

    if (eligible && ios) {
      setShowBanner(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      const installEvent = e as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      if (eligible) setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowBanner(false);
    } else if (isIOS) {
      setShowIosSteps((v) => !v);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3 lg:hidden">
      <div className="mx-auto max-w-md rounded-xl border border-stone-200 bg-white p-3 shadow-elevation-3">
        <div className="flex items-center gap-3">
          <img
            src="/icons/icon-96x96.png"
            alt=""
            aria-hidden="true"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-stone-900">Install ExpenseApp</p>
            <p className="truncate text-xs text-stone-500">
              One tap from your home screen — and flight reminders need it on iPhone
            </p>
          </div>
          <button
            onClick={handleInstallClick}
            className="btn-primary min-h-[40px] shrink-0 px-3 py-1.5 text-xs"
          >
            {isIOS ? 'How' : (
              <>
                <Download className="h-3.5 w-3.5" />
                Install
              </>
            )}
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss install suggestion"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showIosSteps && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-stone-100 pt-3 text-sm text-stone-600">
            <span className="flex items-center gap-2">
              1. Tap <Share className="inline h-4 w-4 text-brand-600" aria-label="Share" /> Share in
              Safari
            </span>
            <span className="flex items-center gap-2">
              2. Choose{' '}
              <PlusSquare className="inline h-4 w-4 text-brand-600" aria-label="Add to Home Screen" />{' '}
              “Add to Home Screen”
            </span>
            <span>3. Open the app from your home screen</span>
          </div>
        )}
      </div>
    </div>
  );
};
