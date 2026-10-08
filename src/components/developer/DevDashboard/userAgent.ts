export interface UserAgentInfo {
  browser: string;
  os: string;
  device: 'mobile' | 'desktop';
  label: string;
}

// Order matters: Edge and Chrome on iOS both also say "Safari", and Edge says "Chrome".
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/FxiOS\/|Firefox\//, 'Firefox'],
  [/Safari\//, 'Safari'],
];

// iOS before macOS: iPhone and iPad agents contain "like Mac OS X".
const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** Enough to tell "Chrome on a Mac" from "Safari on a phone"; not a full parser. */
export function describeUserAgent(ua: string | null): UserAgentInfo {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'desktop', label: 'Unknown' };

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  const device = /iPhone|iPad|iPod|Android|Mobile/.test(ua) ? 'mobile' : 'desktop';

  if (!browser || !os) return { browser: browser ?? 'Other', os: os ?? 'Other', device, label: 'Other' };
  return { browser, os, device, label: `${browser} · ${os}` };
}
