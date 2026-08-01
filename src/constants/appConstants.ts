/**
 * Application Constants
 * Centralized constants for the entire application
 * @version 1.34.4
 */

// ========== DEMO CREDENTIALS (Development Only) ==========
export const DEMO_CREDENTIALS: Record<string, string> = {
  admin: 'admin',
  sarah: 'password',
  mike: 'password',
  lisa: 'password'
};

// ========== USER ROLES ==========
export const USER_ROLES = {
  ADMIN: 'admin',
  COORDINATOR: 'coordinator',
  SALESPERSON: 'salesperson',
  ACCOUNTANT: 'accountant',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// ========== EXPENSE STATUS ==========
export const EXPENSE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NEEDS_FURTHER_REVIEW: 'needs further review',
} as const;

export type ExpenseStatus = typeof EXPENSE_STATUS[keyof typeof EXPENSE_STATUS];

// ========== REIMBURSEMENT STATUS ==========
export const REIMBURSEMENT_STATUS = {
  PENDING_REVIEW: 'pending review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PAID: 'paid',
} as const;

export type ReimbursementStatus = typeof REIMBURSEMENT_STATUS[keyof typeof REIMBURSEMENT_STATUS];

// ========== PLATFORM / BASE PATH ==========
export const APP_BASE_PATH = (import.meta.env.VITE_APP_BASE_PATH as string) || '';

// ========== API CONFIGURATION ==========
export const API_CONFIG = {
  BASE_URL: (import.meta.env.VITE_API_URL as string) || (import.meta.env.VITE_API_BASE_URL as string) || (APP_BASE_PATH ? `${APP_BASE_PATH}/api` : '/api'),
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

// ========== FILE UPLOAD ==========
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB (increased for HEIC files from iPhone)
  ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.pdf'],
} as const;

// ========== COLOR SCHEMES ==========
// Status chips share one visual form: soft tint + inset ring (+ dot where rendered)
export const STATUS_COLORS = {
  [EXPENSE_STATUS.PENDING]: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    ring: 'ring-1 ring-inset ring-amber-200/70',
    border: 'border-amber-300',
  },
  [EXPENSE_STATUS.APPROVED]: {
    bg: 'bg-accent-50',
    text: 'text-accent-800',
    ring: 'ring-1 ring-inset ring-accent-200/70',
    border: 'border-accent-300',
  },
  [EXPENSE_STATUS.REJECTED]: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    ring: 'ring-1 ring-inset ring-red-200/70',
    border: 'border-red-300',
  },
  [EXPENSE_STATUS.NEEDS_FURTHER_REVIEW]: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    ring: 'ring-1 ring-inset ring-orange-200/70',
    border: 'border-orange-300',
  },
} as const;

// Categories are metadata — quieter tints, same chip form as status
export const CATEGORY_COLORS = {
  // Legacy categories (kept for backward compatibility)
  Flights: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-1 ring-inset ring-blue-200/60' },
  Hotels: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-1 ring-inset ring-emerald-200/60' },
  Meals: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-1 ring-inset ring-orange-200/60' },
  Supplies: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-1 ring-inset ring-purple-200/60' },
  Transportation: { bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-1 ring-inset ring-yellow-200/60' },
  'Marketing Materials': { bg: 'bg-pink-50', text: 'text-pink-700', ring: 'ring-1 ring-inset ring-pink-200/60' },
  Shipping: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-1 ring-inset ring-indigo-200/60' },

  // Current categories
  'Booth / Marketing / Tools': { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-1 ring-inset ring-purple-200/60' },
  'Travel - Flight': { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-1 ring-inset ring-blue-200/60' },
  'Accommodation - Hotel': { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-1 ring-inset ring-emerald-200/60' },
  'Transportation - Uber / Lyft / Others': { bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-1 ring-inset ring-yellow-200/60' },
  'Parking Fees': { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-1 ring-inset ring-cyan-200/60' },
  'Rental - Car / U-haul': { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-1 ring-inset ring-teal-200/60' },
  'Meal and Entertainment': { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-1 ring-inset ring-orange-200/60' },
  'Gas / Fuel': { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-1 ring-inset ring-amber-200/60' },
  'Show Allowances - Per Diem': { bg: 'bg-lime-50', text: 'text-lime-700', ring: 'ring-1 ring-inset ring-lime-200/60' },
  'Model': { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', ring: 'ring-1 ring-inset ring-fuchsia-200/60' },
  'Shipping Charges': { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-1 ring-inset ring-indigo-200/60' },
  Other: { bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-1 ring-inset ring-gray-200' },
} as const;

export const REIMBURSEMENT_COLORS = {
  [REIMBURSEMENT_STATUS.PENDING_REVIEW]: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    ring: 'ring-1 ring-inset ring-amber-200/70',
  },
  [REIMBURSEMENT_STATUS.APPROVED]: {
    bg: 'bg-accent-50',
    text: 'text-accent-800',
    ring: 'ring-1 ring-inset ring-accent-200/70',
  },
  [REIMBURSEMENT_STATUS.REJECTED]: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    ring: 'ring-1 ring-inset ring-red-200/70',
  },
  [REIMBURSEMENT_STATUS.PAID]: {
    bg: 'bg-brand-50',
    text: 'text-brand-700',
    ring: 'ring-1 ring-inset ring-brand-200/70',
  },
} as const;

// ========== LOCAL STORAGE KEYS ==========
export const STORAGE_KEYS = {
  // Authentication
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  
  // Data storage
  USERS: 'tradeshow_users',
  EVENTS: 'tradeshow_events',
  EXPENSES: 'tradeshow_expenses',
  CURRENT_USER: 'tradeshow_current_user',
  SETTINGS: 'app_settings',
  
  // UI preferences
  THEME: 'theme',
  SIDEBAR_STATE: 'sidebar_collapsed',
} as const;

// ========== ERROR MESSAGES ==========
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'An unexpected error occurred. Please try again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  FILE_TOO_LARGE: `File size must be less than ${FILE_UPLOAD.MAX_SIZE / 1024 / 1024}MB.`,
  INVALID_FILE_TYPE: 'Invalid file type. Please upload an image or PDF.',
} as const;

// ========== PERMISSION MATRIX ==========
export const PERMISSIONS = {
  [USER_ROLES.ADMIN]: {
    canCreateEvent: true,
    canEditEvent: true,
    canDeleteEvent: true,
    canApproveExpense: true,
    canRejectExpense: true,
    canAssignEntity: true,
    canManageUsers: true,
    canViewReports: true,
    canEditSettings: true,
  },
  [USER_ROLES.COORDINATOR]: {
    canCreateEvent: true,
    canEditEvent: true,
    canDeleteEvent: false,
    canApproveExpense: false,
    canRejectExpense: false,
    canAssignEntity: false,
    canManageUsers: false,
    canViewReports: true,
    canEditSettings: false,
  },
  [USER_ROLES.ACCOUNTANT]: {
    canCreateEvent: false,
    canEditEvent: false,
    canDeleteEvent: false,
    canApproveExpense: true,
    canRejectExpense: true,
    canAssignEntity: true,
    canManageUsers: false,
    canViewReports: true,
    canEditSettings: false,
  },
  [USER_ROLES.SALESPERSON]: {
    canCreateEvent: false,
    canEditEvent: false,
    canDeleteEvent: false,
    canApproveExpense: false,
    canRejectExpense: false,
    canAssignEntity: false,
    canManageUsers: false,
    canViewReports: false,
    canEditSettings: false,
  },
} as const;

// ========== HELPER FUNCTIONS ==========

/**
 * Check if a user has a specific permission
 */
export const hasPermission = (role: UserRole, permission: keyof typeof PERMISSIONS[typeof USER_ROLES.ADMIN]): boolean => {
  return PERMISSIONS[role]?.[permission] ?? false;
};

/**
 * Get status color classes
 * @returns Combined Tailwind classes (e.g., "bg-yellow-100 text-yellow-800")
 */
export const getStatusColor = (status: string): string => {
  const colors = STATUS_COLORS[status as ExpenseStatus] ?? STATUS_COLORS[EXPENSE_STATUS.PENDING];
  return `${colors.bg} ${colors.text} ${colors.ring}`;
};

/**
 * Get category color classes
 * @returns Combined Tailwind classes (e.g., "bg-blue-100 text-blue-800")
 */
export const getCategoryColor = (category: string): string => {
  const colors = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.Other;
  return `${colors.bg} ${colors.text} ${colors.ring}`;
};

/**
 * Get reimbursement status color classes
 * @returns Combined Tailwind classes (e.g., "bg-yellow-100 text-yellow-800")
 */
export const getReimbursementStatusColor = (status: string | undefined): string => {
  if (!status) return getReimbursementStatusColor(REIMBURSEMENT_STATUS.PENDING_REVIEW);
  const colors = REIMBURSEMENT_COLORS[status as ReimbursementStatus] ?? REIMBURSEMENT_COLORS[REIMBURSEMENT_STATUS.PENDING_REVIEW];
  return `${colors.bg} ${colors.text} ${colors.ring}`;
};

/**
 * Format reimbursement status for display
 */
export const formatReimbursementStatus = (status: string | undefined): string => {
  if (!status || status === 'pending review') return 'Pending Review';
  if (status === 'approved') return 'Approved (pending payment)';
  if (status === 'rejected') return 'Rejected';
  if (status === 'paid') return 'Paid';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

/**
 * Format currency
 */
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};
