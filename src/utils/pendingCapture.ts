/**
 * Hand-off slot for a receipt photo captured from the bottom-nav camera
 * button. The native camera must be opened synchronously inside the tap
 * gesture (in MobileNav), before the Expenses page has mounted — so the
 * captured file is parked here and collected by ExpenseSubmission when the
 * #new-expense deep link lands.
 */

let pendingFile: File | null = null;

export function setPendingCapture(file: File): void {
  pendingFile = file;
}

/** Returns the captured file once and clears the slot. */
export function takePendingCapture(): File | null {
  const file = pendingFile;
  pendingFile = null;
  return file;
}
