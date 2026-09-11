/**
 * The event participant picker: searchable, and never offers a deactivated
 * account for a new assignment.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventFormModal } from '../EventFormModal';
import type { User } from '../../../../App';

const admin = { id: 'admin-1', name: 'Admin', username: 'admin', email: 'a@x.com', role: 'admin' } as User;

const allUsers = [
  { id: 'u1', name: 'Seri Vira', username: 'seri', email: 'admin@cooliohcandy.com', role: 'salesperson' },
  { id: 'u2', name: 'Rita Dubb', username: 'rita', email: 'rita@cooliohcandy.com', role: 'coordinator', is_active: false },
  { id: 'u3', name: 'Shruti Patel', username: 'shruti', email: 'sales@nirvanakulture.com', role: 'salesperson' },
] as User[];

function renderForm(participants: User[] = []) {
  render(
    <EventFormModal
      user={admin}
      allUsers={allUsers}
      showForm={true}
      isSaving={false}
      formData={{
        name: '', venue: '', city: '', state: '',
        startDate: '', endDate: '', showStartDate: '', showEndDate: '',
        travelStartDate: '', travelEndDate: '', budget: '', participants,
      }}
      setFormData={vi.fn()}
      editingEvent={null}
      selectedUserId=""
      setSelectedUserId={vi.fn()}
      newParticipantName=""
      setNewParticipantName={vi.fn()}
      newParticipantEmail=""
      setNewParticipantEmail={vi.fn()}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      onAddParticipant={vi.fn()}
      onAddCustomParticipant={vi.fn()}
      onRemoveParticipant={vi.fn()}
      onResetForm={vi.fn()}
    />
  );
}

describe('event participant picker', () => {
  it('is a searchable combobox, not a plain select', () => {
    renderForm();

    expect(screen.getByRole('combobox', { name: /select from existing users/i })).toBeInTheDocument();
  });

  it('filters the list as you type', async () => {
    renderForm();
    const input = screen.getByRole('combobox', { name: /select from existing users/i });

    await userEvent.type(input, 'shru');

    expect(screen.getByRole('option', { name: /Shruti Patel/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Seri Vira/ })).not.toBeInTheDocument();
  });

  it('matches on email as well as name', async () => {
    renderForm();
    const input = screen.getByRole('combobox', { name: /select from existing users/i });

    await userEvent.type(input, 'nirvanakulture');

    expect(screen.getByRole('option', { name: /Shruti Patel/ })).toBeInTheDocument();
  });

  it('never offers a deactivated user', async () => {
    renderForm();
    const input = screen.getByRole('combobox', { name: /select from existing users/i });

    await userEvent.click(input);
    expect(screen.queryByRole('option', { name: /Rita Dubb/ })).not.toBeInTheDocument();

    await userEvent.type(input, 'rita');
    expect(screen.queryByRole('option', { name: /Rita Dubb/ })).not.toBeInTheDocument();
    expect(screen.getByText('No matching users')).toBeInTheDocument();
  });

  it('still omits users already added to the event', async () => {
    renderForm([allUsers[0]]);

    await userEvent.click(screen.getByRole('combobox', { name: /select from existing users/i }));

    expect(screen.queryByRole('option', { name: /Seri Vira/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Shruti Patel/ })).toBeInTheDocument();
  });
});
