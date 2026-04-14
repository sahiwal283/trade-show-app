/**
 * Composed Zoho Books expense description — must stay in sync with payloads sent
 * from zohoIntegrationClient and with src/utils/zohoExpenseDescription.ts.
 */

export const ZOHO_EXPENSE_DESCRIPTION_MAX_LENGTH = 500;

export interface ZohoExpenseDescriptionInput {
  /** User-entered text; non-strings from APIs are coerced for length checks. */
  description?: string | null | unknown;
  userName: string;
  eventName?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  reimbursementRequired: boolean;
}

function normalizeDescriptionText(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
}

/** Align date formatting with what we send to Zoho (YYYY-MM-DD when parseable). */
function normalizeZohoDateSegment(value: string | Date | null | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

export function buildZohoExpenseDescription(input: ZohoExpenseDescriptionInput): string {
  let fullDescription = normalizeDescriptionText(input.description);
  if (input.userName) {
    fullDescription = `(${input.userName})${fullDescription ? ` | ${fullDescription}` : ''}`;
  }
  const start = normalizeZohoDateSegment(input.eventStartDate ?? undefined);
  const end = normalizeZohoDateSegment(input.eventEndDate ?? undefined);
  if (input.eventName) {
    fullDescription += ` | ${input.eventName}`;
    if (start) {
      fullDescription += ` (${start}`;
      if (end) {
        fullDescription += ` - ${end}`;
      }
      fullDescription += ')';
    }
  }
  if (input.reimbursementRequired) {
    fullDescription += ' | REIMBURSEMENT REQUIRED';
  }
  return fullDescription;
}

export function isZohoExpenseDescriptionCompliant(input: ZohoExpenseDescriptionInput): boolean {
  return buildZohoExpenseDescription(input).length <= ZOHO_EXPENSE_DESCRIPTION_MAX_LENGTH;
}
