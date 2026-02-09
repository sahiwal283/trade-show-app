/**
 * Expense Routes
 * Handles expense submission, approval, Zoho integration, and reimbursement workflows
 */

import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { query } from '../config/database';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';
import { upload } from '../config/upload';
import { zohoIntegrationClient } from '../services/zohoIntegrationClient';
import { expenseService } from '../services/ExpenseService';
import { DuplicateDetectionService } from '../services/DuplicateDetectionService';
import { ExpenseAuditService } from '../services/ExpenseAuditService';
import { asyncHandler, ValidationError } from '../utils/errors';
import { normalizeExpense } from '../utils/expenseHelpers';
import { expenseRepository, userRepository, eventRepository } from '../database/repositories';
import { generateExpensePDF } from '../services/ExpensePDFService';

const router = Router();

router.use(authenticateToken);

// ========== CRUD ENDPOINTS ==========
// Note: OCR processing is handled by /api/ocr/v2/process endpoint (external OCR service)
// Get all expenses
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { event_id, user_id, status } = req.query;
  
  // Build filters from query params
  const filters: any = {};
  if (event_id) filters.eventId = event_id as string;
  if (user_id) filters.userId = user_id as string;
  if (status) filters.status = status as string;
  
  // Get expenses with user/event details (optimized with JOINs - no N+1 queries!)
  const expenses = await expenseService.getExpensesWithDetails(filters);
  
  console.log(`[Expenses:GET] Returning ${expenses.length} expenses`);
  
  // Normalize and return
  const normalizedExpenses = expenses.map((expense: any) => ({
    ...normalizeExpense(expense),
    user_name: expense.user_name,
    event_name: expense.event_name
  }));
  
  // Prevent browser caching to ensure fresh data
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  res.json(normalizedExpenses);
}));

// Get expense PDF (must come before /:id route)
router.get('/:id/pdf', authorize('admin', 'accountant', 'coordinator', 'developer', 'salesperson'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const requestStartTime = Date.now();
  
  console.log(`[ExpensePDF] PDF download request received for expense: ${id}`);
  
  try {
    // Get expense with user/event details
    console.log(`[ExpensePDF] Fetching expense details for: ${id}`);
    const expense = await expenseService.getExpenseByIdWithDetails(id);
    console.log(`[ExpensePDF] Expense fetched successfully: ${expense.id}`);
    
    // Generate PDF
    console.log(`[ExpensePDF] Starting PDF generation...`);
    const pdfBuffer = await generateExpensePDF(expense);
    console.log(`[ExpensePDF] PDF generation completed. Buffer size: ${pdfBuffer.length} bytes`);
    
    // Validate PDF buffer
    if (!pdfBuffer || pdfBuffer.length === 0) {
      console.error('[ExpensePDF] ERROR: Generated PDF buffer is empty');
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }
    
    // Validate PDF header
    if (pdfBuffer.length < 4 || pdfBuffer.toString('ascii', 0, 4) !== '%PDF') {
      console.error('[ExpensePDF] ERROR: Generated buffer does not have valid PDF header');
      console.error('[ExpensePDF] First 20 bytes:', pdfBuffer.slice(0, 20).toString('hex'));
      return res.status(500).json({ error: 'Generated PDF is invalid' });
    }
    
    // Set response headers for PDF download
    const contentLength = pdfBuffer.length.toString();
    
    // Required headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expense-${id}.pdf"`);
    res.setHeader('Content-Length', contentLength);
    
    // Security headers to prevent "Insecure download blocked" warning
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevents MIME type sniffing
    res.setHeader('X-Download-Options', 'noopen'); // Prevents opening in browser context
    
    // Cache control headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Ensure no compression or other transformations
    res.removeHeader('Content-Encoding');
    
    // Log all headers before sending
    console.log(`[ExpensePDF] Headers set:`);
    console.log(`  - Content-Type: ${res.getHeader('Content-Type')}`);
    console.log(`  - Content-Disposition: ${res.getHeader('Content-Disposition')}`);
    console.log(`  - Content-Length: ${contentLength}`);
    console.log(`  - X-Content-Type-Options: ${res.getHeader('X-Content-Type-Options')}`);
    console.log(`  - X-Download-Options: ${res.getHeader('X-Download-Options')}`);
    console.log(`  - Cache-Control: ${res.getHeader('Cache-Control')}`);
    console.log(`  - Pragma: ${res.getHeader('Pragma')}`);
    console.log(`  - Expires: ${res.getHeader('Expires')}`);
    
    // Log request details for debugging
    console.log(`[ExpensePDF] Request details:`);
    console.log(`  - Method: ${req.method}`);
    console.log(`  - URL: ${req.url}`);
    console.log(`  - Original URL: ${req.originalUrl}`);
    console.log(`  - Protocol: ${req.protocol}`);
    console.log(`  - Secure: ${req.secure}`);
    console.log(`  - Headers: ${JSON.stringify(req.headers, null, 2)}`);
    
    console.log(`[ExpensePDF] Sending PDF buffer (${pdfBuffer.length} bytes)...`);
    
    // Register event listeners BEFORE sending response
    res.on('finish', () => {
      const totalTime = Date.now() - requestStartTime;
      const actualContentLength = res.getHeader('Content-Length');
      console.log(`[ExpensePDF] ✓ Response finished. Total time: ${totalTime}ms`);
      console.log(`[ExpensePDF] ✓ Content-Length header: ${actualContentLength}, Buffer size: ${pdfBuffer.length}`);
      
      if (actualContentLength !== contentLength) {
        console.error(`[ExpensePDF] ⚠️ WARNING: Content-Length mismatch! Header: ${actualContentLength}, Buffer: ${pdfBuffer.length}`);
      }
    });
    
    res.on('close', () => {
      console.log(`[ExpensePDF] ✓ Response connection closed`);
    });
    
    res.on('error', (err) => {
      console.error(`[ExpensePDF] ✗ Response error:`, err);
    });
    
    // Send PDF as binary data using res.send() for better Express compatibility
    // res.send() handles binary buffers correctly and respects Content-Type
    res.send(pdfBuffer);
  } catch (error: any) {
    const totalTime = Date.now() - requestStartTime;
    console.error(`[ExpensePDF] ERROR generating PDF (after ${totalTime}ms):`, {
      message: error.message,
      stack: error.stack,
      expenseId: id
    });
    
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to generate PDF',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } else {
      console.error('[ExpensePDF] ERROR: Cannot send error response - headers already sent');
    }
  }
}));

// Get expense by ID
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  
  // Get expense with user/event details (optimized with JOINs - no extra queries!)
  const expense = await expenseService.getExpenseByIdWithDetails(id);
  
  res.json({
    ...normalizeExpense(expense),
    user_name: expense.user_name,
    event_name: expense.event_name
  });
}));

// Update expense receipt (must come before /:id route)
router.put('/:id/receipt', upload.single('receipt'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  
  try {
    // Validate file was uploaded
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        details: 'Please select a receipt file to upload.'
      });
    }

    // Get expense to check authorization and get old receipt URL
    const expense = await expenseService.getExpenseById(id);
    
    // Authorization check
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'accountant' || req.user!.role === 'developer';
    if (!isAdmin && expense.user_id !== req.user!.id) {
      return res.status(403).json({ 
        error: 'Unauthorized',
        details: 'You can only update receipts for your own expenses'
      });
    }

    // Users can't update approved/rejected expenses
    if (!isAdmin && expense.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Cannot update receipt',
        details: 'Cannot update receipts for expenses that have been approved or rejected'
      });
    }

    // Store old receipt URL and path for deletion
    const oldReceiptUrl = expense.receipt_url || null;
    let oldReceiptPath: string | null = null;

    // Build path to old receipt file if it exists
    if (oldReceiptUrl) {
      let receiptPath = oldReceiptUrl;
      if (receiptPath.startsWith('/uploads/')) {
        receiptPath = receiptPath.substring('/uploads/'.length);
      } else if (receiptPath.startsWith('/api/uploads/')) {
        receiptPath = receiptPath.substring('/api/uploads/'.length);
      }
      const uploadDir = process.env.UPLOAD_DIR || 'uploads';
      oldReceiptPath = path.join(uploadDir, receiptPath);
    }

    // New receipt URL
    const newReceiptUrl = `/uploads/${req.file.filename}`;

    // Update expense receipt (transaction-safe: updates DB first)
    const result = await expenseService.updateExpenseReceipt(
      id,
      req.user!.id,
      req.user!.role,
      newReceiptUrl
    );

    // Delete old receipt file AFTER successful database update
    if (oldReceiptPath && fs.existsSync(oldReceiptPath)) {
      try {
        fs.unlinkSync(oldReceiptPath);
        console.log(`[ExpenseReceipt] Deleted old receipt file: ${oldReceiptPath}`);
      } catch (deleteError: any) {
        // Log error but don't fail the request - file deletion is cleanup
        console.error(`[ExpenseReceipt] Failed to delete old receipt file: ${oldReceiptPath}`, deleteError);
        // Note: Old file will remain on disk, but expense record is updated
      }
    }

    // Log receipt replacement in audit trail
    await ExpenseAuditService.logChange(
      id,
      req.user!.id,
      req.user!.username || 'Unknown User',
      'receipt_replaced',
      {
        receipt_url: {
          old: oldReceiptUrl,
          new: newReceiptUrl
        }
      }
    );

    console.log(`[ExpenseReceipt] Receipt replaced for expense ${id} by ${req.user!.username}`);
    
    // Return updated expense
    const updatedExpense = await expenseService.getExpenseByIdWithDetails(id);
    res.json({
      ...normalizeExpense(updatedExpense),
      user_name: updatedExpense.user_name,
      event_name: updatedExpense.event_name,
      message: 'Receipt updated successfully'
    });
  } catch (error: any) {
    // If database update failed, delete the newly uploaded file to prevent orphaned files
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log(`[ExpenseReceipt] Cleaned up failed upload: ${req.file.path}`);
      } catch (cleanupError) {
        console.error(`[ExpenseReceipt] Failed to cleanup failed upload: ${req.file.path}`, cleanupError);
      }
    }

    // Handle specific error types
    if (error.message === 'Expense not found') {
      return res.status(404).json({ error: 'Expense not found' });
    }
    
    if (error.message === 'You can only update receipts for your own expenses') {
      return res.status(403).json({ error: 'Unauthorized', details: error.message });
    }
    
    if (error.message === 'Cannot update receipts for expenses that have been approved or rejected') {
      return res.status(400).json({ error: 'Cannot update receipt', details: error.message });
    }

    // Log full error details
    console.error('[ExpenseReceipt] Error updating receipt:', {
      message: error.message,
      stack: error.stack,
      expenseId: id,
      userId: req.user!.id
    });

    res.status(500).json({ 
      error: 'Failed to update receipt',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred. Please try again.'
    });
  }
}));

// Create expense with optional receipt upload and OCR
router.post('/', upload.single('receipt'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    event_id,
    category,
    merchant,
    amount,
    date,
    description,
    card_used,
    reimbursement_required,
    location,
    zoho_entity,
    receipt_url // Accept pre-uploaded receipt URL (from OCR v2)
  } = req.body;

  let receiptUrl: string | undefined = receipt_url || undefined;

  // Validate that user is a participant of the event (unless admin/accountant/developer/coordinator)
  if (req.user!.role !== 'admin' && req.user!.role !== 'accountant' && req.user!.role !== 'developer' && req.user!.role !== 'coordinator') {
    const participantCheck = await query(
      `SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2`,
      [event_id, req.user!.id]
    );
    
    if (participantCheck.rows.length === 0) {
      throw new ValidationError('You can only submit expenses to events where you are a participant');
    }
  }

  // Use uploaded receipt (OCR should be done via /api/ocr/v2/process before submission)
  if (req.file && !receipt_url) {
    receiptUrl = `/uploads/${req.file.filename}`;
  }

  // Create expense using service layer
  const expense = await expenseService.createExpense(req.user!.id, {
    eventId: event_id,
    date,
    merchant,
    amount: parseFloat(amount),
    category,
    description,
    location,
    cardUsed: card_used,
    receiptUrl,
    reimbursementRequired: reimbursement_required === 'true' || reimbursement_required === true,
    zohoEntity: zoho_entity || undefined
  });

  // Check for potential duplicates
  const duplicates = await DuplicateDetectionService.checkForDuplicates(
    merchant,
    parseFloat(amount),
    date,
    req.user!.id,
    expense.id
  );

  // Update expense with duplicate warnings if found
  if (duplicates.length > 0) {
    await expenseRepository.update(expense.id, {
      duplicate_check: JSON.stringify(duplicates)
    });
    console.log(`[DuplicateCheck] Found ${duplicates.length} potential duplicate(s) for expense #${expense.id}`);
  }

  // Log entity assignment status
  const entityStatus = expense.zoho_entity ? `assigned to ${expense.zoho_entity}` : 'unassigned';
  console.log(`[Zoho] Expense created (${entityStatus}). Entity can be assigned in Approvals page.`);

  // Log expense creation in audit trail
  await ExpenseAuditService.logChange(
    expense.id,
    req.user!.id,
    req.user!.username || 'Unknown User',
    'created',
    {
      merchant: { old: null, new: expense.merchant },
      amount: { old: null, new: expense.amount },
      date: { old: null, new: expense.date },
      category: { old: null, new: expense.category }
    }
  );

  // Include duplicate warnings in response
  const responseExpense = normalizeExpense(expense);
  if (duplicates.length > 0) {
    responseExpense.duplicateCheck = duplicates;
  }

  res.status(201).json(responseExpense);
}));

// Update expense
router.put('/:id', upload.single('receipt'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    event_id,
    category,
    merchant,
    amount,
    date,
    description,
    card_used,
    reimbursement_required,
    location,
    zoho_entity
  } = req.body;

  let receiptUrl = undefined;

  // Validate that user is a participant if changing event (unless admin/accountant/developer/coordinator)
  if (event_id && req.user!.role !== 'admin' && req.user!.role !== 'accountant' && req.user!.role !== 'developer' && req.user!.role !== 'coordinator') {
    const participantCheck = await query(
      `SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2`,
      [event_id, req.user!.id]
    );
    
    if (participantCheck.rows.length === 0) {
      throw new ValidationError('You can only assign expenses to events where you are a participant');
    }
  }

  // Use uploaded receipt if provided
  if (req.file) {
    receiptUrl = `/uploads/${req.file.filename}`;
  }

  // Get old expense data for audit trail
  const oldExpense = await expenseRepository.findById(id);
  if (!oldExpense) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  // Update expense using service layer (handles authorization)
  const expense = await expenseService.updateExpense(
    id,
    req.user!.id,
    req.user!.role,
    {
      eventId: event_id,
      date,
      merchant,
      amount: amount ? parseFloat(amount) : undefined,
      category,
      description,
      location,
      cardUsed: card_used,
      receiptUrl,
      reimbursementRequired: reimbursement_required !== undefined 
        ? (reimbursement_required === 'true' || reimbursement_required === true)
        : undefined,
      zohoEntity: zoho_entity
    }
  );

  // Log changes in audit trail
  if (oldExpense) {
    const changes = ExpenseAuditService.detectChanges(
      oldExpense,
      {
        merchant: expense.merchant,
        amount: expense.amount,
        date: expense.date,
        category: expense.category,
        description: expense.description,
        location: expense.location,
        card_used: expense.card_used,
        reimbursement_required: expense.reimbursement_required,
        zoho_entity: expense.zoho_entity
      },
      ['merchant', 'amount', 'date', 'category', 'description', 'location', 'card_used', 'reimbursement_required', 'zoho_entity']
    );

    if (Object.keys(changes).length > 0) {
      await ExpenseAuditService.logChange(
        id,
        req.user!.id,
        req.user!.username || 'Unknown User',
        'updated',
        changes
      );
    }
  }

  // Always check for potential duplicates on update (non-blocking - don't fail if column doesn't exist)
  try {
    const duplicates = await DuplicateDetectionService.checkForDuplicates(
      merchant || expense.merchant,
      amount ? parseFloat(amount) : expense.amount,
      date || expense.date,
      req.user!.id,
      id
    );

    // Only update duplicate_check if column exists (check first)
    const hasDuplicateCheckColumn = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'expenses' AND column_name = 'duplicate_check'`
    ).then(result => result.rows.length > 0).catch(() => false);

    if (hasDuplicateCheckColumn) {
      // Update expense with duplicate warnings (only if column exists)
      if (duplicates.length > 0) {
        await expenseRepository.update(id, {
          duplicate_check: JSON.stringify(duplicates)
        });
        console.log(`[DuplicateCheck] Found ${duplicates.length} potential duplicate(s) for expense #${id}`);
        (expense as any).duplicate_check = duplicates;
      } else {
        await expenseRepository.update(id, {
          duplicate_check: null
        });
      }
    } else {
      // Column doesn't exist - just include in response without updating database
      if (duplicates.length > 0) {
        console.log(`[DuplicateCheck] Found ${duplicates.length} potential duplicate(s) for expense #${id} (duplicate_check column not available)`);
        (expense as any).duplicate_check = duplicates;
      }
    }
  } catch (duplicateError: any) {
    // Non-blocking: If duplicate_check column doesn't exist or update fails, log but don't fail the request
    if (duplicateError?.message?.includes('duplicate_check') || duplicateError?.context?.originalMessage?.includes('duplicate_check')) {
      console.warn(`[DuplicateCheck] Skipping duplicate check update - column may not exist: ${duplicateError.message}`);
    } else {
      // Re-throw if it's a different error
      throw duplicateError;
    }
  }

  console.log(`Successfully updated expense ${id}`);
  res.json(normalizeExpense(expense));
}));

// ========== STATUS & WORKFLOW ENDPOINTS ==========
// Update expense status (pending/approved/rejected/needs further review)
router.patch('/:id/status', authorize('admin', 'accountant', 'developer'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'approved', 'rejected', 'needs further review'].includes(status)) {
    throw new ValidationError('Invalid status. Must be "pending", "approved", "rejected", or "needs further review"');
  }

  // Get old status for audit trail
  const oldExpense = await expenseRepository.findById(id);
  if (!oldExpense) {
    return res.status(404).json({ error: 'Expense not found' });
  }
  const oldStatus = oldExpense.status;

  // Update status using service layer
  const expense = await expenseService.updateExpenseStatus(
    id,
    status,
    req.user!.role
  );

  // Log status change in audit trail
  if (oldStatus && oldStatus !== status) {
    await ExpenseAuditService.logChange(
      id,
      req.user!.id,
      req.user!.username || 'Unknown User',
      'status_changed',
      {
        status: { old: oldStatus, new: status }
      }
    );
  }

  res.json(normalizeExpense(expense));
}));

// Approve/Reject expense (accountant/admin only) - LEGACY endpoint, kept for backwards compatibility
router.patch('/:id/review', authorize('admin', 'accountant', 'developer'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    throw new ValidationError('Invalid status. Must be "approved" or "rejected"');
  }

  // Update status using service layer
  const expense = await expenseService.updateExpenseStatus(
    id,
    status,
    req.user!.role
  );

  res.json(normalizeExpense(expense));
}));

// Assign Zoho entity (accountant only) - NO AUTO-PUSH
router.patch('/:id/entity', authorize('admin', 'accountant', 'developer'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { zoho_entity } = req.body;

  // Get old entity for audit trail
  const oldExpense = await expenseRepository.findById(id);
  if (!oldExpense) {
    return res.status(404).json({ error: 'Expense not found' });
  }
  const oldEntity = oldExpense.zoho_entity;

  // Assign entity using service layer
  const expense = await expenseService.assignZohoEntity(id, zoho_entity, req.user!.role);

  console.log(`[Entity Assignment] Entity "${zoho_entity}" assigned to expense ${id} (manual push required)`);

  // Log entity assignment in audit trail
  await ExpenseAuditService.logChange(
    id,
    req.user!.id,
    req.user!.username || 'Unknown User',
    'entity_assigned',
    {
      zoho_entity: { old: oldEntity || null, new: zoho_entity }
    }
  );

  // Check for potential duplicates (non-blocking - don't fail if column doesn't exist)
  try {
    const duplicates = await DuplicateDetectionService.checkForDuplicates(
      expense.merchant,
      expense.amount,
      expense.date,
      req.user!.id,
      id
    );

    // Only update duplicate_check if column exists (check first)
    const hasDuplicateCheckColumn = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'expenses' AND column_name = 'duplicate_check'`
    ).then(result => result.rows.length > 0).catch(() => false);

    if (hasDuplicateCheckColumn) {
      // Update expense with duplicate warnings (only if column exists)
      if (duplicates.length > 0) {
        await expenseRepository.update(id, {
          duplicate_check: JSON.stringify(duplicates)
        });
        console.log(`[DuplicateCheck] Found ${duplicates.length} potential duplicate(s) for expense #${id}`);
        (expense as any).duplicate_check = duplicates;
      } else {
        await expenseRepository.update(id, {
          duplicate_check: null
        });
      }
    } else {
      // Column doesn't exist - just include in response without updating database
      if (duplicates.length > 0) {
        console.log(`[DuplicateCheck] Found ${duplicates.length} potential duplicate(s) for expense #${id} (duplicate_check column not available)`);
        (expense as any).duplicate_check = duplicates;
      }
    }
  } catch (duplicateError: any) {
    // Non-blocking: If duplicate_check column doesn't exist or update fails, log but don't fail the request
    if (duplicateError?.message?.includes('duplicate_check') || duplicateError?.context?.originalMessage?.includes('duplicate_check')) {
      console.warn(`[DuplicateCheck] Skipping duplicate check update - column may not exist: ${duplicateError.message}`);
    } else {
      // Re-throw if it's a different error
      throw duplicateError;
    }
  }

  res.json(normalizeExpense(expense));
}));

// ========== ZOHO INTEGRATION ENDPOINTS ==========
// Manual push to Zoho Books (accountant/admin only)
router.post('/:id/push-to-zoho', authorize('admin', 'accountant', 'developer'), async (req: AuthRequest, res) => {
  try {
    console.log(`[Zoho:Push] User attempting push:`, {
      userId: req.user?.id,
      username: req.user?.username,
      role: req.user?.role,
      allowedRoles: ['admin', 'accountant', 'developer']
    });
    
    const { id } = req.params;

    // Get expense with full details
    const expense = await expenseRepository.findById(id);

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Check if already pushed to Zoho
    if (expense.zoho_expense_id) {
      return res.status(400).json({ 
        error: 'Expense already pushed to Zoho Books',
        zoho_expense_id: expense.zoho_expense_id
      });
    }

    // Check if entity is assigned
    if (!expense.zoho_entity) {
      return res.status(400).json({ 
        error: 'No entity assigned to this expense. Please assign an entity first.'
      });
    }

    // Check if entity has Zoho configuration
    if (!zohoIntegrationClient.isConfiguredForEntity(expense.zoho_entity)) {
      console.log(`[Zoho:Push] Entity "${expense.zoho_entity}" is not configured for Zoho integration`);
      return res.status(400).json({ 
        error: `Entity "${expense.zoho_entity}" does not have Zoho Books integration configured`
      });
    }

    // Get user and event details for Zoho submission
    const user = await userRepository.findById(expense.user_id);
    const event = await eventRepository.findById(expense.event_id);
    
    const userName = user?.name || 'Unknown User';
    const eventName = event?.name || undefined;
    const eventStartDate = event?.start_date || undefined;
    const eventEndDate = event?.end_date || undefined;

    // Prepare receipt file path (if exists)
    let receiptPath = undefined;
    if (expense.receipt_url) {
      const uploadDir = process.env.UPLOAD_DIR || 'uploads';
      receiptPath = path.join(uploadDir, path.basename(expense.receipt_url));
    }

    console.log(`[Zoho:ManualPush] Pushing expense ${id} to ${expense.zoho_entity} Zoho Books...`);

    // Submit to Zoho Books synchronously (wait for response)
    const zohoResult = await zohoIntegrationClient.createExpense(expense.zoho_entity, {
      expenseId: expense.id,
      date: expense.date,
      amount: expense.amount,
      category: expense.category,
      merchant: expense.merchant,
      description: expense.description || undefined,
      userName: userName,
      eventName: eventName,
      eventStartDate: eventStartDate,
      eventEndDate: eventEndDate,
      receiptPath: receiptPath,
      reimbursementRequired: expense.reimbursement_required,
      cardUsed: expense.card_used, // For payment account lookup
    });

    if (zohoResult.success) {
      const mode = zohoResult.mock ? 'MOCK' : 'REAL';
      console.log(`[Zoho:ManualPush:${mode}] Expense ${expense.id} submitted successfully. Zoho ID: ${zohoResult.zohoExpenseId}`);
      
      // Store Zoho expense ID in database
      if (zohoResult.zohoExpenseId) {
        await expenseRepository.updateZohoInfo(expense.id, zohoResult.zohoExpenseId);
      }

      // Log Zoho push in audit trail
      await ExpenseAuditService.logChange(
        expense.id,
        req.user!.id,
        req.user!.username || 'Unknown User',
        'pushed_to_zoho',
        {
          zoho_entity: { old: null, new: expense.zoho_entity },
          zoho_expense_id: { old: null, new: zohoResult.zohoExpenseId }
        }
      );

      // Return updated expense
      const updatedExpense = await expenseRepository.findById(id);
      return res.json({
        success: true,
        message: `Expense pushed to ${expense.zoho_entity} Zoho Books successfully`,
        zoho_expense_id: zohoResult.zohoExpenseId,
        expense: normalizeExpense(updatedExpense!)
      });
    } else {
      console.error(`[Zoho:ManualPush] Failed to submit expense ${expense.id}: ${zohoResult.error}`);
      return res.status(500).json({ 
        error: `Failed to push to Zoho Books: ${zohoResult.error}`
      });
    }
  } catch (error) {
    console.error('[Zoho:ManualPush] Error pushing expense to Zoho:', error);
    res.status(500).json({ error: 'Internal server error while pushing to Zoho Books' });
  }
});

// Reimbursement approval (accountant only)
router.patch('/:id/reimbursement', authorize('admin', 'accountant', 'developer'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reimbursement_status } = req.body;

  console.log(`[REIMBURSEMENT] Updating expense ${id} to status: "${reimbursement_status}"`);

  // Update reimbursement status using service layer
  const expense = await expenseService.updateReimbursementStatus(
    id,
    reimbursement_status,
    req.user!.role
  );

  console.log(`[REIMBURSEMENT] Successfully updated expense ${id} to status "${reimbursement_status}"`);
  res.json(normalizeExpense(expense));
}));

// Delete expense
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Get expense first to check receipt file
  const expense = await expenseService.getExpenseById(id);

  // Delete expense using service layer (handles authorization)
  await expenseService.deleteExpense(id, req.user!.id, req.user!.role);

  // Delete receipt file if exists
  if (expense.receipt_url) {
    const filePath = path.join(process.cwd(), expense.receipt_url);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`Deleted receipt file: ${filePath}`);
      } catch (fileError) {
        console.error(`Failed to delete receipt file: ${filePath}`, fileError);
        // Don't fail the request if file deletion fails
      }
    }
  }

  res.json({ message: 'Expense deleted successfully' });
}));

// ========== ZOHO BOOKS MULTI-ACCOUNT HEALTH CHECK ==========
// GET /zoho/health - Check Zoho Books integration status for all accounts
router.get('/zoho/health', authenticateToken, authorize('admin', 'accountant', 'developer'), async (req: AuthRequest, res) => {
  try {
    const healthStatus = await zohoIntegrationClient.getHealthStatus();
    const statusArray = Array.from(healthStatus.entries()).map(([entity, status]) => ({
      entity,
      ...status,
    }));

    const overallHealthy = statusArray.every(s => s.healthy);
    const realAccounts = statusArray.filter(s => !s.mock).length;
    const mockAccounts = statusArray.filter(s => s.mock).length;

    res.json({
      overall: {
        healthy: overallHealthy,
        totalAccounts: statusArray.length,
        realAccounts,
        mockAccounts,
      },
      accounts: statusArray,
    });
  } catch (error) {
    console.error('[Zoho:MultiAccount] Health check failed:', error);
    res.status(500).json({
      overall: { healthy: false, message: 'Health check failed' },
      error: String(error),
    });
  }
});

// GET /zoho/health/:entity - Check health for specific entity
router.get('/zoho/health/:entity', authenticateToken, authorize('admin', 'accountant', 'developer'), async (req: AuthRequest, res) => {
  try {
    const { entity } = req.params;
    const health = await zohoIntegrationClient.getHealthForEntity(entity);
    res.json(health);
  } catch (error) {
    console.error(`[Zoho:MultiAccount] Health check failed for ${req.params.entity}:`, error);
    res.status(500).json({
      configured: false,
      healthy: false,
      message: 'Health check failed',
      error: String(error),
    });
  }
});

// GET /zoho/accounts - Get available Zoho Books account names for configuration
router.get('/zoho/accounts', authenticateToken, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const accounts = await zohoIntegrationClient.getZohoAccountNames();
    res.json(accounts);
  } catch (error) {
    console.error('[Zoho:MultiAccount] Failed to fetch account names:', error);
    res.status(500).json({
      error: 'Failed to fetch Zoho Books account names',
      message: String(error),
    });
  }
});

// ========== AUDIT TRAIL ==========
// GET /api/expenses/:id/audit - Get audit trail for an expense (accountant/admin/developer only)
router.get('/:id/audit', authorize('admin', 'accountant', 'developer'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Verify expense exists and user has access
  const expense = await expenseService.getExpenseById(id);
  if (!expense) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  // Get audit trail
  const auditTrail = await ExpenseAuditService.getAuditTrail(id);

  res.json({
    expenseId: id,
    auditTrail
  });
}));

export default router;
