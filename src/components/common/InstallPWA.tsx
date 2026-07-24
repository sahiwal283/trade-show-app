import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPWA: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) {
      return; // Already installed, don't show button
    }

    // Check if user has dismissed the banner before
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return; // Don't show again for 7 days
      }
    }

    // Listen for the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      const installEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(installEvent);
      setShowInstallButton(true);
      
      // Show banner after 10 seconds of being on the dashboard
      setTimeout(() => {
        setShowBanner(true);
      }, 10000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Fallback for browsers that don't support the install prompt
      alert('To install this app:\n\niOS: Tap Share → Add to Home Screen\nAndroid: Tap Menu → Install App');
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }

    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setShowInstallButton(false);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showInstallButton) {
    return null;
  }

  // Banner notification (shows after 10 seconds)
  if (showBanner) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 bg-white rounded-xl shadow-2xl border-2 border-blue-500 p-4 z-50 animate-slide-up">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-stone-400 hover:text-stone-600"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-stone-900 mb-1">Install App</h3>
            <p className="text-sm text-stone-600 mb-3">
              Add to your home screen for quick access and offline support
            </p>
            <div className="flex space-x-2">
              <button
                onClick={handleInstallClick}
                className="btn-primary flex-1"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="btn-ghost"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compact button version (always visible when available)
  return (
    <button
      onClick={handleInstallClick}
      className="btn-secondary"
    >
      <Download className="w-4 h-4" />
      <span className="hidden sm:inline">Add to Home Screen</span>
      <span className="sm:hidden">Install</span>
    </button>
  );
};

