/**
 * Cross-Environment Sync Service
 * 
 * Syncs user corrections between sandbox and production environments
 * for unified training dataset creation
 */

import { query } from '../../config/database';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SyncReport {
  totalCorrections: number;
  byEnvironment: {
    sandbox: number;
    production: number;
  };
  syncedToTraining: number;
  readyForTraining: number;
  lastSyncTime: Date;
}

export class CrossEnvironmentSyncService {
  private trainingDataPath: string;

  constructor() {
    // Configure training data storage path
    this.trainingDataPath = process.env.TRAINING_DATA_PATH || '/opt/trade-show-app/training_data';
  }

  /**
   * Export corrections to unified training dataset
   */
  async exportToTrainingDataset(
    options: {
      minQualityScore?: number;
      includeSandbox?: boolean;
      includeProduction?: boolean;
      limit?: number;
    } = {}
  ): Promise<{
    exportPath: string;
    recordCount: number;
    datasetId: string;
  }> {
    const {
      minQualityScore = 0.7,
      includeSandbox = true,
      includeProduction = true,
      limit = 10000
    } = options;

    console.log('[Sync] Exporting corrections to training dataset...');

    // Build environment filter
    const envFilter: string[] = [];
    if (includeSandbox) envFilter.push('sandbox');
    if (includeProduction) envFilter.push('production');

    // Query training-ready corrections
    const result = await query(
      `SELECT 
        id,
        environment,
        ocr_text,
        original_inference,
        corrected_merchant,
        corrected_amount,
        corrected_date,
        corrected_category,
        fields_corrected,
        ocr_confidence,
        llm_model_version,
        created_at
       FROM ocr_corrections
       WHERE 
         used_in_training = FALSE
         AND environment = ANY($1::text[])
         AND (data_quality_score IS NULL OR data_quality_score >= $2)
         AND array_length(fields_corrected, 1) > 0
       ORDER BY created_at DESC
       LIMIT $3`,
      [envFilter, minQualityScore, limit]
    );

    const corrections = result.rows;
    console.log(`[Sync] Found ${corrections.length} corrections ready for training`);

    if (corrections.length === 0) {
      return {
        exportPath: '',
        recordCount: 0,
        datasetId: ''
      };
    }

    // Create dataset ID
    const datasetId = `dataset_${Date.now()}_${corrections.length}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportPath = path.join(this.trainingDataPath, `${datasetId}.jsonl`);

    // Ensure directory exists
    await fs.mkdir(this.trainingDataPath, { recursive: true });

    // Format corrections for training (JSONL format)
    const trainingData = corrections.map(correction => {
      const originalInference = typeof correction.original_inference === 'string' 
        ? JSON.parse(correction.original_inference)
        : correction.original_inference;

      return {
        id: correction.id,
        environment: correction.environment,
        input: {
          ocr_text: correction.ocr_text,
          original_inference: originalInference
        },
        corrections: {
          merchant: correction.corrected_merchant,
          amount: correction.corrected_amount,
          date: correction.corrected_date,
          category: correction.corrected_category
        },
        fields_corrected: correction.fields_corrected,
        metadata: {
          original_confidence: correction.ocr_confidence,
          llm_model_version: correction.llm_model_version,
          created_at: correction.created_at
        }
      };
    });

    // Write JSONL file
    const jsonlContent = trainingData.map(record => JSON.stringify(record)).join('\n');
    await fs.writeFile(exportPath, jsonlContent, 'utf-8');

    // Mark corrections as synced
    const correctionIds = corrections.map(c => c.id);
    await query(
      `UPDATE ocr_corrections
       SET synced_to_training = TRUE,
           sync_timestamp = NOW(),
           training_dataset_id = $1
       WHERE id = ANY($2::uuid[])`,
      [datasetId, correctionIds]
    );

    console.log(`[Sync] Exported ${corrections.length} corrections to ${exportPath}`);
    console.log(`[Sync] Dataset ID: ${datasetId}`);

    return {
      exportPath,
      recordCount: corrections.length,
      datasetId
    };
  }

  /**
   * Get sync status and statistics
   */
  async getSyncReport(): Promise<SyncReport> {
    const result = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE environment = 'sandbox') as sandbox_count,
        COUNT(*) FILTER (WHERE environment = 'production') as prod_count,
        COUNT(*) FILTER (WHERE synced_to_training = TRUE) as synced_count,
        COUNT(*) FILTER (WHERE used_in_training = FALSE) as ready_count,
        MAX(sync_timestamp) as last_sync
       FROM ocr_corrections`
    );

    const row = result.rows[0];

    return {
      totalCorrections: parseInt(row.total || '0'),
      byEnvironment: {
        sandbox: parseInt(row.sandbox_count || '0'),
        production: parseInt(row.prod_count || '0')
      },
      syncedToTraining: parseInt(row.synced_count || '0'),
      readyForTraining: parseInt(row.ready_count || '0'),
      lastSyncTime: row.last_sync || new Date(0)
    };
  }

  /**
   * Get corrections by dataset ID
   */
  async getDatasetCorrections(datasetId: string): Promise<any[]> {
    const result = await query(
      `SELECT * FROM ocr_corrections
       WHERE training_dataset_id = $1
       ORDER BY created_at DESC`,
      [datasetId]
    );

    return result.rows;
  }

  /**
   * Mark dataset as used in training
   */
  async markDatasetUsed(datasetId: string): Promise<number> {
    const result = await query(
      `UPDATE ocr_corrections
       SET used_in_training = TRUE
       WHERE training_dataset_id = $1
       RETURNING id`,
      [datasetId]
    );

    console.log(`[Sync] Marked ${result.rows.length} corrections as used in training (dataset: ${datasetId})`);
    return result.rows.length;
  }

  /**
   * Anonymize corrections for privacy
   */
  async anonymizeCorrections(correctionIds: string[]): Promise<void> {
    await query(
      `UPDATE ocr_corrections
       SET anonymized = TRUE,
           user_id = '00000000-0000-0000-0000-000000000000'::uuid
       WHERE id = ANY($1::uuid[])`,
      [correctionIds]
    );

    console.log(`[Sync] Anonymized ${correctionIds.length} corrections`);
  }
}

export const crossEnvironmentSyncService = new CrossEnvironmentSyncService();

