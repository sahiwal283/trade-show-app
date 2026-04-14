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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full px-3 sm:px-0">
        <div className="bg-white rounded-2xl shadow-xl p-3 sm:p-4 sm:p-5 md:p-6 lg:p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Key className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Welcome Back</h1>
            <p className="text-gray-600 mt-2">Sign in to TradeShow Expense Manager</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 mb-6">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <span className="text-red-700 text-sm">{error}</span>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 md:space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username or email
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  name="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
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
              className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 text-white py-3 px-4 rounded-lg font-medium hover:from-blue-600 hover:to-emerald-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 flex items-center justify-center group disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* New User Registration Button */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Don't have an account?</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRegistration(true)}
              className="mt-4 w-full bg-white border-2 border-blue-500 text-blue-600 py-3 px-4 rounded-lg font-medium hover:bg-blue-50 transition-all duration-200 flex items-center justify-center group"
            >
              <UserPlus className="mr-2 w-5 h-5" />
              Create New Account
            </button>
          </div>

          {displayUsers.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {isSandbox ? 'Sandbox Test Accounts:' : 'Production Accounts:'}
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {displayUsers.map((user, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setUsername(user.username);
                      setPassword(user.password);
                    }}
                    className="text-left p-3 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold">{user.username}</span>
                        <span className="text-gray-500 ml-2">({user.role})</span>
                      </div>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{user.password}</span>
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