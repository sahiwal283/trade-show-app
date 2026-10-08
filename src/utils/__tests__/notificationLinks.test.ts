import { describe, it, expect } from 'vitest';
import cases from '../__fixtures__/notificationLinks.json';
import { notificationTarget, hashFromPushUrl, eventFilterFromHash, PAGE_ONLY_HASHES } from '../notificationLinks';
import { initialPageFromHash } from '../initialPageFromHash';

describe('notificationTarget (shared fixture with the backend)', () => {
  it.each(cases)('maps $link to page $page, hash $hash', ({ link, page, hash }) => {
    expect(notificationTarget(link as never)).toEqual({ page, hash });
  });

  it.each(cases.filter((c) => c.hash))('a cold push to $url opens the same page as a bell tap', ({ url, page }) => {
    expect(initialPageFromHash(url.slice(1))).toBe(page);
  });

  it.each(cases.filter((c) => c.hash))('the push URL $url carries the same hash as the bell tap', ({ url, hash }) => {
    expect(hashFromPushUrl(url)).toBe(hash);
  });
});

describe('hashFromPushUrl', () => {
  it('returns null for anything that is not a URL with a hash', () => {
    expect(hashFromPushUrl(undefined)).toBeNull();
    expect(hashFromPushUrl(null)).toBeNull();
    expect(hashFromPushUrl(42)).toBeNull();
    expect(hashFromPushUrl('/')).toBeNull();
    expect(hashFromPushUrl('/#')).toBeNull();
  });
  it('reads the hash from a relative or absolute URL', () => {
    expect(hashFromPushUrl('/#event=ev-1&tab=my')).toBe('event=ev-1&tab=my');
    expect(hashFromPushUrl('https://argo.example/#leads')).toBe('leads');
  });
});

describe('eventFilterFromHash', () => {
  it('reads the event from the event-card link and the notification link', () => {
    expect(eventFilterFromHash('#event=ev-1')).toBe('ev-1');
    expect(eventFilterFromHash('#expenses-event=ev-2')).toBe('ev-2');
  });
  it('returns null for other hashes', () => {
    expect(eventFilterFromHash('#expense=x')).toBeNull();
    expect(eventFilterFromHash('#status=pending')).toBeNull();
    expect(eventFilterFromHash('')).toBeNull();
  });
});

describe('PAGE_ONLY_HASHES', () => {
  it('holds the hashes that only choose a page', () => {
    expect([...PAGE_ONLY_HASHES].sort()).toEqual(['#booths', '#leads']);
  });
});
