/**
 * Guards on PATCH /api/users/:id/active.
 *
 * The endpoint exists because hard-deleting a user orphans every expense they
 * filed in Midas, so the tests here mostly pin down the ways deactivation must
 * refuse to run rather than the happy path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/database/repositories', () => ({
  userRepository: { findById: vi.fn(), setActive: vi.fn() },
  auditLogRepository: { create: vi.fn().mockResolvedValue({}) },
}));

import { userRepository, auditLogRepository } from '../../src/database/repositories';
import { handleSetUserActive } from '../../src/routes/users';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

const admin = { id: 'admin-1', username: 'sahil', role: 'admin' };

function req(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: 'target-1' },
    body: { is_active: false },
    user: admin,
    method: 'PATCH',
    originalUrl: '/api/users/target-1/active',
    ...overrides,
  } as any;
}

describe('PATCH /api/users/:id/active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (userRepository.findById as any).mockResolvedValue({ id: 'target-1', username: 'rita' });
    (userRepository.setActive as any).mockImplementation((id: string, isActive: boolean) =>
      Promise.resolve({ id, username: 'rita', is_active: isActive })
    );
    (auditLogRepository.create as any).mockResolvedValue({});
  });

  it('deactivates a user and returns the updated row', async () => {
    const res = mockRes();
    await handleSetUserActive(req(), res);

    expect(userRepository.setActive).toHaveBeenCalledWith('target-1', false);
    expect(res.json).toHaveBeenCalledWith({ id: 'target-1', username: 'rita', is_active: false });
  });

  it('reactivates a user', async () => {
    const res = mockRes();
    await handleSetUserActive(req({ body: { is_active: true } }), res);

    expect(userRepository.setActive).toHaveBeenCalledWith('target-1', true);
  });

  it('records the change in the audit log', async () => {
    await handleSetUserActive(req(), mockRes());

    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_deactivated',
        entityType: 'user',
        entityId: 'target-1',
        userId: 'admin-1',
      })
    );
  });

  it('still applies the change when the audit write fails', async () => {
    (auditLogRepository.create as any).mockRejectedValue(new Error('audit table gone'));
    const res = mockRes();

    await handleSetUserActive(req(), res);

    expect(userRepository.setActive).toHaveBeenCalledWith('target-1', false);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('rejects a non-boolean is_active', async () => {
    const res = mockRes();
    await handleSetUserActive(req({ body: { is_active: 'false' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(userRepository.setActive).not.toHaveBeenCalled();
  });

  it('404s for an unknown user', async () => {
    (userRepository.findById as any).mockResolvedValue(null);
    const res = mockRes();

    await handleSetUserActive(req(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(userRepository.setActive).not.toHaveBeenCalled();
  });

  it('refuses to let an admin deactivate themselves', async () => {
    (userRepository.findById as any).mockResolvedValue({ id: 'admin-1', username: 'sahil' });
    const res = mockRes();

    await handleSetUserActive(req({ params: { id: 'admin-1' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(userRepository.setActive).not.toHaveBeenCalled();
  });

  it('refuses to deactivate the system admin account', async () => {
    (userRepository.findById as any).mockResolvedValue({ id: 'sys-1', username: 'admin' });
    const res = mockRes();

    await handleSetUserActive(req({ params: { id: 'sys-1' } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(userRepository.setActive).not.toHaveBeenCalled();
  });

  it('allows reactivating the system admin, since only deactivation is dangerous', async () => {
    (userRepository.findById as any).mockResolvedValue({ id: 'sys-1', username: 'admin' });
    const res = mockRes();

    await handleSetUserActive(req({ params: { id: 'sys-1' }, body: { is_active: true } }), res);

    expect(userRepository.setActive).toHaveBeenCalledWith('sys-1', true);
  });
});
