/**
 * Who may capture and read badge scans.
 *
 * SCAN_ROLES mirrors who actually works a booth. Accountants never do, and
 * temporary staff handle setup (booths/checklist), not customer lead capture.
 * VIEW_ALL_ROLES may read scans for every event; everyone else sees only
 * events they participate in.
 */
export const SCAN_ROLES = ['admin', 'coordinator', 'salesperson', 'developer'] as const;

export const VIEW_ALL_ROLES = ['admin', 'developer'] as const;
