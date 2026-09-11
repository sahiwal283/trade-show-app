/**
 * The admin table's deactivate control, which replaced the hard delete after a
 * deletion orphaned a coordinator's 125 Midas expenses (Sept 11 2026).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserManagementTable } from '../UserManagement/UserManagementTable';
import type { User } from '../../../App';

const roles = [{ id: 'r1', name: 'coordinator', label: 'Show Coordinator' }];

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'Rita Dubb',
    username: 'rita',
    email: 'rita@cooliohcandy.com',
    role: 'coordinator',
    ...overrides,
  } as User;
}

function renderTable(users: User[], onSetUserActive = vi.fn()) {
  render(
    <UserManagementTable
      users={users}
      roles={roles}
      currentUserId="me"
      isPendingUser={(u) => u.role === 'pending'}
      getRoleColor={() => ''}
      getRoleLabel={(r) => r}
      onEditUser={vi.fn()}
      onSetUserActive={onSetUserActive}
      onInviteUser={vi.fn()}
      onActivateUser={vi.fn()}
      onRejectUser={vi.fn()}
    />
  );
  return onSetUserActive;
}

describe('UserManagementTable deactivation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers no hard-delete control at all', () => {
    renderTable([makeUser()]);

    expect(screen.queryByTitle(/delete/i)).not.toBeInTheDocument();
  });

  it('deactivates an active user', async () => {
    const onSetUserActive = renderTable([makeUser()]);

    await userEvent.click(screen.getByTitle('Deactivate User'));

    expect(onSetUserActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), false);
  });

  it('shows an Inactive status and a reactivate control for a deactivated user', async () => {
    const onSetUserActive = renderTable([makeUser({ is_active: false })]);

    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.queryByTitle('Deactivate User')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTitle('Reactivate User'));

    expect(onSetUserActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), true);
  });

  it('treats a user with no is_active field as active', () => {
    renderTable([makeUser()]);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('cannot deactivate yourself or the system admin', () => {
    renderTable([
      makeUser({ id: 'me', name: 'Me', username: 'me' }),
      makeUser({ id: 'sys', name: 'Admin', username: 'admin' }),
    ]);

    const buttons = screen.getAllByTitle(/Cannot deactivate/);
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b).toBeDisabled());
  });

  it('hides edit and invite for a deactivated user, since neither does anything', () => {
    renderTable([makeUser({ is_active: false })]);

    expect(screen.queryByTitle('Edit User')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Send Invitation')).not.toBeInTheDocument();
  });

  it('keeps a deactivated user listed rather than hiding them', () => {
    renderTable([makeUser({ is_active: false })]);

    const row = screen.getByText('Rita Dubb').closest('tr') as HTMLElement;
    expect(within(row).getByText('Inactive')).toBeInTheDocument();
  });
});
