/**
 * Enhanced OCR API Routes (v2)
 * 
 * New OCR endpoints with field inference, confidence scores, and user corrections.
 * Backward compatible - legacy /ocr endpoint remains unchanged.
 * 
 * INTEGRATION: External OCR Service at http://192.168.1.195:8000
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../utils/errors';
import { userCorrectionService } from '../services/ocr/UserCorrectionService';
import { FieldWarningService } from '../services/ocr/FieldWarningService';
import { query } from '../config/database';
import { isAllowedReceiptFile } from '../config/upload';
import {
  checkExternalOcrReady,
  runExternalReceiptOcrWithCleanup,
} from '../services/ocr/receiptExternalOcr';

// External OCR Service configuration
const EXTERNAL_OCR_URL = process.env.OCR_SERVICE_URL || 'http://192.168.1.195:8000';
const OCR_TIMEOUT = parseInt(process.env.OCR_TIMEOUT || '120000'); // 2 minutes

const router = Router();

// Configure multer (same as legacy endpoint)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const { allowed, reason } = isAllowedReceiptFile(file.mimetype, file.originalname);
    if (allowed) {
      console.log(`[OCR v2 Upload] Accepting file: ${file.originalname} (mime: ${file.mimetype || 'none'})`);
      return cb(null, true);
    }
    console.warn(`[OCR v2 Upload] Rejected file: ${file.originalname} (${reason})`);
    cb(new Error(reason || 'Only images (JPEG, PNG, HEIC, WebP) and PDF files are allowed'));
  }
});

router.use(authenticateToken);

/**
 * POST /api/ocr/v2/process
 * 
 * Enhanced OCR processing with field inference and confidence scores
 * Routes to external OCR service with fallback to embedded OCR
 */
router.post('/process', upload.single('receipt'), asyncHandler(async (req: AuthRequest, res) => {
  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }

  const ext = path.extname(req.file.originalname || '').toLowerCase();
  const isPdf = ext === '.pdf' || (req.file.mimetype || '').toLowerCase().trim() === 'application/pdf';
  console.log(`[OCR v2] Processing receipt: ${req.file.filename} (originalname: ${req.file.originalname}, mime: ${req.file.mimetype || 'none'}, isPdf: ${isPdf})`);

  try {
    // Check if external OCR service is available
    const isHealthy = await checkExternalOcrReady();
    
    if (!isHealthy) {
      throw new Error('OCR service is currently unavailable. Please enter details manually.');
    }
    
    console.log('[OCR v2] Using external OCR service');
    
    // Call external OCR service (shared pipeline with Telegram: prep + rule-based enrichment)
    const result = await runExternalReceiptOcrWithCleanup(req.file.path);
    
    // Analyze fields for potential issues
    let fieldWarnings: any[] = [];
    if (result.fields) {
      // Convert external response to internal format for field warnings
      const inference = {
        merchant: result.fields.merchant || { value: null, confidence: 0, source: 'inference' },
        amount: result.fields.amount || { value: null, confidence: 0, source: 'inference' },
        date: result.fields.date || { value: null, confidence: 0, source: 'inference' },
        category: result.fields.category || { value: null, confidence: 0, source: 'inference' },
        cardLastFour: result.fields.cardLastFour || { value: null, confidence: 0, source: 'inference' },
        location: result.fields.location || null,
        taxAmount: result.fields.taxAmount || null,
        tipAmount: result.fields.tipAmount || null
      };
      
      fieldWarnings = FieldWarningService.analyzeFields(inference, result.ocr?.text || '');
    }
    
    // Add warnings to response
    result.warnings = fieldWarnings;
    
    console.log(`[OCR v2] External OCR success - Overall confidence: ${result.quality?.overallConfidence?.toFixed(2) || 'N/A'}`);
    
    // Add OCR provider to response headers for logging/tracking
    // This allows the API logger to differentiate between Google Vision and Tesseract
    const ocrProvider = result.ocr?.provider || 'unknown';
    res.setHeader('X-OCR-Provider', ocrProvider);
    console.log(`[OCR v2] OCR Provider used: ${ocrProvider}`);
    
    // Return external service response with receipt URL
    res.json({
      ...result,
      receiptUrl: `/uploads/${req.file.filename}` // Include receipt URL for frontend
    });
    
  } catch (error: any) {
    console.error('[OCR v2] Processing error:', error.message, { originalname: req.file.originalname, mimetype: req.file.mimetype });
    
    // Auth failures from the OCR service are a server misconfiguration
    // (missing/rotated X-Internal-Token) — never a user problem. Say so
    // plainly instead of hiding it behind a generic OCR failure.
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error(
        'OCR service rejected the request (authentication misconfigured). Please contact your administrator — receipt details can be entered manually.'
      );
    }

    // Note: upstream HTTP 500 is a service error, not a timeout — only
    // classify real timeouts here.
    const isTimeout = error.message?.includes('timeout') || error.code === 'ECONNABORTED';
    const isUnsupportedOrPdf = (error.message || '').toLowerCase().includes('pdf') ||
      (error.response?.data?.error || '').toLowerCase().includes('unsupported') ||
      (error.response?.data?.error || '').toLowerCase().includes('pdf') ||
      error.response?.status === 415;

    if (isTimeout) {
      throw new Error('OCR processing is taking too long. Please enter the receipt details manually.');
    }
    if (error.response?.status === 500) {
      throw new Error('The OCR service hit an internal error processing this receipt. Please try again or enter the details manually.');
    }
    if (isPdf && isUnsupportedOrPdf) {
      throw new Error('PDF could not be processed by OCR. You can still attach the receipt and enter the expense details manually.');
    }
    
    throw error;
  }
}));

/**
 * POST /api/ocr/v2/corrections
 * 
 * Submit user corrections for OCR results
 */
router.post('/corrections', asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new ValidationError('User ID required');
  }
  
  const {
    expenseId,
    originalOCRText,
    originalInference,
    correctedFields,
    receiptImagePath,
    notes
  } = req.body;
  
  // Validate required fields
  if (!originalOCRText || !originalInference || !correctedFields) {
    throw new ValidationError('Missing required fields: originalOCRText, originalInference, correctedFields');
  }
  
  // Check that at least one field was corrected
  const hasCorrectedField = Object.values(correctedFields).some(v => v !== undefined && v !== null);
  if (!hasCorrectedField) {
    throw new ValidationError('At least one corrected field must be provided');
  }
  
  console.log(`[OCR v2] Storing user correction from user ${userId}`);
  
  // Store correction
  const correctionId = await userCorrectionService.storeCorrection({
    expenseId,
    userId,
    originalOCRText,
    originalInference,
    correctedFields,
    receiptImagePath,
    notes,
    timestamp: new Date()
  });
  
  res.json({
    success: true,
    correctionId,
    message: 'Correction stored successfully'
  });
}));

/**
 * GET /api/ocr/v2/corrections/stats
 * 
 * Get correction statistics (admin/developer only)
 */
router.get('/corrections/stats', asyncHandler(async (req: AuthRequest, res) => {
  const userRole = req.user?.role;
  
  if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Admin or developer access required' });
  }
  
  const stats = await userCorrectionService.getCorrectionStats();
  
  res.json({
    success: true,
    stats
  });
}));

/**
 * GET /api/ocr/v2/corrections/export
 * 
 * Export corrections for ML training (admin/developer only)
 */
router.get('/corrections/export', asyncHandler(async (req: AuthRequest, res) => {
  const userRole = req.user?.role;
  
  if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Admin or developer access required' });
  }
  
  const { startDate, endDate } = req.query;
  
  const corrections = await userCorrectionService.exportCorrectionsForTraining(
    startDate ? new Date(startDate as string) : undefined,
    endDate ? new Date(endDate as string) : undefined
  );
  
  res.json({
    success: true,
    count: corrections.length,
    corrections
  });
}));

/**
 * GET /api/ocr/v2/config
 * 
 * Get current OCR service configuration (developer only)
 */
router.get('/config', asyncHandler(async (req: AuthRequest, res) => {
  const userRole = req.user?.role;
  
  if (userRole !== 'developer') {
    return res.status(403).json({ error: 'Developer access required' });
  }
  
  const config = {
    type: 'external',
    ocrServiceUrl: EXTERNAL_OCR_URL,
    timeout: OCR_TIMEOUT,
    dataPoolUrl: process.env.DATA_POOL_URL || 'http://192.168.1.196:5000',
    dataPoolEnabled: process.env.SEND_TO_DATA_POOL !== 'false'
  };
  
  res.json({
    success: true,
    config
  });
}));

/**
 * GET /api/ocr/v2/accuracy
 * 
 * Get historical accuracy metrics for OCR fields (admin/developer only)
 */
router.get('/accuracy', asyncHandler(async (req: AuthRequest, res) => {
  const userRole = req.user?.role;
  
  if (userRole !== 'admin' && userRole !== 'developer') {
    return res.status(403).json({ error: 'Admin or developer access required' });
  }
  
  const { field, days } = req.query;
  const daysBack = parseInt(days as string || '30');
  
  // Calculate accuracy based on corrections vs total OCR attempts
  // Map field names to database columns
  const fieldMapping: { [key: string]: string } = {
    'merchant': 'corrected_merchant',
    'amount': 'corrected_amount',
    'date': 'corrected_date',
    'category': 'corrected_category',
    'cardLastFour': 'corrected_card_last_four'
  };
  
  const fields = field ? [field as string] : ['merchant', 'amount', 'date', 'category', 'cardLastFour'];
  
  // First, get the total number of OCR correction sessions (unique correction records)
  const totalCorrectionsResult = await query(`
    SELECT COUNT(*) as total_sessions
    FROM ocr_corrections
    WHERE created_at >= NOW() - INTERVAL '${daysBack} days'
  `);
  
  const totalExtractions = parseInt(totalCorrectionsResult.rows[0]?.total_sessions || '0');
  
  const accuracyData = await Promise.all(
    fields.map(async (f) => {
      const dbColumn = fieldMapping[f];
      
      // Count how many times this field was corrected
      const correctionResult = await query(`
        SELECT COUNT(*) as correction_count
        FROM ocr_corrections
        WHERE ${dbColumn} IS NOT NULL
          AND created_at >= NOW() - INTERVAL '${daysBack} days'
      `);
      
      const correctionCount = parseInt(correctionResult.rows[0]?.correction_count || '0');
      
      // Accuracy = (total OCR sessions - field corrections) / total sessions * 100
      // If a field was NOT corrected, we assume it was correct
      const accuracyRate = totalExtractions > 0
        ? ((totalExtractions - correctionCount) / totalExtractions) * 100
        : 100;
      
      return {
        field: f,
        totalExtractions,
        correctionCount,
        accuracyRate,
        commonIssues: []
      };
    })
  );
  
  if (field) {
    const result = accuracyData[0];
    return res.json({
      success: true,
      daysBack,
      totalExtractions: result.totalExtractions,
      correctionCount: result.correctionCount,
      accuracyRate: result.accuracyRate,
      commonIssues: result.commonIssues
    });
  }
  
  res.json({
    success: true,
    daysBack,
    fields: accuracyData
  });
}));

export default router;

