import { describe, it, expect } from 'vitest';
import { initialPageFromHash } from '../initialPageFromHash';

describe('initialPageFromHash', () => {
  it('routes an expense link to expenses', () => { expect(initialPageFromHash('#expense=x')).toBe('expenses'); });
  it('routes an event link with tab=my to the checklist', () => { expect(initialPageFromHash('#event=x&tab=my')).toBe('checklist'); });
  it('routes an event link with tab=samples to the checklist', () => { expect(initialPageFromHash('#event=x&tab=samples')).toBe('checklist'); });
  it('keeps a bare event link on the dashboard', () => { expect(initialPageFromHash('#event=x')).toBe('dashboard'); });
  it('defaults to the dashboard with no hash', () => { expect(initialPageFromHash('')).toBe('dashboard'); });
  it('routes an expenses-for-event link to expenses', () => { expect(initialPageFromHash('#expenses-event=x')).toBe('expenses'); });
  it('routes the users link to settings', () => { expect(initialPageFromHash('#users')).toBe('settings'); });
  it('routes the booth inventory link to booths', () => { expect(initialPageFromHash('#booths')).toBe('booths'); });
  it('routes the badge scans link to leads', () => { expect(initialPageFromHash('#leads')).toBe('leads'); });
  it('keeps an unknown hash on the dashboard', () => { expect(initialPageFromHash('#nope')).toBe('dashboard'); });
});
