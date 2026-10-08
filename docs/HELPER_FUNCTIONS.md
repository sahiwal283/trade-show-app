# Helper Functions Reference

**Last Updated:** November 10, 2025  
**Purpose:** Quick reference guide for all helper functions in the codebase

---

## 📋 Table of Contents

1. [Frontend Utility Functions](#frontend-utility-functions)
2. [When to Use Helpers](#when-to-use-helpers)
3. [Best Practices](#best-practices)

---

## Frontend Utility Functions

### Date Utilities (`src/utils/dateUtils.ts`)

**⚠️ CRITICAL: Always use these instead of `new Date()` for date-only strings!**

**Problem:** JavaScript's `Date` constructor treats YYYY-MM-DD strings as UTC midnight, causing timezone shifts.

**Functions:**
- `parseLocalDate(dateString)` - Parse YYYY-MM-DD as local date
- `formatLocalDate(dateString, options?)` - Format date for display
- `formatForDateInput(dateString)` - Format for HTML date inputs
- `getDaysUntil(dateString)` - Days from today to target date
- `getDaysUntilLabel(days)` - Human-readable label ("Today", "Tomorrow")
- `isToday(dateString)` - Check if date is today
- `isPast(dateString)` - Check if date is in the past
- `isFuture(dateString)` - Check if date is in the future
- `formatDateRange(start, end, separator?)` - Format date range

**See:** `src/utils/README.md` for detailed usage examples

### Event Utilities (`src/utils/eventUtils.ts`)

**Functions:**
- `filterActiveEvents(events)` - Filters out events >1 month past end date
- **Purpose:** Keeps dropdowns clean by removing old events
- **Usage:** Event selection dropdowns

### Filter Utilities (`src/utils/filterUtils.ts`)

**Functions:**
- `filterByField<T>(items, field, filterValue, matchType)` - Generic field filtering
- `hasActiveFilters(filters)` - Checks if any filters are active
- **Purpose:** Reusable filtering logic
- **Usage:** Expense filtering, event filtering

### OCR Utilities (`src/utils/ocrUtils.ts`)

**Functions:**
- `prepareOcrCorrectionData(receiptData)` - Prepares OCR correction data
- `trackOcrCorrections(ocrData, expenseData, expenseId, sendOCRCorrection)` - Tracks user corrections
- **Purpose:** OCR correction tracking and data preparation
- **Usage:** Receipt upload and expense submission

### API Client (`src/utils/apiClient.ts`)

**Class:** `ApiClient`
- **Purpose:** Centralized HTTP client with authentication
- **Methods:** `get`, `post`, `put`, `delete`, `upload`
- **Features:** Automatic token management, error handling, retry logic
- **Usage:** All API calls should use this client

### Session Manager (`src/utils/sessionManager.ts`)

**Class:** `SessionManager`
- **Purpose:** Manages user sessions and token refresh
- **Features:** Automatic token refresh, inactivity detection, logout
- **Usage:** Authentication and session management

### Other Utilities

- `api.ts` - API endpoint definitions and helpers
- `errorHandler.ts` - Error handling utilities
- `networkDetection.ts` - Network status detection
- `offlineDb.ts` - IndexedDB operations for offline support
- `syncManager.ts` - Background sync management
- `expenseUtils.ts` - Expense-specific utilities
- `reportUtils.ts` - Report generation utilities
- `checklistUtils.ts` - Checklist-specific utilities

---

## When to Use Helpers

### ✅ DO Extract to Helper When:

1. **Function is used in multiple places** - Avoid duplication
2. **Function is >20 lines** - Improves readability
3. **Function has complex logic** - Easier to test and maintain
4. **Function is pure (no side effects)** - Reusable and testable
5. **Function has clear single responsibility** - Follows SOLID principles

### ❌ DON'T Extract When:

1. **Function is only used once** - Premature optimization
2. **Function is tightly coupled to component** - Keep it local
3. **Function is <5 lines** - Over-engineering
4. **Function needs component state** - Keep it in component

### Helper Extraction Strategy

**Backend:**
- Extract from services to `.helpers.ts` files
- Keep helpers in same directory as service
- Export only what's needed
- Use JSDoc comments

**Frontend:**
- Extract to `src/utils/` directory
- Group by domain (date, event, expense, etc.)
- Use TypeScript interfaces
- Document with JSDoc

---

## Best Practices

### 1. Naming Conventions

**Backend Helpers:**
- Use descriptive names: `checkErrorRateAlert` not `checkError`
- Prefix with action: `check`, `get`, `format`, `parse`, `calculate`
- Use camelCase

**Frontend Utilities:**
- Use descriptive names: `parseLocalDate` not `parseDate`
- Prefix with domain: `formatLocalDate`, `filterActiveEvents`
- Use camelCase

### 2. Documentation

**Always include:**
- JSDoc comments with `@param` and `@returns`
- Usage examples for complex functions
- Type definitions for parameters and return values
- Notes about edge cases or important behavior

### 3. Testing

**Test helpers independently:**
- Unit tests for pure functions
- Mock dependencies for functions with side effects
- Test edge cases and error conditions

### 4. File Organization

**Frontend:**
```
utils/
├── dateUtils.ts
├── eventUtils.ts
├── filterUtils.ts
└── README.md
```

---

## Quick Reference

### Frontend Utilities

| Utility | Purpose | Location |
|---------|---------|----------|
| `dateUtils` | Date parsing/formatting | `src/utils/dateUtils.ts` |
| `eventUtils` | Event filtering | `src/utils/eventUtils.ts` |
| `filterUtils` | Generic filtering | `src/utils/filterUtils.ts` |
| `ocrUtils` | OCR correction tracking | `src/utils/ocrUtils.ts` |
| `apiClient` | HTTP client | `src/utils/apiClient.ts` |
| `sessionManager` | Session management | `src/utils/sessionManager.ts` |

---

**For detailed usage examples, see:**
- `src/utils/README.md` - Frontend utilities guide

