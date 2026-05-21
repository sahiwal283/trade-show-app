# Expense App Integration Guide

This document provides instructions for integrating the OCR Microservice with the Expense App.

## Overview

The OCR functionality has been extracted from the Expense App into a standalone microservice. The Expense App will now make HTTP requests to the OCR service instead of processing OCR locally.

## Integration Steps

### 1. Update Environment Variables

Add the following environment variable to the Expense App backend:

```bash
# .env or environment configuration
OCR_BASE_URL=http://localhost:8000
# For production:
# OCR_BASE_URL=http://<ocr-host>:8000
```

### 2. Create OCR Client Module

Create a new file: `backend/src/services/OCRClient.ts`

```typescript
/**
 * OCR Microservice Client
 * 
 * Handles communication with the standalone OCR service
 */

import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import fs from 'fs';

export interface OCRResponse {
  success: boolean;
  ocr: {
    text: string;
    confidence: number;
    provider: string;
    processingTime?: number;
  };
  fields: {
    merchant: { value: string | null; confidence: number; source: string };
    amount: { value: number | null; confidence: number; source: string };
    date: { value: string | null; confidence: number; source: string };
    cardLastFour: { value: string | null; confidence: number; source: string };
    category: { value: string | null; confidence: number; source: string };
    location?: { value: string | null; confidence: number; source: string };
    taxAmount?: { value: number | null; confidence: number; source: string };
    tipAmount?: { value: number | null; confidence: number; source: string };
  };
  categories: Array<{
    category: string;
    confidence: number;
    keywords: string[];
    source: string;
  }>;
  quality: {
    overallConfidence: number;
    needsReview: boolean;
    reviewReasons?: string[];
  };
}

export class OCRClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || process.env.OCR_BASE_URL || 'http://localhost:8000';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 120000, // 2 minutes timeout for OCR processing
      headers: {
        'User-Agent': 'ExpenseApp/1.0'
      }
    });

    console.log('[OCRClient] Initialized with base URL:', this.baseURL);
  }

  /**
   * Check OCR service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'ok';
    } catch (error) {
      console.error('[OCRClient] Health check failed:', error);
      return false;
    }
  }

  /**
   * Process receipt image with OCR
   */
  async processReceipt(filePath: string): Promise<OCRResponse> {
    try {
      console.log('[OCRClient] Processing receipt:', filePath);

      // Create form data with file
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));

      // Send request
      const response = await this.client.post<OCRResponse>('/ocr/', formData, {
        headers: {
          ...formData.getHeaders()
        }
      });

      console.log('[OCRClient] OCR complete:', {
        confidence: response.data.ocr.confidence,
        needsReview: response.data.quality.needsReview
      });

      return response.data;

    } catch (error: any) {
      console.error('[OCRClient] Processing error:', error.message);
      
      // Return error response in expected format
      return {
        success: false,
        ocr: {
          text: '',
          confidence: 0,
          provider: 'error',
          processingTime: 0
        },
        fields: {
          merchant: { value: null, confidence: 0, source: 'error' },
          amount: { value: null, confidence: 0, source: 'error' },
          date: { value: null, confidence: 0, source: 'error' },
          cardLastFour: { value: null, confidence: 0, source: 'error' },
          category: { value: null, confidence: 0, source: 'error' }
        },
        categories: [],
        quality: {
          overallConfidence: 0,
          needsReview: true,
          reviewReasons: ['OCR service error: ' + error.message]
        }
      };
    }
  }

  /**
   * Get OCR provider information
   */
  async getProviders(): Promise<any> {
    try {
      const response = await this.client.get('/ocr/providers');
      return response.data;
    } catch (error) {
      console.error('[OCRClient] Failed to get providers:', error);
      return null;
    }
  }
}

// Export singleton instance
export const ocrClient = new OCRClient();
```

### 3. Update OCR Route Handler

Update `backend/src/routes/ocrV2.ts` to use the new OCR client:

```typescript
// At the top of the file, add:
import { ocrClient } from '../services/OCRClient';

// Replace the OCR processing logic in the /process endpoint:
router.post('/process', upload.single('receipt'), asyncHandler(async (req: AuthRequest, res) => {
  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }

  console.log(`[OCR v2] Processing receipt: ${req.file.filename}`);

  try {
    // Call OCR microservice
    const result = await ocrClient.processReceipt(req.file.path);
    
    // The OCR microservice returns data in the same format,
    // so we can directly use it
    const response = {
      success: result.success,
      ocr: result.ocr,
      fields: result.fields,
      categories: result.categories,
      quality: result.quality,
      warnings: [], // Can add warnings logic if needed
      receiptUrl: `/uploads/${req.file.filename}`
    };
    
    console.log(`[OCR v2] Success - Overall confidence: ${result.quality.overallConfidence.toFixed(2)}`);
    console.log(`[OCR v2] Needs review: ${result.quality.needsReview}`);
    
    res.json(response);
    
  } catch (error: any) {
    console.error('[OCR v2] Processing error:', error.message);
    
    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    throw error;
  }
}));
```

### 4. Update Package Dependencies

Ensure the Expense App has the required dependencies:

```bash
cd backend
npm install axios form-data
# or
yarn add axios form-data
```

### 5. Environment Configuration

Update environment files:

**Development (.env.development):**
```bash
OCR_BASE_URL=http://localhost:8000
```

**Production (.env.production):**
```bash
OCR_BASE_URL=http://<ocr-host>:8000
```

**Sandbox (.env.sandbox):**
```bash
OCR_BASE_URL=http://sandbox-ocr:8000
```

### 6. Docker Compose Integration (Optional)

If running both services with Docker Compose, update `docker-compose.yml`:

```yaml
version: "3.9"

services:
  # Expense App backend
  backend:
    # ... existing config
    environment:
      - OCR_BASE_URL=http://ocr_service:8000
    depends_on:
      - ocr_service

  # OCR Microservice
  ocr_service:
    image: ocr-service:0.1.0
    container_name: ocr_service
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
      - PRIMARY_OCR_PROVIDER=tesseract
```

## Migration Checklist

- [ ] Deploy OCR microservice to server
- [ ] Verify OCR service is accessible from Expense App
- [ ] Add OCR_BASE_URL environment variable
- [ ] Create OCRClient.ts module
- [ ] Update ocrV2.ts route handler
- [ ] Install new dependencies (axios, form-data)
- [ ] Test OCR processing in development
- [ ] Test OCR processing in production
- [ ] Monitor OCR service logs
- [ ] Verify backward compatibility

## Backward Compatibility

### Phase 1: Parallel Operation (Recommended)

Keep the old OCR code temporarily and add a feature flag:

```typescript
const USE_OCR_SERVICE = process.env.USE_OCR_SERVICE === 'true';

if (USE_OCR_SERVICE) {
  // Use new OCR microservice
  result = await ocrClient.processReceipt(req.file.path);
} else {
  // Use old OCR service (fallback)
  result = await ocrService.processReceipt(req.file.path);
}
```

### Phase 2: Full Migration

After verifying the microservice works correctly:

1. Remove feature flag
2. Remove old OCR service code
3. Remove old OCR dependencies from package.json
4. Clean up old OCR processor scripts

## Rollback Plan

If issues occur:

1. **Immediate**: Set `USE_OCR_SERVICE=false` in environment
2. **Short-term**: Restart Expense App backend
3. **Long-term**: Fix OCR microservice and redeploy

## Testing

### Unit Tests

```typescript
import { OCRClient } from '../services/OCRClient';

describe('OCRClient', () => {
  let client: OCRClient;

  beforeAll(() => {
    client = new OCRClient('http://localhost:8000');
  });

  it('should check health', async () => {
    const healthy = await client.healthCheck();
    expect(healthy).toBe(true);
  });

  it('should process receipt', async () => {
    const result = await client.processReceipt('./test-receipt.jpg');
    expect(result.success).toBe(true);
    expect(result.ocr.text).toBeTruthy();
  });
});
```

### Integration Tests

```bash
# Start OCR service
cd ~/Work/shared/ocrService
docker-compose up -d

# Test from Expense App
curl -X POST http://localhost:8000/ocr/ \
  -F "file=@test-receipt.jpg"

# Test Expense App endpoint (should use OCR service)
curl -X POST http://localhost:3001/api/ocr/v2/process \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "receipt=@test-receipt.jpg"
```

## Monitoring

### Health Checks

Add periodic health checks in Expense App:

```typescript
// Check OCR service on startup
app.on('ready', async () => {
  const healthy = await ocrClient.healthCheck();
  if (!healthy) {
    console.warn('[ExpenseApp] OCR service is not available');
  }
});
```

### Logging

Log OCR requests for monitoring:

```typescript
// Before OCR call
logger.info('OCR request', { 
  file: req.file.filename, 
  userId: req.user.id 
});

// After OCR call
logger.info('OCR response', { 
  confidence: result.ocr.confidence,
  needsReview: result.quality.needsReview,
  processingTime: result.ocr.processingTime
});
```

### Metrics

Track key metrics:
- OCR request count
- Average processing time
- Success/failure rate
- Average confidence score

## Troubleshooting

### OCR Service Unreachable

**Symptom**: Connection refused or timeout errors

**Solutions**:
1. Verify OCR service is running: `docker ps | grep ocr`
2. Check OCR service logs: `docker logs ocr_service`
3. Verify network connectivity: `curl http://<ocr-host>:8000/health`
4. Check firewall rules

### Low OCR Confidence

**Symptom**: Many receipts flagged for review

**Solutions**:
1. Switch to EasyOCR provider: `PRIMARY_OCR_PROVIDER=easyocr`
2. Enable fallback provider: `FALLBACK_OCR_PROVIDER=easyocr`
3. Adjust confidence threshold: `OCR_CONFIDENCE_THRESHOLD=0.5`

### Slow Processing

**Symptom**: OCR requests timing out

**Solutions**:
1. Increase timeout: `client.timeout = 180000`
2. Reduce image size before upload
3. Scale OCR service horizontally
4. Check server resources (CPU/RAM)

## Support

For issues or questions:
- Check OCR service logs: `docker logs -f ocr_service`
- Check Expense App logs
- Review OCR service README.md
- Contact development team

