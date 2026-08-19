import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRepository } from '../../src/database/repositories/UserRepository';

describe('UserRepository SSO methods', () => {
  let repo: UserRepository;
  let executeQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repo = new UserRepository();
    executeQuery = vi.fn();
    (repo as any).executeQuery = executeQuery;
  });

  it('findByAuthentikSub queries by authentik_sub and returns the row', async () => {
    const row = { id: 'u1', username: 'jane', name: 'Jane', email: 'j@x.com', role: 'admin', authentik_sub: 'sub-1', created_at: '', updated_at: '' };
    executeQuery.mockResolvedValue({ rows: [row] });
    const result = await repo.findByAuthentikSub('sub-1');
    expect(result).toEqual(row);
    expect(executeQuery.mock.calls[0][0]).toContain('authentik_sub = $1');
    expect(executeQuery.mock.calls[0][1]).toEqual(['sub-1']);
  });

  it('findByAuthentikSub returns null when no row', async () => {
    executeQuery.mockResolvedValue({ rows: [] });
    expect(await repo.findByAuthentikSub('nope')).toBeNull();
  });

  it('findByEmailCiWithSso matches email case-insensitively and includes authentik_sub', async () => {
    const row = { id: 'u2', username: 'bob', name: 'Bob', email: 'Bob@X.com', role: 'salesperson', authentik_sub: null, created_at: '', updated_at: '' };
    executeQuery.mockResolvedValue({ rows: [row] });
    const result = await repo.findByEmailCiWithSso('bob@x.COM');
    expect(result).toEqual(row);
    expect(executeQuery.mock.calls[0][0]).toContain('LOWER(TRIM(email)) = LOWER($1)');
    expect(executeQuery.mock.calls[0][1]).toEqual(['bob@x.COM']);
  });

  it('linkAuthentikSub sets authentik_sub and sso_linked_at', async () => {
    executeQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    await repo.linkAuthentikSub('u2', 'sub-2');
    const sql = executeQuery.mock.calls[0][0];
    expect(sql).toContain('authentik_sub = $1');
    expect(sql).toContain('sso_linked_at = CURRENT_TIMESTAMP');
    expect(executeQuery.mock.calls[0][1]).toEqual(['sub-2', 'u2']);
  });

  it('updateLastSsoLogin touches last_sso_login', async () => {
    executeQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    await repo.updateLastSsoLogin('u1');
    expect(executeQuery.mock.calls[0][0]).toContain('last_sso_login = CURRENT_TIMESTAMP');
    expect(executeQuery.mock.calls[0][1]).toEqual(['u1']);
  });

  it('createSsoUser inserts with pending role and sso columns', async () => {
    const returned = { id: 'u3', username: 'new', name: 'New', email: 'n@x.com', role: 'pending', created_at: '', updated_at: '' };
    executeQuery.mockResolvedValue({ rows: [returned] });
    const result = await repo.createSsoUser({
      username: 'new', name: 'New', email: 'n@x.com', password: 'hash', authentikSub: 'sub-3',
    });
    expect(result).toEqual(returned);
    const sql = executeQuery.mock.calls[0][0];
    expect(sql).toContain("'pending'");
    expect(sql).toContain('authentik_sub');
    expect(sql).toContain('sso_linked_at');
    expect(executeQuery.mock.calls[0][1]).toEqual(['new', 'New', 'n@x.com', 'hash', 'sub-3']);
  });
});
