import { describe, it, expect } from 'vitest';
import { parsePairs, planLink } from '../../src/scripts/linkAuthentikUsers';

describe('parsePairs', () => {
  it('parses one- and two-column lines, skipping comments and blanks', () => {
    const text = `# merge list
jane@x.com
bob,robert@corp.com

# trailing comment`;
    expect(parsePairs(text)).toEqual([
      { app: 'jane@x.com', authentik: 'jane@x.com' },
      { app: 'bob', authentik: 'robert@corp.com' },
    ]);
  });
});

describe('planLink', () => {
  const appUser = { id: 'u1', username: 'jane', email: 'jane@x.com', authentik_sub: null };
  const ak = { uuid: 'ak-1', username: 'jane', email: 'jane@x.com' };
  const pair = { app: 'jane@x.com', authentik: 'jane@x.com' };

  it('links when both sides match exactly and app user is unlinked', () => {
    expect(planLink(appUser, [ak], pair)).toEqual({ action: 'link', sub: 'ak-1', reason: expect.any(String) });
  });

  it('not_found when app user missing', () => {
    expect(planLink(null, [ak], pair).action).toBe('not_found');
  });

  it('not_found when no exact authentik match', () => {
    expect(planLink(appUser, [{ uuid: 'x', username: 'janet', email: 'janet@x.com' }], pair).action).toBe('not_found');
  });

  it('ambiguous when multiple exact authentik matches', () => {
    expect(planLink(appUser, [ak, { uuid: 'ak-2', username: 'other', email: 'jane@x.com' }], pair).action).toBe('ambiguous');
  });

  it('skip when already linked to the same sub', () => {
    expect(planLink({ ...appUser, authentik_sub: 'ak-1' }, [ak], pair).action).toBe('skip');
  });

  it('conflict when linked to a different sub', () => {
    expect(planLink({ ...appUser, authentik_sub: 'other' }, [ak], pair).action).toBe('conflict');
  });
});
