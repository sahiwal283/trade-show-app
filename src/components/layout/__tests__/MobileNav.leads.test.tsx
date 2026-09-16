import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileNav } from '../MobileNav';

const nav = (role: string) =>
  render(
    <MobileNav
      user={{ id: 'u1', name: 'X', username: 'x', email: 'x@y.com', role } as any}
      currentPage="dashboard"
      onNavigate={vi.fn()}
      onQuickAdd={vi.fn()}
      onOpenMenu={vi.fn()}
    />
  );

describe('MobileNav — Leads tab', () => {
  it('gives salespeople a Leads tab: it is what they do at the booth', () => {
    nav('salesperson');
    expect(screen.getByRole('button', { name: /leads/i })).toBeInTheDocument();
  });

  it('gives coordinators the same tab', () => {
    nav('coordinator');
    expect(screen.getByRole('button', { name: /leads/i })).toBeInTheDocument();
  });

  it('leaves accountants on Reports — they never scan badges', () => {
    nav('accountant');
    expect(screen.queryByRole('button', { name: /leads/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reports/i })).toBeInTheDocument();
  });
});
