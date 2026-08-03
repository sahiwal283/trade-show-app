/**
 * Status / reimbursement maps — EXT_API_MERGE_LOCK.md
 */

import type {
  MidasExpenseStatus,
  MidasReimbursementStatus,
  TsExpenseStatus,
  TsReimbursementStatus,
} from './MidasTypes';

export function mapTsStatusToMidas(status: string): MidasExpenseStatus {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'needs further review':
      return 'awaiting_info';
    case 'draft':
      return 'draft';
    default:
      return 'pending';
  }
}

export function mapMidasStatusToTs(status: MidasExpenseStatus | string): TsExpenseStatus {
  switch (status) {
    case 'pending':
    case 'draft':
    case 'in_review':
      return 'pending';
    case 'awaiting_info':
      return 'needs further review';
    case 'approved':
    case 'zoho_sync_failed':
      return 'approved';
    case 'rejected':
      return 'rejected';
    default:
      return 'pending';
  }
}

export function mapTsReimbursementToMidas(
  required: boolean,
  status: string | null | undefined
): MidasReimbursementStatus {
  if (!required) return 'not_requested';
  switch (status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'paid':
      return 'paid';
    case 'pending review':
    case null:
    case undefined:
    case '':
      return 'pending';
    default:
      return 'pending';
  }
}

export function mapMidasReimbursementToTs(status: MidasReimbursementStatus | string): {
  reimbursementRequired: boolean;
  reimbursementStatus?: TsReimbursementStatus;
} {
  switch (status) {
    case 'not_requested':
      return { reimbursementRequired: false };
    case 'pending':
      return { reimbursementRequired: true, reimbursementStatus: 'pending review' };
    case 'approved':
      return { reimbursementRequired: true, reimbursementStatus: 'approved' };
    case 'rejected':
      return { reimbursementRequired: true, reimbursementStatus: 'rejected' };
    case 'paid':
      return { reimbursementRequired: true, reimbursementStatus: 'paid' };
    default:
      return { reimbursementRequired: false };
  }
}
