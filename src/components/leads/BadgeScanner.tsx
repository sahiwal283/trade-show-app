/**
 * Fullscreen badge viewfinder.
 *
 * The active company is pinned to the top of the frame on purpose: a rep
 * working two brands at one booth must never have to wonder which CRM the
 * last twenty leads went to.
 */

import React, { useEffect } from 'react';
import { X, Zap, ZapOff, Keyboard } from 'lucide-react';
import { useBadgeDecoder } from './hooks/useBadgeDecoder';
import { parseBadgePayload, ParsedBadge } from '../../utils/badge/parseBadgePayload';
import { haptics } from '../../utils/haptics';

export interface ScannedBadge {
  rawPayload: string;
  parsed: ParsedBadge;
}

interface BadgeScannerProps {
  entity: string;
  onCaptured: (badge: ScannedBadge) => void;
  onManualEntry: () => void;
  onClose: () => void;
}

export const BadgeScanner: React.FC<BadgeScannerProps> = ({
  entity, onCaptured, onManualEntry, onClose,
}) => {
  const { state, error, videoRef, start, stop, torchAvailable, torchOn, toggleTorch } =
    useBadgeDecoder({
      onDecode: (rawPayload) => {
        haptics.action();
        onCaptured({ rawPayload, parsed: parseBadgePayload(rawPayload) });
      },
    });

  useEffect(() => { void start(); }, [start]);

  const handleClose = () => { stop(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-2 p-4 text-white">
        <span className="rounded-full bg-white/15 px-3 py-1 text-sm">
          Scanning for - <strong>{entity}</strong>
        </span>
        <button
          onClick={handleClose}
          aria-label="Close scanner"
          className="rounded-full bg-white/15 p-2 focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* A visible target box: PDF417 is wide and short, and users otherwise
            frame it like a QR code and never get a lock. */}
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-lg border-2 border-white/70" />
      </div>

      {(state === 'denied' || state === 'unsupported' || state === 'error') && (
        <div className="bg-red-900/90 p-4 text-sm text-white" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 p-6">
        {torchAvailable && (
          <button
            onClick={toggleTorch}
            aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-white"
          >
            {torchOn ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
            Torch
          </button>
        )}
        <button
          onClick={() => { stop(); onManualEntry(); }}
          className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-white"
        >
          <Keyboard className="h-5 w-5" />
          Enter manually
        </button>
      </div>
    </div>
  );
};
