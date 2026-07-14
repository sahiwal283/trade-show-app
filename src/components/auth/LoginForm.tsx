import React, { useState } from 'react';
import { User, Key, ArrowRight, AlertCircle, UserPlus } from 'lucide-react';
import { RegistrationForm } from './RegistrationForm';

interface LoginFormProps {
  onLogin: (username: string, password: string) => Promise<boolean> | boolean;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRegistration, setShowRegistration] = useState(false);

  // Detect environment based on hostname
  const isProduction = window.location.hostname.includes('duckdns.org') || 
                       window.location.hostname.includes('expapp') ||
                       window.location.hostname === 'localhost' && window.location.port === '80';
  
  const isSandbox = !isProduction;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const success = await onLogin(username, password);
      if (!success) {
        setError('Invalid username or password');
      }
    } catch (error: unknown) {
      // Handle network errors and other exceptions
      console.error('[LoginForm] Login error:', error);
      
      // Import error handler to get user-friendly messages
      let errorMessage = 'Failed to log in. Please try again.';
      
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        // Check for network-related errors
        if (
          errorMsg.includes('failed to fetch') ||
          errorMsg.includes('networkerror') ||
          errorMsg.includes('network error') ||
          errorMsg.includes('load failed') ||
          errorMsg.includes('connection refused') ||
          errorMsg.includes('cors')
        ) {
          errorMessage = 'Network error. Please check your connection and ensure the API server is running.';
        } else if (errorMsg.includes('timeout')) {
          errorMessage = 'Request timeout. Please check your connection and try again.';
        } else {
          // Try to use error message if it's user-friendly
          errorMessage = error.message || errorMessage;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Sandbox test accounts
  const sandboxUsers = [
    { username: 'admin', password: 'sandbox123', role: 'Administrator' },
    { username: 'coordinator', password: 'sandbox123', role: 'Event Coordinator' },
    { username: 'salesperson', password: 'sandbox123', role: 'Salesperson' },
    { username: 'accountant', password: 'sandbox123', role: 'Accountant' },
    { username: 'developer', password: 'sandbox123', role: 'Developer' },
    { username: 'temporary', password: 'changeme123', role: 'Temporary Attendee' }
  ];

  // Production accounts - credentials not displayed for security
  const productionUsers: { username: string; password: string; role: string; }[] = [];

  const displayUsers = isSandbox ? sandboxUsers : productionUsers;
  const passwordHint = isSandbox ? 'sandbox123' : 'Use your assigned credentials';

  // Show registration form if requested
  if (showRegistration) {
    return <RegistrationForm onBack={() => setShowRegistration(false)} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50 flex items-center justify-center px-4">
      {/* Layered background: soft brand washes + faint grid texture (pure CSS) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-accent-200/40 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(15,23,42,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.045) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent)',
          }}
        />
      </div>

      <div className="relative max-w-md w-full px-0 py-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-elevation-3 ring-1 ring-gray-900/5 p-6 sm:p-8 md:p-10">
          <div className="text-center mb-10">
            <div className="w-14 h-14 bg-gradient-to-br from-brand-500 to-accent-500 rounded-2xl shadow-brand flex items-center justify-center mx-auto mb-5">
              <Key className="w-7 h-7 text-white" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Welcome back</h1>
            <p className="text-sm text-gray-500 mt-2">Sign in to TradeShow Expense Manager</p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3.5" role="alert">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 w-5 h-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Sign in failed</p>
                  <p className="text-sm text-red-700 mt-0.5">{error}</p>
                </div>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="field-label" htmlFor="login-username">
                Username or email
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="login-username"
                  type="text"
                  name="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field pl-10 py-3"
                  placeholder="Username or email"
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  required
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="login-password"
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10 py-3"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 text-base group mt-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* New User Registration Button */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-gray-500">Don't have an account?</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRegistration(true)}
              className="btn-secondary mt-4 w-full py-3 text-brand-700 border-brand-200 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
            >
              <UserPlus className="w-4 h-4" />
              Create New Account
            </button>
          </div>

          {displayUsers.length > 0 && (
            <div className="mt-10 pt-5 border-t border-dashed border-gray-200">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
                {isSandbox ? 'Sandbox test accounts' : 'Production accounts'}
              </h3>
              <div className="grid grid-cols-1 gap-1">
                {displayUsers.map((user, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setUsername(user.username);
                      setPassword(user.password);
                    }}
                    className="text-left px-3 py-2 min-h-[44px] lg:min-h-0 text-sm rounded-lg transition-colors hover:bg-gray-50 focus-visible:bg-gray-50"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <div className="min-w-0 truncate">
                        <span className="font-medium text-gray-700">{user.username}</span>
                        <span className="text-gray-400 ml-2 text-xs">{user.role}</span>
                      </div>
                      <span className="shrink-0 text-[11px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{user.password}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};