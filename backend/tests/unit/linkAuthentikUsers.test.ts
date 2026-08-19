import { describe, it, expect } from 'vitest';
import { parsePairs, planLink, sanitizeAxiosError } from '../../src/scripts/linkAuthentikUsers';
import { AxiosError } from 'axios';

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

describe('sanitizeAxiosError', () => {
  it('sanitizes AxiosError to exclude Bearer token', () => {
    const axiosError = new AxiosError('Request failed', '401', {
      method: 'get',
      url: 'https://auth.example.com/api/v3/core/users/',
    });
    axiosError.response = {
      status: 401,
      data: { detail: 'Unauthorized' },
      headers: { 'authorization': 'Bearer secret_token_12345' },
      statusText: 'Unauthorized',
      config: axiosError.config,
    };
    const sanitized = sanitizeAxiosError(axiosError);
    const message = sanitized.message;
    expect(message).toContain('Authentik API');
    expect(message).toContain('GET');
    expect(message).toContain('401');
    expect(message).not.toContain('Bearer');
    expect(message).not.toContain('secret_token');
  });

  it('sanitizes regular Error objects', () => {
    const error = new Error('Connection timeout');
    const sanitized = sanitizeAxiosError(error);
    expect(sanitized.message).toBe('Connection timeout');
  });

  it('sanitizes non-Error objects', () => {
    const sanitized = sanitizeAxiosError('some string error');
    expect(sanitized.message).toBe('some string error');
  });
});
