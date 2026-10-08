import { describe, it, expect } from 'vitest';
import { describeUserAgent } from '../userAgent';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

describe('describeUserAgent', () => {
  it.each([
    [UA.iphoneSafari, 'Safari · iOS', 'mobile'],
    [UA.iphoneChrome, 'Chrome · iOS', 'mobile'],
    [UA.macChrome, 'Chrome · macOS', 'desktop'],
    [UA.macSafari, 'Safari · macOS', 'desktop'],
    [UA.winEdge, 'Edge · Windows', 'desktop'],
    [UA.winFirefox, 'Firefox · Windows', 'desktop'],
    [UA.androidChrome, 'Chrome · Android', 'mobile'],
    [UA.ipad, 'Safari · iOS', 'mobile'],
  ])('reads %s', (ua, label, device) => {
    expect(describeUserAgent(ua)).toMatchObject({ label, device });
  });

  it.each([null, '', 'curl/8.4.0'])('calls %j unknown', (ua) => {
    expect(describeUserAgent(ua).label).toBe(ua === 'curl/8.4.0' ? 'Other' : 'Unknown');
  });
});
