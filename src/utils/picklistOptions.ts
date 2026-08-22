/**
 * Builds SearchableSelect options from picklist records.
 *
 * Every form that offers a category or a card builds its options here, so the
 * stored `cardUsed` string is produced in exactly one way — `formatCardUsed`,
 * the shape both backend parsers key off.
 */

import type { SearchableSelectOption } from '../components/common/SearchableSelect';
import {
  formatCardUsed,
  type PicklistCategory,
  type PicklistPaymentMethod,
} from '../contexts/PicklistContext';

/** Categories arrive as records from the picklist context, or as bare names
 *  from components that only ever held the names. */
export function toCategoryOptions(
  categories: Array<PicklistCategory | string>
): SearchableSelectOption[] {
  return categories
    .map((c) => (typeof c === 'string' ? { name: c, description: null } : c))
    .filter((c) => Boolean(c.name))
    .map((c) => ({
      value: c.name,
      label: c.name,
      // Searchable but not shown: a category is picked by name, and the
      // description is only useful when the name alone is ambiguous.
      searchText: c.description ?? '',
    }));
}

export function toCardOptions(
  paymentMethods: PicklistPaymentMethod[]
): SearchableSelectOption[] {
  return paymentMethods
    .filter((pm) => Boolean(pm.label))
    .map((pm) => {
      const cardUsed = formatCardUsed(pm);
      return {
        value: cardUsed,
        label: cardUsed,
        // The digits on the receipt are the fastest way to find a card, and
        // the company name helps when someone carries several.
        searchText: [pm.lastFour, pm.company].filter(Boolean).join(' '),
      };
    });
}

/** Cards in the OCR flow's `{name, lastFour, entity}` shape, which is also
 *  what the OCR hook matches card numbers against. */
export function toLegacyCardOptions(
  cards: Array<{ name: string; lastFour: string; entity?: string | null }>
): SearchableSelectOption[] {
  return toCardOptions(
    cards.map((c) => ({
      id: null,
      label: c.name,
      lastFour: c.lastFour,
      company: c.entity ?? null,
      requiresReimbursement: false,
      zohoPaymentAccountId: null,
    }))
  );
}
