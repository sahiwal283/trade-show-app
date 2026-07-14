import React, { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

interface InstallPromptProps {}

export const InstallPrompt: React.FC<InstallPromptProps> = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  // beforeinstallprompt event type (browser API, not in standard TypeScript)
  interface BeforeInstallPromptEvent extends Event {
    preventDefault: () => void;
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
  
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);

    // Check if iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
    setIsIOS(ios);

    // Check if Android
    const android = /android/i.test(navigator.userAgent);
    setIsAndroid(android);

    // Check if user has dismissed the prompt before
    const dismissed = localStorage.getItem('installPromptDismissed');
    const dismissedTime = dismissed ? parseInt(dismissed) : 0;
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);

    // Show prompt if not installed, not dismissed recently, and on mobile
    if (!standalone && (ios || android) && daysSinceDismissed > 7) {
      // For iOS, show immediately
      if (ios) {
        setTimeout(() => setShowPrompt(true), 2000);
      }
    }

    // For Android, listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      const installEvent = e as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      
      // Only show prompt if not dismissed recently
      if (daysSinceDismissed > 7) {
        setTimeout(() => setShowPrompt(true), 2000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android - use native prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      
      setDeferredPrompt(null);
      setShowPrompt(false);
    } else if (isIOS) {
      // iOS - just keep the instructions visible, don't hide
      // User will manually dismiss after following instructions
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('installPromptDismissed', Date.now().toString());
    setShowPrompt(false);
  };

  if (!showPrompt || isStandalone) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
        {/* Popup */}
        <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full shadow-2xl transform transition-all">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-blue-500 to-emerald-500 p-6 rounded-t-3xl sm:rounded-t-3xl relative">
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center space-x-4 mb-3">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                <img src="/icons/icon-192x192.png" alt="App Icon" className="w-14 h-14 rounded-xl" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Install ExpenseApp</h3>
                <p className="text-blue-100 text-sm">Quick access from your home screen</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {isIOS ? (
              // iOS Instructions
              <div className="space-y-4">
                <p className="text-stone-700 text-center font-medium mb-4">
                  Add ExpenseApp to your home screen for easy access!
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-start space-x-3 bg-stone-50 p-3 rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                      1
                    </div>
                    <div>
                      <p className="text-stone-900 font-medium">Tap the Share button</p>
                      <p className="text-stone-600 text-sm">
                        Look for the <span className="inline-flex items-center px-2 py-0.5 bg-stone-200 rounded mx-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                          </svg>
                        </span> icon at the bottom of Safari
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 bg-stone-50 p-3 rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold">
                      2
                    </div>
                    <div>
                      <p className="text-stone-900 font-medium">Select "Add to Home Screen"</p>
                      <p className="text-stone-600 text-sm">Scroll down in the menu if needed</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3 bg-stone-50 p-3 rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                      3
                    </div>
                    <div>
                      <p className="text-stone-900 font-medium">Tap "Add"</p>
                      <p className="text-stone-600 text-sm">The app will appear on your home screen!</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-stone-200">
                  <button
                    onClick={handleDismiss}
                    className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-emerald-600 transition-all"
                  >
                    Got it!
                  </button>
                </div>
              </div>
            ) : isAndroid && deferredPrompt ? (
              // Android with native prompt
              <div className="space-y-4">
                <div className="flex justify-center mb-4">
                  <Smartphone className="w-20 h-20 text-blue-500" />
                </div>
                
                <div className="text-center">
                  <p className="text-stone-700 font-medium mb-2">
                    Install ExpenseApp for quick access!
                  </p>
                  <p className="text-stone-600 text-sm mb-6">
                    Get the full app experience with offline access and faster loading times.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleInstallClick}
                    className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-emerald-600 transition-all flex items-center justify-center space-x-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Install App</span>
                  </button>
                  
                  <button
                    onClick={handleDismiss}
                    className="w-full bg-stone-100 text-stone-700 py-3 rounded-xl font-medium hover:bg-stone-200 transition-colors"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            ) : (
              // Generic mobile prompt
              <div className="space-y-4">
                <p className="text-stone-700 text-center font-medium">
                  Install ExpenseApp on your device for easy access!
                </p>
                
                <div className="text-center text-sm text-stone-600">
                  Look for the "Add to Home Screen" or "Install" option in your browser menu.
                </div>

                <button
                  onClick={handleDismiss}
                  className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-emerald-600 transition-all mt-4"
                >
                  Got it!
                </button>
              </div>
            )}

            {/* Benefits */}
            <div className="mt-6 pt-4 border-t border-stone-200">
              <p className="text-xs text-stone-500 text-center mb-2">Benefits of installing:</p>
              <div className="flex justify-around text-xs text-stone-600">
                <span>⚡ Faster</span>
                <span>📱 Easy Access</span>
                <span>🔒 More Secure</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

