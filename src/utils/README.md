# Utils Directory

Utility functions for the Trade Show Expense Management App.

## Date Utilities (`dateUtils.ts`)

### ⚠️ Critical: Avoiding Timezone Bugs

**Always use `dateUtils` functions instead of `new Date()` for date-only strings (YYYY-MM-DD)!**

#### The Problem

```typescript
// ❌ BAD: Treats "2026-02-07" as UTC midnight
const date = new Date("2026-02-07");
// In PST (UTC-8), this becomes 2026-02-06 at 4:00 PM local time
// Displaying this date will show 2/6/2026 instead of 2/7/2026
```

JavaScript's `Date` constructor treats YYYY-MM-DD strings as UTC midnight. When displayed or compared in local timezones behind UTC, this causes the date to shift backward by one day.

#### The Solution

```typescript
// ✅ GOOD: Treats "2026-02-07" as local midnight
import { parseLocalDate, formatLocalDate } from '@/utils/dateUtils';

const date = parseLocalDate("2026-02-07");
// Always represents 2026-02-07 at midnight local time
```

### Available Functions

#### Core Functions

- `parseLocalDate(dateString)` - Parse YYYY-MM-DD as local date
- `formatLocalDate(dateString, options?)` - Format date for display
- `formatForDateInput(dateString)` - Format for HTML date inputs

#### Date Calculations

- `getDaysUntil(dateString)` - Days from today to target date

#### Date Checks

- `isToday(dateString)` - Check if date is today

#### Formatting

- `formatDateRange(start, end, separator?)` - Format date range

### Usage Examples

#### Displaying Event Dates

```typescript
// ❌ Before
<span>{new Date(event.startDate).toLocaleDateString()}</span>

// ✅ After
import { formatLocalDate } from '@/utils/dateUtils';
<span>{formatLocalDate(event.startDate)}</span>
```

#### Calculating Days Until Event

```typescript
// ❌ Before
const eventDate = new Date(event.startDate);
const today = new Date();
const diffDays = Math.floor((eventDate - today) / (1000 * 60 * 60 * 24));

// ✅ After
import { getDaysUntil } from '@/utils/dateUtils';
const diffDays = getDaysUntil(event.startDate);
```

#### Populating Date Inputs

```typescript
// ❌ Before
const formatted = new Date(event.startDate).toISOString().split('T')[0];

// ✅ After
import { formatForDateInput } from '@/utils/dateUtils';
const formatted = formatForDateInput(event.startDate);
```

### Migration Checklist

When working with dates in components:

- [ ] Replace `new Date(dateString)` with `parseLocalDate(dateString)`
- [ ] Replace `.toLocaleDateString()` with `formatLocalDate(dateString)`
- [ ] Replace manual days-until calculations with `getDaysUntil(dateString)`
- [ ] Replace manual date filtering with `isToday()` / `getDaysUntil()`
- [ ] Use `formatForDateInput()` for HTML date inputs
- [ ] Use `formatDateRange()` for displaying date ranges

### Testing

Always test date handling across different timezones:

```bash
# Test in UTC
TZ=UTC npm run dev

# Test in PST (UTC-8)
TZ=America/Los_Angeles npm run dev

# Test in EST (UTC-5)
TZ=America/New_York npm run dev
```

## Other Utilities

- `api.ts` - API client and endpoint handlers
- `apiClient.ts` - HTTP client configuration
- `errorHandler.ts` - Error handling utilities

