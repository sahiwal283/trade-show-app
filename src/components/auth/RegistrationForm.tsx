import React, { useState } from 'react';
import { User, Mail, Key, ArrowLeft, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { apiClient } from '../../utils/apiClient';
import { AppError } from '../../types/types';

interface RegistrationFormProps {
  onBack: () => void;
}

interface PasswordRule {
  /** Shown in the live "Password Requirements" checklist. */
  label: string;
  /** Short phrase for the "Still needed:" hint under the strength bar. */
  short: string;
  /** Same wording the backend returns in `details`, so both paths read alike. */
  detail: string;
  test: (password: string) => boolean;
}

// Must stay in step with validatePassword() in backend/src/routes/auth.ts.
// The backend is authoritative; this exists so the meter never calls a
// password acceptable when the server will reject it.
const PASSWORD_RULES: PasswordRule[] = [
  {
    label: 'At least 8 characters long',
    short: 'at least 8 characters',
    detail: 'Password must be at least 8 characters long',
    test: (p) => p.length >= 8,
  },
  {
    label: 'At least one uppercase letter',
    short: 'an uppercase letter',
    detail: 'Password must contain at least one uppercase letter',
    test: (p) => /[A-Z]/.test(p),
  },
  {
    label: 'At least one lowercase letter',
    short: 'a lowercase letter',
    detail: 'Password must contain at least one lowercase letter',
    test: (p) => /[a-z]/.test(p),
  },
  {
    label: 'At least one number',
    short: 'a number',
    detail: 'Password must contain at least one number',
    test: (p) => /[0-9]/.test(p),
  },
  {
    label: 'At least one special character (!@#$%^&*(),.?":{}|<>)',
    short: 'a special character',
    detail: 'Password must contain at least one special character',
    test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p),
  },
];

const getUnmetPasswordRules = (password: string): PasswordRule[] =>
  PASSWORD_RULES.filter((rule) => !rule.test(password));

interface PasswordStrength {
  strength: number;
  label: string;
  color: string;
  textColor: string;
  unmet: PasswordRule[];
}

// Never reports better than "Fair" while any backend rule is unmet.
const getPasswordStrength = (password: string): PasswordStrength => {
  const unmet = getUnmetPasswordRules(password);
  const met = PASSWORD_RULES.length - unmet.length;
  if (unmet.length === 0) {
    return { strength: 4, label: 'Strong', color: 'bg-green-500', textColor: 'text-green-600', unmet };
  }
  if (met <= 2) {
    return { strength: 1, label: 'Weak', color: 'bg-red-500', textColor: 'text-red-600', unmet };
  }
  return { strength: 2, label: 'Fair', color: 'bg-yellow-500', textColor: 'text-yellow-600', unmet };
};

interface RegisterErrorBody {
  error?: string;
  details?: string[];
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({ onBack }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{[key: string]: string}>({});
  
  const passwordStrength = formData.password ? getPasswordStrength(formData.password) : null;

  // Real-time validation
  const validateField = async (field: string, value: string) => {
    if (field === 'username' && value.length >= 3) {
      try {
        const response = await apiClient.post('/auth/check-availability', { username: value });
        if (!response.usernameAvailable) {
          setFieldErrors(prev => ({ ...prev, username: 'Username already taken' }));
        } else {
          setFieldErrors(prev => {
            const { username: _username, ...rest } = prev;
            return rest;
          });
        }
      } catch {
        // Ignore validation errors
      }
    }
    
    if (field === 'email' && value.includes('@')) {
      try {
        const response = await apiClient.post('/auth/check-availability', { email: value });
        if (!response.emailAvailable) {
          setFieldErrors(prev => ({ ...prev, email: 'Email already registered' }));
        } else {
          setFieldErrors(prev => {
            const { email: _email, ...rest } = prev;
            return rest;
          });
        }
      } catch {
        // Ignore validation errors
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Debounced validation
    if (name === 'username' || name === 'email') {
      const timer = setTimeout(() => validateField(name, value), 500);
      return () => clearTimeout(timer);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setValidationErrors([]);
    
    // Client-side validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }
    
    const unmetRules = getUnmetPasswordRules(formData.password);
    if (unmetRules.length > 0) {
      setError('Password does not meet security requirements');
      setValidationErrors(unmetRules.map((rule) => rule.detail));
      setIsLoading(false);
      return;
    }
    
    if (Object.keys(fieldErrors).length > 0) {
      setError('Please fix the errors before submitting');
      setIsLoading(false);
      return;
    }
    
    try {
      const response = await apiClient.post('/auth/register', {
        name: formData.name,
        email: formData.email,
        username: formData.username,
        password: formData.password
      });
      
      if (response.success) {
        setSuccess(true);
      }
    } catch (err) {
      // apiClient throws AppError with statusCode set and the parsed JSON body
      // in `details` whenever the server answered; anything else (offline,
      // DNS, CORS) arrives as a plain Error with no statusCode.
      const appError = err as AppError;
      const body = (appError.details ?? null) as RegisterErrorBody | null;
      const status = appError.statusCode;
      const clientRejected = typeof status === 'number' && status >= 400 && status < 500;

      if (clientRejected && Array.isArray(body?.details) && body.details.length > 0) {
        setValidationErrors(body.details);
        setError(body.error || 'Password does not meet security requirements');
      } else if (clientRejected && (body?.error || appError.message)) {
        setError(body?.error || appError.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    }
    
    setIsLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900 mb-4">Registration Successful!</h2>
              <p className="text-stone-600 mb-6">
                Your account has been created successfully. An administrator will review your account and assign your role.
                You'll be able to log in once your account is activated.
              </p>
              <button
                onClick={onBack}
                className="btn-primary w-full"
              >
                Return to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <button
            onClick={onBack}
            className="flex items-center text-stone-600 hover:text-stone-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Login
          </button>
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900">Create Account</h1>
            <p className="text-stone-600 mt-2">Register for Argo</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-red-700 text-sm font-medium block">{error}</span>
                  {validationErrors.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {validationErrors.map((err, idx) => (
                        <li key={idx} className="text-red-600 text-sm">• {err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"
                  placeholder="Enter your full name"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-4 py-3 border ${fieldErrors.email ? 'border-red-300' : 'border-stone-300'} rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors`}
                  placeholder="Enter your email"
                  required
                />
              </div>
              {fieldErrors.email && (
                <p className="text-red-600 text-sm mt-1">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-4 py-3 border ${fieldErrors.username ? 'border-red-300' : 'border-stone-300'} rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors`}
                  placeholder="Choose a username"
                  required
                />
              </div>
              {fieldErrors.username && (
                <p className="text-red-600 text-sm mt-1">{fieldErrors.username}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full pl-10 pr-12 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"
                  placeholder="Create a strong password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {passwordStrength && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-stone-600">Password Strength:</span>
                    <span className={`font-medium ${passwordStrength.textColor}`}>{passwordStrength.label}</span>
                  </div>
                  <div className="w-full bg-stone-200 rounded-full h-2">
                    <div className={`${passwordStrength.color} h-2 rounded-full transition-all`} style={{ width: `${(passwordStrength.strength / 4) * 100}%` }} />
                  </div>
                  {passwordStrength.unmet.length > 0 && (
                    <p className="text-red-600 text-sm mt-1">
                      Still needed: {passwordStrength.unmet.map((rule) => rule.short).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full pl-10 pr-12 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"
                  placeholder="Confirm your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-red-600 text-sm mt-1">Passwords do not match</p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Password Requirements:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                {PASSWORD_RULES.map((rule) => {
                  const met = formData.password !== '' && rule.test(formData.password);
                  return (
                    <li key={rule.detail} className={met ? 'text-green-700' : undefined}>
                      {met ? '✓' : '•'} {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <button
              type="submit"
              disabled={isLoading || Object.keys(fieldErrors).length > 0}
              className="btn-primary w-full"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Creating Account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowLeft className="w-5 h-5 ml-2 rotate-180" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

