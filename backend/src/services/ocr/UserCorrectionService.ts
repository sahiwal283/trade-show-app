/**
 * User Correction Service
 * 
 * Handles storage and retrieval of user corrections to OCR inferences.
 * Used for continuous learning and accuracy improvement.
 * 
 * INTEGRATION: Sends corrections to Data Pool at http://192.168.1.196:5000
 */

import { query } from '../../config/database';
import { UserCorrection, FieldInference } from './types';
import axios from 'axios';
import crypto from 'crypto';

// Data Pool configuration
const DATA_POOL_URL = process.env.DATA_POOL_URL || 'http://192.168.1.196:5000';
const DATA_POOL_API_KEY = process.env.DATA_POOL_API_KEY || 'dp_live_edb8db992bc7bdb3f4b895c976df4acf';
const SEND_TO_DATA_POOL = process.env.SEND_TO_DATA_POOL !== 'false'; // Default: true

export class UserCorrectionService {
  /**
   * Check if Data Pool service is available
   */
  private async checkDataPoolHealth(): Promise<boolean> {
    if (!SEND_TO_DATA_POOL) return false;
    
    try {
      const response = await axios.get(`${DATA_POOL_URL}/health`, { timeout: 3000 });
      return response.status === 200 && response.data.database === true;
    } catch (error) {
      console.warn('[DataPool] Health check failed:', (error as any).message);
      return false;
    }
  }
  
  /**
   * Send correction to Data Pool
   */
  private async sendToDataPool(correction: UserCorrection, correctionId: string, environment: string): Promise<void> {
    try {
      // Get OCR provider
      const inference: any = correction.originalInference;
      const ocrProvider = inference?.provider || 'tesseract';
      
      // Calculate overall confidence
      const ocrConfidence = this.calculateAverageConfidence(correction.originalInference);
      
      // Prepare request body
      // Note: Data Pool will hash user_id automatically - we send unhashed
      const requestBody = {
        source_app: 'trade-show-app',
        source_environment: environment,
        user_id: correction.userId, // Data Pool hashes this automatically
        ocr_provider: ocrProvider,
        ocr_text: correction.originalOCRText,
        ocr_confidence: ocrConfidence,
        original_inference: correction.originalInference,
        corrected_fields: {
          merchant: correction.correctedFields.merchant || undefined,
          amount: correction.correctedFields.amount !== undefined ? correction.correctedFields.amount : undefined,
          date: correction.correctedFields.date || undefined,
          category: correction.correctedFields.category || undefined,
          cardLastFour: correction.correctedFields.cardLastFour || undefined
        }
      };
      
      // Send to Data Pool
      const response = await axios.post(
        `${DATA_POOL_URL}/corrections/ingest`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DATA_POOL_API_KEY}`
          },
          timeout: 10000
        }
      );
      
      if (response.status === 200 || response.status === 201) {
        console.log(`[DataPool] Correction ${correctionId} sent successfully (quality: ${response.data.quality_score || 'N/A'})`);
      }
      
    } catch (error: any) {
      console.error('[DataPool] Failed to send correction:', error.message);
      if (error.response) {
        console.error('[DataPool] Response status:', error.response.status);
        console.error('[DataPool] Response data:', JSON.stringify(error.response.data, null, 2));
      }
      // Don't throw - we've already saved locally, Data Pool failure shouldn't block user
    }
  }
  
  /**
   * Store a user correction (and send to Data Pool)
   */
  async storeCorrection(correction: UserCorrection): Promise<string> {
    const fieldsCorrect = [];
    
    if (correction.correctedFields.merchant) fieldsCorrect.push('merchant');
    if (correction.correctedFields.amount !== undefined) fieldsCorrect.push('amount');
    if (correction.correctedFields.date) fieldsCorrect.push('date');
    if (correction.correctedFields.cardLastFour) fieldsCorrect.push('cardLastFour');
    if (correction.correctedFields.category) fieldsCorrect.push('category');
    
    // Determine environment (sandbox vs production)
    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
    
    // Extract confidence scores from original inference
    const inference: any = correction.originalInference;
    const originalConfidence = inference?.overallConfidence || 
                                this.calculateAverageConfidence(correction.originalInference);
    
    // Get OCR provider from inference metadata
    const ocrProvider = inference?.provider || 'paddleocr';
    
    // Get LLM model version if available
    const llmModelVersion = process.env.OLLAMA_MODEL || null;
    
    const result = await query(
      `INSERT INTO ocr_corrections (
        expense_id,
        user_id,
        ocr_provider,
        ocr_text,
        ocr_confidence,
        original_inference,
        corrected_merchant,
        corrected_amount,
        corrected_date,
        corrected_card_last_four,
        corrected_category,
        receipt_image_path,
        correction_notes,
        fields_corrected,
        environment,
        llm_model_version,
        correction_confidence_before,
        source_expense_environment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id`,
      [
        correction.expenseId || null,
        correction.userId,
        ocrProvider,
        correction.originalOCRText,
        originalConfidence,
        JSON.stringify(correction.originalInference),
        correction.correctedFields.merchant || null,
        correction.correctedFields.amount || null,
        correction.correctedFields.date || null,
        correction.correctedFields.cardLastFour || null,
        correction.correctedFields.category || null,
        correction.receiptImagePath || null,
        correction.notes || null,
        fieldsCorrect,
        environment,
        llmModelVersion,
        originalConfidence,
        environment
      ]
    );
    
    const correctionId = result.rows[0].id;
    console.log(`[UserCorrection] Stored correction ${correctionId} in ${environment} with ${fieldsCorrect.length} field(s) corrected`);
    
    // Send to Data Pool (async, non-blocking)
    if (SEND_TO_DATA_POOL) {
      const isHealthy = await this.checkDataPoolHealth();
      if (isHealthy) {
        // Fire and forget - don't wait for Data Pool response
        this.sendToDataPool(correction, correctionId, environment).catch(err => {
          console.error('[DataPool] Error sending correction:', err.message);
        });
      } else {
        console.warn('[DataPool] Service unavailable, correction stored locally only');
      }
    }
    
    return correctionId;
  }

  /**
   * Calculate average confidence from inference object
   */
  private calculateAverageConfidence(inference: any): number {
    if (!inference) return 0;
    
    const fields = ['merchant', 'amount', 'date', 'category', 'location'];
    const confidences: number[] = [];
    
    fields.forEach(field => {
      if (inference[field]?.confidence !== undefined) {
        confidences.push(inference[field].confidence);
      }
    });
    
    if (confidences.length === 0) return 0;
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }
  
  /**
   * Get corrections by user
   */
  async getCorrectionsByUser(userId: string, limit: number = 100): Promise<any[]> {
    const result = await query(
      `SELECT * FROM ocr_corrections
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }
  
  /**
   * Get corrections by expense
   */
  async getCorrectionsByExpense(expenseId: string): Promise<any[]> {
    const result = await query(
      `SELECT * FROM ocr_corrections
       WHERE expense_id = $1
       ORDER BY created_at DESC`,
      [expenseId]
    );
    
    return result.rows;
  }
  
  /**
   * Get correction statistics for analytics
   */
  async getCorrectionStats(): Promise<{
    totalCorrections: number;
    byField: { [field: string]: number };
    avgConfidenceWhenCorrected: number;
  }> {
    // Total corrections
    const totalResult = await query('SELECT COUNT(*) as count FROM ocr_corrections');
    const totalCorrections = parseInt(totalResult.rows[0].count);
    
    // By field
    const fieldResult = await query(`
      SELECT 
        unnest(fields_corrected) as field,
        COUNT(*) as count
      FROM ocr_corrections
      GROUP BY field
      ORDER BY count DESC
    `);
    
    const byField: { [field: string]: number } = {};
    fieldResult.rows.forEach(row => {
      byField[row.field] = parseInt(row.count);
    });
    
    // Average OCR confidence when corrections were needed
    const avgResult = await query(
      'SELECT AVG(ocr_confidence) as avg FROM ocr_corrections'
    );
    const avgConfidenceWhenCorrected = parseFloat(avgResult.rows[0].avg) || 0;
    
    return {
      totalCorrections,
      byField,
      avgConfidenceWhenCorrected
    };
  }
  
  /**
   * Get corrections for ML training export
   * Returns data in format suitable for model retraining
   */
  async exportCorrectionsForTraining(startDate?: Date, endDate?: Date): Promise<any[]> {
    let sql = `
      SELECT 
        ocr_text,
        ocr_confidence,
        original_inference,
        corrected_merchant,
        corrected_amount,
        corrected_date,
        corrected_card_last_four,
        corrected_category,
        fields_corrected,
        created_at
      FROM ocr_corrections
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (startDate) {
      params.push(startDate);
      sql += ` AND created_at >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      sql += ` AND created_at <= $${params.length}`;
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await query(sql, params);
    
    return result.rows.map(row => ({
      input: row.ocr_text,
      originalPredictions: row.original_inference,
      corrections: {
        merchant: row.corrected_merchant,
        amount: row.corrected_amount,
        date: row.corrected_date,
        cardLastFour: row.corrected_card_last_four,
        category: row.corrected_category
      },
      fieldsCorrected: row.fields_corrected,
      metadata: {
        ocrConfidence: row.ocr_confidence,
        timestamp: row.created_at
      }
    }));
  }
}

// Export singleton
export const userCorrectionService = new UserCorrectionService();

