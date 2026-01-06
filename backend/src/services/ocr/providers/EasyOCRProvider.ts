/**
 * EasyOCR Provider
 * 
 * Modern OCR engine with high accuracy for receipt processing.
 * Replaces Tesseract and PaddleOCR with a more reliable solution.
 * 
 * Key advantages:
 * - Better accuracy on real-world receipts (80-90%)
 * - No AVX2 requirement (CPU compatible)
 * - Handles rotated/skewed text
 * - Supports 80+ languages
 * - Strong performance on complex layouts
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { OCRProvider, OCRResult } from '../types';

export class EasyOCRProvider implements OCRProvider {
  readonly name = 'easyocr';
  
  private pythonPath: string;
  private scriptPath: string;
  private languages: string[];
  private useGPU: boolean;
  
  constructor(options: {
    pythonPath?: string;
    languages?: string[];
    useGPU?: boolean;
  } = {}) {
    this.pythonPath = options.pythonPath || 'python3';
    this.languages = options.languages || ['en'];
    this.useGPU = options.useGPU || false;
    
    // Path to Python processor script
    this.scriptPath = path.join(__dirname, '..', 'easyocr_processor.py');
    
    console.log('[EasyOCR] Provider initialized', {
      pythonPath: this.pythonPath,
      languages: this.languages,
      useGPU: this.useGPU,
      scriptPath: this.scriptPath
    });
  }
  
  /**
   * Check if EasyOCR is available on the system
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if Python is available
      await this.executePython(['-c', 'import sys; print(sys.version)']);
      
      // Check if EasyOCR is installed
      await this.executePython(['-c', 'import easyocr; print(easyocr.__version__)']);
      
      // Check if script exists
      await fs.access(this.scriptPath);
      
      console.log('[EasyOCR] Provider is available');
      return true;
    } catch (error) {
      console.error('[EasyOCR] Provider not available:', error);
      return false;
    }
  }
  
  /**
   * Process image with EasyOCR
   */
  async process(imagePath: string): Promise<OCRResult> {
    const startTime = Date.now();
    
    try {
      console.log('[EasyOCR] Processing image:', imagePath);
      
      // Validate image exists
      await fs.access(imagePath);
      
      // Build command arguments
      const args = [
        this.scriptPath,
        imagePath,
        '--lang', this.languages.join(','),
        '--gpu', this.useGPU ? 'true' : 'false',
        '--preprocess', 'true'
      ];
      
      // Execute Python script
      const output = await this.executePython(args);
      
      // Parse JSON response
      const result = JSON.parse(output);
      
      // Handle error response
      if (!result.success) {
        throw new Error(result.error || 'EasyOCR processing failed');
      }
      
      const processingTime = Date.now() - startTime;
      
      // Map to OCRResult interface
      const ocrResult: OCRResult = {
        text: result.text || '',
        confidence: result.confidence || 0.0,
        provider: this.name,
        processingTime,
        metadata: {
          lineCount: result.line_count,
          detectionCount: result.metadata?.detection_count,
          preprocessed: result.metadata?.preprocessed,
          lines: result.lines || []
        }
      };
      
      console.log('[EasyOCR] Processing complete:', {
        textLength: ocrResult.text.length,
        confidence: ocrResult.confidence,
        processingTime: `${processingTime}ms`,
        lineCount: result.line_count
      });
      
      return ocrResult;
      
    } catch (error) {
      console.error('[EasyOCR] Processing error:', error);
      
      return {
        text: '',
        confidence: 0,
        provider: this.name,
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Process PDF with EasyOCR (multi-page support)
   */
  async processPDF(pdfPath: string, dpi: number = 300): Promise<OCRResult> {
    const startTime = Date.now();
    
    try {
      console.log('[EasyOCR] Processing PDF:', pdfPath);
      
      // Validate PDF exists
      await fs.access(pdfPath);
      
      // Path to PDF processor script
      const pdfScriptPath = path.join(__dirname, '..', 'pdf_processor.py');
      
      // Build command arguments
      const args = [
        pdfScriptPath,
        pdfPath,
        '--dpi', dpi.toString(),
        '--lang', this.languages.join(','),
        '--gpu', this.useGPU ? 'true' : 'false'
      ];
      
      // Execute Python script
      const output = await this.executePython(args);
      
      // Parse JSON response
      const result = JSON.parse(output);
      
      // Handle error response
      if (!result.success) {
        throw new Error(result.error || 'PDF processing failed');
      }
      
      const processingTime = Date.now() - startTime;
      
      // Map to OCRResult interface
      const ocrResult: OCRResult = {
        text: result.text || '',
        confidence: result.confidence || 0.0,
        provider: 'easyocr-pdf',
        processingTime,
        metadata: {
          pageCount: result.page_count,
          pages: result.pages || [],
          dpi: result.metadata?.dpi,
          languages: result.metadata?.languages
        }
      };
      
      console.log('[EasyOCR] PDF processing complete:', {
        textLength: ocrResult.text.length,
        confidence: ocrResult.confidence,
        processingTime: `${processingTime}ms`,
        pageCount: result.page_count
      });
      
      return ocrResult;
      
    } catch (error) {
      console.error('[EasyOCR] PDF processing error:', error);
      
      return {
        text: '',
        confidence: 0,
        provider: 'easyocr-pdf',
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Execute Python command and capture output
   */
  private executePython(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      // Set HOME environment for EasyOCR model cache
      // Disable CPU optimizations that require AVX2 (for older CPUs like Sandy Bridge)
      const env = {
        ...process.env,
        HOME: process.env.HOME || '/var/lib/trade-show-app',
        EASYOCR_MODULE_PATH: '/var/lib/trade-show-app/.EasyOCR',
        // Disable PyTorch optimizations that cause SIGILL on older CPUs
        MKL_THREADING_LAYER: 'GNU',
        MKL_SERVICE_FORCE_INTEL: '0',
        OMP_NUM_THREADS: '1',
        // Disable NNPACK (causes "Unsupported hardware" errors)
        PYTORCH_NNPACK_DISABLE: '1'
      };
      
      const python = spawn(this.pythonPath, args, { env });
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
      
      python.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    });
  }
}

