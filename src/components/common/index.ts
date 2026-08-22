/**
 * Common Components Export
 * Centralized export for all common/shared components
 * @version 0.9.0 - Added Badge components (Phase 2 Refactor)
 */

export { LoadingSpinner } from './LoadingSpinner';
export { ErrorBoundary, withErrorBoundary } from './ErrorBoundary';
export { EmptyState } from './EmptyState';
export { Toast, ToastContainer, useToast } from './Toast';
export { SearchableSelect } from './SearchableSelect';
export type { SearchableSelectOption } from './SearchableSelect';

// Badge components (Phase 2 refactor - Oct 27, 2025)
export { StatusBadge } from './StatusBadge';
export { CategoryBadge } from './CategoryBadge';

