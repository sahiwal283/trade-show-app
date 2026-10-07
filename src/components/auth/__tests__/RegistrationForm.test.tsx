import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegistrationForm } from '../RegistrationForm';
import { apiClient } from '../../../utils/apiClient';
import { AppError } from '../../../utils/errorHandler';

vi.mock('../../../utils/apiClient', () => ({
  apiClient: { post: vi.fn() },
}));

const post = vi.mocked(apiClient.post);

// Mirrors the five rules in backend/src/routes/auth.ts validatePassword().
const MISSING_UPPERCASE = '1714admin$';
const VALID_PASSWORD = '1714Admin$';

const fillForm = (password: string) => {
  fireEvent.change(screen.getByPlaceholderText(/enter your full name/i), { target: { name: 'name', value: 'Kavita' } });
  fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { name: 'email', value: 'kavita@example.com' } });
  fireEvent.change(screen.getByPlaceholderText(/choose a username/i), { target: { name: 'username', value: 'kavita' } });
  fireEvent.change(screen.getByPlaceholderText(/create a strong password/i), { target: { name: 'password', value: password } });
  fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { name: 'confirmPassword', value: password } });
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: /create account/i }));

// Only /auth/register is under test; availability checks always say "free".
const registerRejectsWith = (error: unknown) => {
  post.mockImplementation(async (path: string) => {
    if (path === '/auth/register') throw error;
    return { usernameAvailable: true, emailAvailable: true };
  });
};

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ usernameAvailable: true, emailAvailable: true });
});

describe('RegistrationForm password strength meter', () => {
  it('never reports Good or Strong while a backend requirement is unmet', () => {
    render(<RegistrationForm onBack={() => {}} />);
    fillForm(MISSING_UPPERCASE);

    expect(screen.queryByText('Good')).not.toBeInTheDocument();
    expect(screen.queryByText('Strong')).not.toBeInTheDocument();
    expect(screen.getByText(/still needed/i)).toHaveTextContent(/uppercase/i);
  });

  it('reports Strong once every backend requirement is met', () => {
    render(<RegistrationForm onBack={() => {}} />);
    fillForm(VALID_PASSWORD);

    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(screen.queryByText(/still needed/i)).not.toBeInTheDocument();
  });

  it('blocks submit and names the unmet rule instead of calling the API', async () => {
    render(<RegistrationForm onBack={() => {}} />);
    fillForm(MISSING_UPPERCASE);
    submit();

    expect(await screen.findByText('Password does not meet security requirements')).toBeInTheDocument();
    expect(screen.getByText(/password must contain at least one uppercase letter/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/auth/register', expect.anything());
  });
});

describe('RegistrationForm server error display', () => {
  it('shows the backend password rule list from a 400 response', async () => {
    registerRejectsWith(
      new AppError('Password does not meet security requirements', 'API_ERROR', 400, {
        error: 'Password does not meet security requirements',
        details: ['Password must contain at least one uppercase letter'],
      })
    );
    render(<RegistrationForm onBack={() => {}} />);
    fillForm(VALID_PASSWORD);
    submit();

    expect(await screen.findByText('Password does not meet security requirements')).toBeInTheDocument();
    expect(screen.getByText(/password must contain at least one uppercase letter/i)).toBeInTheDocument();
  });

  it('shows the backend message for a non-password 400 such as a duplicate email', async () => {
    registerRejectsWith(
      new AppError('Email already exists', 'API_ERROR', 400, { error: 'Email already exists' })
    );
    render(<RegistrationForm onBack={() => {}} />);
    fillForm(VALID_PASSWORD);
    submit();

    expect(await screen.findByText('Email already exists')).toBeInTheDocument();
    expect(screen.queryByText(/registration failed/i)).not.toBeInTheDocument();
  });

  it('falls back to a generic message when the request never reached the server', async () => {
    registerRejectsWith(new TypeError('Failed to fetch'));
    render(<RegistrationForm onBack={() => {}} />);
    fillForm(VALID_PASSWORD);
    submit();

    expect(await screen.findByText(/registration failed/i)).toBeInTheDocument();
  });

  it('shows the success screen when the server returns success', async () => {
    post.mockImplementation(async (path: string) =>
      path === '/auth/register' ? { success: true } : { usernameAvailable: true, emailAvailable: true }
    );
    render(<RegistrationForm onBack={() => {}} />);
    fillForm(VALID_PASSWORD);
    submit();

    expect(await screen.findByText(/registration successful/i)).toBeInTheDocument();
  });
});
