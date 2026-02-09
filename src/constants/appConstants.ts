/**
 * Application Constants
 * Centralized constants for the entire application
 * @version 1.0.0
 */

// ========== APPLICATION INFO ==========
export const APP_VERSION = '1.31.6';
export const APP_NAME = 'Trade Show Expense Management App';

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

// ========== USER ROLE LABELS ==========
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  coordinator: 'Show Coordinator',
  salesperson: 'Sales Person',
  accountant: 'Accountant',
  developer: 'Developer'
};

// ========== USER ROLE COLORS ==========
export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  coordinator: 'bg-blue-100 text-blue-800',
  salesperson: 'bg-emerald-100 text-emerald-800',
  accountant: 'bg-orange-100 text-orange-800',
  developer: 'bg-indigo-100 text-indigo-800'
};

// ========== EXPENSE CATEGORIES ==========
export const EXPENSE_CATEGORIES = [
  'Flights',
  'Hotels',
  'Meals',
  'Supplies',
  'Transportation',
  'Marketing Materials',
  'Shipping',
  'Other',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

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

// ========== EVENT STATUS ==========
export const EVENT_STATUS = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const;

export type EventStatus = typeof EVENT_STATUS[keyof typeof EVENT_STATUS];

// ========== CARD OPTIONS ==========
export const DEFAULT_CARD_OPTIONS = [
  'Haute Haute Intl GBP Amex',
  'Haute Haute Intl USD Amex',
  'Haute Haute USD Debit',
  'Haute Haute Inc GBP Amex',
  'Haute Haute Inc USD Amex',
  'Haute Haute Inc USD Debit',
  'Haute Haute LLC GBP Amex',
  'Haute Haute LLC USD Amex',
  'Haute Haute LLC USD Debit',
  'Cash',
] as const;

// ========== ENTITY OPTIONS ==========
export const DEFAULT_ENTITY_OPTIONS = [
  'Haute Inc',
  'Haute LLC',
  'Haute Intl',
] as const;

// ========== API CONFIGURATION ==========
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
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

// ========== UI CONSTANTS ==========
export const UI_CONSTANTS = {
  ITEMS_PER_PAGE: 10,
  DEBOUNCE_DELAY: 300,
  TOAST_DURATION: 3000,
  SIDEBAR_WIDTH: 256, // 64 * 4 (tailwind units)
  SIDEBAR_COLLAPSED_WIDTH: 64, // 16 * 4
} as const;

// ========== COLOR SCHEMES ==========
export const STATUS_COLORS = {
  [EXPENSE_STATUS.PENDING]: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-300',
  },
  [EXPENSE_STATUS.APPROVED]: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
  },
  [EXPENSE_STATUS.REJECTED]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
  },
  [EXPENSE_STATUS.NEEDS_FURTHER_REVIEW]: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-300',
  },
} as const;

export const CATEGORY_COLORS = {
  // Legacy categories (kept for backward compatibility)
  Flights: { bg: 'bg-blue-100', text: 'text-blue-800' },
  Hotels: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  Meals: { bg: 'bg-orange-100', text: 'text-orange-800' },
  Supplies: { bg: 'bg-purple-100', text: 'text-purple-800' },
  Transportation: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'Marketing Materials': { bg: 'bg-pink-100', text: 'text-pink-800' },
  Shipping: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  
  // Current categories
  'Booth / Marketing / Tools': { bg: 'bg-purple-100', text: 'text-purple-800' },
  'Travel - Flight': { bg: 'bg-blue-100', text: 'text-blue-800' },
  'Accommodation - Hotel': { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  'Transportation - Uber / Lyft / Others': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'Parking Fees': { bg: 'bg-cyan-100', text: 'text-cyan-800' },
  'Rental - Car / U-haul': { bg: 'bg-teal-100', text: 'text-teal-800' },
  'Meal and Entertainment': { bg: 'bg-orange-100', text: 'text-orange-800' },
  'Gas / Fuel': { bg: 'bg-amber-100', text: 'text-amber-800' },
  'Show Allowances - Per Diem': { bg: 'bg-lime-100', text: 'text-lime-800' },
  'Model': { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800' },
  'Shipping Charges': { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  Other: { bg: 'bg-gray-100', text: 'text-gray-800' },
} as const;

export const REIMBURSEMENT_COLORS = {
  [REIMBURSEMENT_STATUS.PENDING_REVIEW]: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
  },
  [REIMBURSEMENT_STATUS.APPROVED]: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
  },
  [REIMBURSEMENT_STATUS.REJECTED]: {
    bg: 'bg-red-100',
    text: 'text-red-800',
  },
  [REIMBURSEMENT_STATUS.PAID]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
  },
} as const;

// ========== DATE FORMATS ==========
export const DATE_FORMATS = {
  DISPLAY: 'MMM DD, YYYY',
  INPUT: 'YYYY-MM-DD',
  TIMESTAMP: 'YYYY-MM-DD HH:mm:ss',
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

// ========== SUCCESS MESSAGES ==========
export const SUCCESS_MESSAGES = {
  EXPENSE_CREATED: 'Expense created successfully!',
  EXPENSE_UPDATED: 'Expense updated successfully!',
  EXPENSE_DELETED: 'Expense deleted successfully!',
  EXPENSE_APPROVED: 'Expense approved successfully!',
  EXPENSE_REJECTED: 'Expense rejected successfully!',
  ENTITY_ASSIGNED: 'Entity assigned successfully!',
  EVENT_CREATED: 'Event created successfully!',
  EVENT_UPDATED: 'Event updated successfully!',
  USER_CREATED: 'User created successfully!',
  USER_UPDATED: 'User updated successfully!',
  SETTINGS_UPDATED: 'Settings updated successfully!',
} as const;

// ========== REGEX PATTERNS ==========
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-()]+$/,
  USERNAME: /^[a-zA-Z0-9_]{3,20}$/,
  AMOUNT: /^\d+(\.\d{1,2})?$/,
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
  return `${colors.bg} ${colors.text}`;
};

/**
 * Get category color classes
 * @returns Combined Tailwind classes (e.g., "bg-blue-100 text-blue-800")
 */
export const getCategoryColor = (category: string): string => {
  const colors = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.Other;
  return `${colors.bg} ${colors.text}`;
};

/**
 * Get reimbursement status color classes
 * @returns Combined Tailwind classes (e.g., "bg-yellow-100 text-yellow-800")
 */
export const getReimbursementStatusColor = (status: string | undefined): string => {
  if (!status) return getReimbursementStatusColor(REIMBURSEMENT_STATUS.PENDING_REVIEW);
  const colors = REIMBURSEMENT_COLORS[status as ReimbursementStatus] ?? REIMBURSEMENT_COLORS[REIMBURSEMENT_STATUS.PENDING_REVIEW];
  return `${colors.bg} ${colors.text}`;
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

/**
 * Format date
 */
export const formatDate = (date: string | Date, format: keyof typeof DATE_FORMATS = 'DISPLAY'): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  switch (format) {
    case 'DISPLAY':
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    case 'INPUT':
      // Use local date components instead of UTC to avoid timezone shifts
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    case 'TIMESTAMP':
      return d.toISOString().replace('T', ' ').split('.')[0];
    default:
      return d.toLocaleDateString();
  }
};

/**
 * Validate file upload
 * Checks both MIME type and file extension for better compatibility
 * (some phones report empty or non-standard MIME types)
 */
export const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (file.size > FILE_UPLOAD.MAX_SIZE) {
    return { valid: false, error: ERROR_MESSAGES.FILE_TOO_LARGE };
  }
  
  // Check MIME type first
  const mimeTypeValid = FILE_UPLOAD.ALLOWED_TYPES.includes(file.type) || 
                        file.type.startsWith('image/'); // Accept any image/* type
  
  // Also check file extension as fallback (some phones have empty/wrong MIME types)
  const fileName = file.name.toLowerCase();
  const extensionValid = FILE_UPLOAD.ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  
  // Accept if either MIME type OR extension is valid
  if (!mimeTypeValid && !extensionValid) {
    console.warn(`[File Validation] Rejected: ${file.name} (type: ${file.type || 'empty'})`);
    return { valid: false, error: ERROR_MESSAGES.INVALID_FILE_TYPE };
  }
  
  return { valid: true };
};

